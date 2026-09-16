import Foundation

/// Exponential backoff for upload retries within a single run.
public struct RetryPolicy: Equatable, Sendable {
    public var maxAttempts: Int
    public var baseDelay: TimeInterval
    public var maxDelay: TimeInterval

    public init(maxAttempts: Int = 4, baseDelay: TimeInterval = 2, maxDelay: TimeInterval = 60) {
        self.maxAttempts = max(1, maxAttempts)
        self.baseDelay = baseDelay
        self.maxDelay = maxDelay
    }

    /// Delay before retry number `attempt` (1-based: the delay after the first failure is attempt 1).
    public func delay(afterAttempt attempt: Int) -> TimeInterval {
        min(maxDelay, baseDelay * pow(2, Double(max(0, attempt - 1))))
    }
}

/// Phone-side upload queue: PendingUploads → presigned PUT → confirm → delete → ack the watch.
///
/// Each swim goes through `POST /swims/{id}/upload-url`, `PUT` to S3, `POST /swims/{id}`. Only a
/// confirmed swim is deleted locally and acknowledged. Every step is safe to repeat, so a crash or
/// a duplicate transfer just means the swim is uploaded again.
public actor SwimUploader {
    public enum Outcome: Equatable, Sendable {
        case uploaded
        /// No valid session: the swim stays queued until the user signs in.
        case waitingForSignIn
        /// The backend says the swim is invalid; it's parked in the rejected store.
        case rejected(String?)
        /// Still failing after all retries; it stays queued for the next run.
        case failed(String)
    }

    public typealias Acknowledge = @Sendable (String) -> Void
    public typealias Sleep = @Sendable (TimeInterval) async throws -> Void

    private let pending: PendingSwimStore
    private let rejected: PendingSwimStore
    private let api: SwimUploadAPI
    private let acknowledge: Acknowledge
    private let retryPolicy: RetryPolicy
    private let sleep: Sleep

    private var isRunning = false
    private var rerunRequested = false

    public init(pending: PendingSwimStore, rejected: PendingSwimStore, api: SwimUploadAPI,
                retryPolicy: RetryPolicy = RetryPolicy(),
                sleep: @escaping Sleep = { try await Task.sleep(nanoseconds: UInt64($0 * 1_000_000_000)) },
                acknowledge: @escaping Acknowledge) {
        self.pending = pending
        self.rejected = rejected
        self.api = api
        self.retryPolicy = retryPolicy
        self.sleep = sleep
        self.acknowledge = acknowledge
    }

    /// Uploads everything pending. If a run is already in progress, another pass is scheduled
    /// after it rather than running two concurrently. Returns the outcomes of this call's pass(es);
    /// empty when it merely scheduled a rerun.
    @discardableResult
    public func uploadPending() async -> [String: Outcome] {
        if isRunning {
            rerunRequested = true
            return [:]
        }
        isRunning = true
        defer { isRunning = false }

        var outcomes: [String: Outcome] = [:]
        repeat {
            rerunRequested = false
            for swimId in pending.swimIds() {
                let outcome = await upload(swimId)
                outcomes[swimId] = outcome
                if outcome == .waitingForSignIn { return outcomes }
            }
        } while rerunRequested
        return outcomes
    }

    func upload(_ swimId: String) async -> Outcome {
        var attempt = 0
        while true {
            attempt += 1
            do {
                let data = try pending.data(for: swimId)
                let target = try await api.requestUploadURL(swimId: swimId)
                guard let url = URL(string: target.uploadUrl) else { throw LapcatAPIError.invalidResponse }
                try await api.upload(swimJSON: data, to: url)
                _ = try await api.confirm(swimId: swimId)
                try? pending.delete(swimId)
                acknowledge(swimId)
                return .uploaded
            } catch let error as LapcatAPIError {
                switch error {
                case .notAuthenticated, .unauthorised:
                    return .waitingForSignIn
                case .invalidSwim(let detail):
                    try? pending.move(swimId, to: rejected)
                    return .rejected(detail)
                default:
                    if !error.isTransient || attempt >= retryPolicy.maxAttempts {
                        return .failed(error.localizedDescription)
                    }
                }
            } catch {
                // File vanished (already uploaded by a concurrent pass): nothing left to do.
                if !pending.contains(swimId) { return .uploaded }
                // Transport errors (offline, timeouts) are worth retrying.
                if attempt >= retryPolicy.maxAttempts { return .failed(error.localizedDescription) }
            }
            do {
                try await sleep(retryPolicy.delay(afterAttempt: attempt))
            } catch {
                return .failed("Cancelled")
            }
        }
    }
}
