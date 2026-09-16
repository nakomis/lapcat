import Foundation
import LapcatShared
import WatchConnectivity

/// Receives swims from the watch, uploads them, and acknowledges confirmed uploads back.
///
/// Uploads run on launch, on foreground, after sign-in and whenever a swim arrives. A run whose
/// swims still fail after the uploader's in-run backoff schedules one more attempt later.
@MainActor
final class PhoneSyncService: NSObject, ObservableObject {
    @Published private(set) var pendingCount = 0
    @Published private(set) var rejectedCount = 0
    @Published private(set) var isUploading = false
    @Published private(set) var lastError: String?

    private let inbox: PhoneInbox
    private let uploader: SwimUploader
    private var retryTask: Task<Void, Never>?

    static let laterRetryDelay: TimeInterval = 5 * 60

    init(api: SwimUploadAPI) {
        let pending = PendingSwimStore.applicationSupport(SyncKeys.phonePendingDirectory)
        let rejected = PendingSwimStore.applicationSupport(SyncKeys.phoneRejectedDirectory)
        inbox = PhoneInbox(pending: pending, rejected: rejected)
        uploader = SwimUploader(pending: pending, rejected: rejected, api: api) { swimId in
            PhoneSyncService.sendAck(swimId: swimId)
        }
        super.init()
        refreshCounts()
    }

    func activate() {
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    func uploadPending() {
        Task {
            isUploading = true
            let outcomes = await uploader.uploadPending()
            isUploading = false
            refreshCounts()

            let failures = outcomes.values.compactMap { outcome -> String? in
                if case .failed(let message) = outcome { return message }
                return nil
            }
            lastError = failures.first
            if !failures.isEmpty { scheduleLaterRetry() }
        }
    }

    private func scheduleLaterRetry() {
        retryTask?.cancel()
        retryTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(Self.laterRetryDelay * 1_000_000_000))
            guard !Task.isCancelled else { return }
            self?.uploadPending()
        }
    }

    private func refreshCounts() {
        pendingCount = inbox.pending.count
        rejectedCount = inbox.rejected.count
    }

    /// `transferUserInfo` is queued and delivered reliably, even if the watch app isn't running.
    /// If the session isn't activated yet, the ack is remembered and flushed on activation.
    nonisolated static func sendAck(swimId: String) {
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        guard session.activationState == .activated else {
            PendingAcks.add(swimId)
            return
        }
        session.transferUserInfo(SyncMessages.ack(swimId: swimId))
    }

    nonisolated static func flushPendingAcks(_ session: WCSession) {
        guard session.activationState == .activated else { return }
        for swimId in PendingAcks.drain() {
            session.transferUserInfo(SyncMessages.ack(swimId: swimId))
        }
    }
}

/// Acks produced before WatchConnectivity activated. Duplicate acks are harmless on the watch.
enum PendingAcks {
    private static let key = "pendingAcks"
    private static let lock = NSLock()

    static func add(_ swimId: String) {
        lock.lock(); defer { lock.unlock() }
        var ids = UserDefaults.standard.stringArray(forKey: key) ?? []
        if !ids.contains(swimId) { ids.append(swimId) }
        UserDefaults.standard.set(ids, forKey: key)
    }

    static func drain() -> [String] {
        lock.lock(); defer { lock.unlock() }
        let ids = UserDefaults.standard.stringArray(forKey: key) ?? []
        UserDefaults.standard.removeObject(forKey: key)
        return ids
    }
}

extension PhoneSyncService: WCSessionDelegate {
    nonisolated func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState,
                             error: Error?) {
        if let error { NSLog("Lapcat: WCSession activation failed: \(error.localizedDescription)") }
        Self.flushPendingAcks(session)
    }

    nonisolated func sessionDidBecomeInactive(_ session: WCSession) {}

    nonisolated func sessionDidDeactivate(_ session: WCSession) {
        // Switching watches: reactivate for the new one.
        session.activate()
    }

    /// The temp file is deleted when this returns, so the copy happens synchronously here.
    nonisolated func session(_ session: WCSession, didReceive file: WCSessionFile) {
        let result = inbox.receive(fileAt: file.fileURL, metadata: file.metadata)
        switch result {
        case .imported:
            break
        case .previouslyRejected(let swimId):
            NSLog("Lapcat: ignoring swim \(swimId), previously rejected by the server")
        case .invalidMetadata:
            NSLog("Lapcat: received a file without a valid swimId")
        case .failed(let swimId):
            NSLog("Lapcat: couldn't store swim \(swimId); the watch will resend it")
        }
        Task { @MainActor in
            refreshCounts()
            uploadPending()
        }
    }
}
