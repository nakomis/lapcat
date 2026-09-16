import XCTest
@testable import LapcatShared

// MARK: - URLProtocol stub

final class StubURLProtocol: URLProtocol {
    struct Recorded {
        let request: URLRequest
        let body: Data?
    }

    typealias Handler = (URLRequest) -> (Int, Data)

    private static let lock = NSLock()
    nonisolated(unsafe) private static var _handler: Handler?
    nonisolated(unsafe) private static var _recorded: [Recorded] = []

    static func reset(_ handler: @escaping Handler) {
        lock.lock(); defer { lock.unlock() }
        _handler = handler
        _recorded = []
    }

    static var recorded: [Recorded] {
        lock.lock(); defer { lock.unlock() }
        return _recorded
    }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        let body = request.httpBody ?? request.httpBodyStream.map(Self.read)
        Self.lock.lock()
        Self._recorded.append(Recorded(request: request, body: body))
        let handler = Self._handler
        Self.lock.unlock()

        let (status, data) = handler?(request) ?? (500, Data())
        let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: data)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}

    private static func read(_ stream: InputStream) -> Data {
        stream.open(); defer { stream.close() }
        var data = Data()
        var buffer = [UInt8](repeating: 0, count: 4096)
        while stream.hasBytesAvailable {
            let n = stream.read(&buffer, maxLength: buffer.count)
            if n <= 0 { break }
            data.append(buffer, count: n)
        }
        return data
    }
}

private let summaryJSON = #"""
{"swimId":"s1","startDate":"2026-09-19T08:30:00.000Z","endDate":"2026-09-19T09:00:00.000Z",
 "poolLength":{"value":25,"unit":"m"},"lapCount":40,"distanceMetres":1000,"activeDurationSeconds":1500,
 "elapsedDurationSeconds":1800,"s3Key":"users/abc/swims/s1.json","uploadedAt":"2026-09-19T09:05:00Z"}
"""#

// MARK: - API client

final class LapcatAPIClientTests: XCTestCase {

    private func client(token: String? = "id-token") -> LapcatAPIClient {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [StubURLProtocol.self]
        return LapcatAPIClient(baseURL: URL(string: "https://api.lapcat.sandbox.nakomis.com")!,
                               session: URLSession(configuration: config),
                               tokenProvider: { token })
    }

    func testUploadURLUsesBearerIdTokenAndPost() async throws {
        StubURLProtocol.reset { _ in (200, Data(#"{"uploadUrl":"https://s3.example/put?sig=1","key":"users/u/swims/s1.json","expiresIn":900}"#.utf8)) }
        let response = try await client().requestUploadURL(swimId: "s1")
        XCTAssertEqual(response.uploadUrl, "https://s3.example/put?sig=1")
        XCTAssertEqual(response.expiresIn, 900)

        let request = try XCTUnwrap(StubURLProtocol.recorded.first?.request)
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertEqual(request.url?.absoluteString, "https://api.lapcat.sandbox.nakomis.com/swims/s1/upload-url")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer id-token")
    }

    func testPutSendsJSONWithoutAuthorisation() async throws {
        StubURLProtocol.reset { _ in (200, Data()) }
        let body = Data(#"{"schemaVersion":1}"#.utf8)
        try await client().upload(swimJSON: body, to: URL(string: "https://s3.example/put?sig=1")!)

        let recorded = try XCTUnwrap(StubURLProtocol.recorded.first)
        XCTAssertEqual(recorded.request.httpMethod, "PUT")
        XCTAssertEqual(recorded.request.value(forHTTPHeaderField: "Content-Type"), "application/json")
        XCTAssertNil(recorded.request.value(forHTTPHeaderField: "Authorization"))
        XCTAssertEqual(recorded.body, body)
    }

    func testConfirmMapsResponses() async throws {
        StubURLProtocol.reset { _ in (200, Data(summaryJSON.utf8)) }
        let summary = try await client().confirm(swimId: "s1")
        XCTAssertEqual(summary.lapCount, 40)
        XCTAssertEqual(summary.poolLength, .twentyFiveMetres)
        XCTAssertNotNil(summary.uploadedAt)
        XCTAssertEqual(StubURLProtocol.recorded.first?.request.url?.path, "/swims/s1")

        StubURLProtocol.reset { _ in (404, Data(#"{"error":"not_uploaded"}"#.utf8)) }
        await assertThrows(LapcatAPIError.notUploaded) { _ = try await self.client().confirm(swimId: "s1") }

        StubURLProtocol.reset { _ in (400, Data(#"{"error":"invalid_swim","detail":"laps missing"}"#.utf8)) }
        await assertThrows(LapcatAPIError.invalidSwim("laps missing")) { _ = try await self.client().confirm(swimId: "s1") }

        StubURLProtocol.reset { _ in (401, Data(#"{"message":"Unauthorized"}"#.utf8)) }
        await assertThrows(LapcatAPIError.unauthorised) { _ = try await self.client().confirm(swimId: "s1") }

        StubURLProtocol.reset { _ in (502, Data("bad gateway".utf8)) }
        await assertThrows(LapcatAPIError.http(502, "bad gateway")) { _ = try await self.client().confirm(swimId: "s1") }
    }

    func testNoTokenFailsWithoutNetwork() async {
        StubURLProtocol.reset { _ in (200, Data()) }
        await assertThrows(LapcatAPIError.notAuthenticated) { _ = try await self.client(token: nil).listSwims() }
        XCTAssertTrue(StubURLProtocol.recorded.isEmpty)
    }

    func testListAndGetSwim() async throws {
        StubURLProtocol.reset { request in
            if request.url?.path == "/swims" {
                return (200, Data(#"{"swims":[\#(summaryJSON)]}"#.utf8))
            }
            return (200, Data(#"{"swim":\#(summaryJSON),"downloadUrl":"https://s3.example/get"}"#.utf8))
        }
        let swims = try await client().listSwims()
        XCTAssertEqual(swims.map(\.swimId), ["s1"])
        let detail = try await client().getSwim(swimId: "s1")
        XCTAssertEqual(detail.downloadUrl, "https://s3.example/get")
        XCTAssertEqual(StubURLProtocol.recorded.map { $0.request.httpMethod }, ["GET", "GET"])
    }

    func testDownloadRecord() async throws {
        let record = SyncTests.record("s1")
        let data = try SwimJSON.encode(record)
        StubURLProtocol.reset { _ in (200, data) }
        let downloaded = try await client().downloadRecord(from: URL(string: "https://s3.example/get")!)
        XCTAssertEqual(downloaded, record)
        XCTAssertNil(StubURLProtocol.recorded.first?.request.value(forHTTPHeaderField: "Authorization"))
    }

    func testTransientClassification() {
        XCTAssertTrue(LapcatAPIError.http(503, "").isTransient)
        XCTAssertTrue(LapcatAPIError.http(429, "").isTransient)
        XCTAssertFalse(LapcatAPIError.http(400, "").isTransient)
        XCTAssertTrue(LapcatAPIError.notUploaded.isTransient)
        XCTAssertFalse(LapcatAPIError.invalidSwim(nil).isTransient)
    }
}

func assertThrows<E: Error & Equatable>(_ expected: E, file: StaticString = #filePath, line: UInt = #line,
                                        _ body: () async throws -> Void) async {
    do {
        try await body()
        XCTFail("Expected \(expected) to be thrown", file: file, line: line)
    } catch let error as E {
        XCTAssertEqual(error, expected, file: file, line: line)
    } catch {
        XCTFail("Unexpected error \(error)", file: file, line: line)
    }
}

// MARK: - Uploader

/// Scripted fake API: each step pops the next result from its queue (default: success).
final class FakeUploadAPI: SwimUploadAPI, @unchecked Sendable {
    enum Step { case uploadURL, put, confirm }

    private let lock = NSLock()
    private var failures: [Step: [Error]] = [:]
    private(set) var calls: [(Step, String)] = []

    func fail(_ step: Step, with errors: Error...) {
        lock.lock(); defer { lock.unlock() }
        failures[step, default: []].append(contentsOf: errors)
    }

    private func record(_ step: Step, _ detail: String) throws {
        lock.lock(); defer { lock.unlock() }
        calls.append((step, detail))
        if var queue = failures[step], !queue.isEmpty {
            let error = queue.removeFirst()
            failures[step] = queue
            throw error
        }
    }

    func requestUploadURL(swimId: String) async throws -> UploadURLResponse {
        try record(.uploadURL, swimId)
        return UploadURLResponse(uploadUrl: "https://s3.example/\(swimId)", key: "k/\(swimId)", expiresIn: 900)
    }

    func upload(swimJSON: Data, to url: URL) async throws {
        try record(.put, url.lastPathComponent)
    }

    func confirm(swimId: String) async throws -> SwimSummary {
        try record(.confirm, swimId)
        return SwimSummary(swimId: swimId, startDate: Date(), endDate: Date(), poolLength: .twentyFiveMetres,
                           lapCount: 0, distanceMetres: 0, activeDurationSeconds: 0, elapsedDurationSeconds: 0)
    }
}

final class Recorder: @unchecked Sendable {
    private let lock = NSLock()
    private var _values: [String] = []
    private var _delays: [TimeInterval] = []

    func ack(_ id: String) { lock.lock(); _values.append(id); lock.unlock() }
    func sleep(_ delay: TimeInterval) { lock.lock(); _delays.append(delay); lock.unlock() }
    var acks: [String] { lock.lock(); defer { lock.unlock() }; return _values }
    var delays: [TimeInterval] { lock.lock(); defer { lock.unlock() }; return _delays }
}

final class SwimUploaderTests: XCTestCase {
    private var root: URL!
    private var pending: PendingSwimStore!
    private var rejected: PendingSwimStore!
    private var api: FakeUploadAPI!
    private var recorder: Recorder!

    override func setUpWithError() throws {
        root = FileManager.default.temporaryDirectory.appendingPathComponent("lapcat-up-\(UUID().uuidString)")
        pending = PendingSwimStore(directory: root.appendingPathComponent("PendingUploads"))
        rejected = PendingSwimStore(directory: root.appendingPathComponent("RejectedUploads"))
        api = FakeUploadAPI()
        recorder = Recorder()
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: root)
    }

    private func uploader(maxAttempts: Int = 3) -> SwimUploader {
        let recorder = recorder!
        return SwimUploader(pending: pending, rejected: rejected, api: api,
                            retryPolicy: RetryPolicy(maxAttempts: maxAttempts, baseDelay: 2, maxDelay: 60),
                            sleep: { recorder.sleep($0) },
                            acknowledge: { recorder.ack($0) })
    }

    func testHappyPathUploadsConfirmsDeletesAndAcks() async throws {
        try pending.save(SyncTests.record("a"))
        try pending.save(SyncTests.record("b"))

        let outcomes = await uploader().uploadPending()

        XCTAssertEqual(outcomes, ["a": .uploaded, "b": .uploaded])
        XCTAssertEqual(api.calls.map(\.0), [.uploadURL, .put, .confirm, .uploadURL, .put, .confirm])
        XCTAssertEqual(pending.swimIds(), [])
        XCTAssertEqual(recorder.acks, ["a", "b"])
    }

    func testNothingPendingDoesNothing() async {
        let outcomes = await uploader().uploadPending()
        XCTAssertEqual(outcomes, [:])
        XCTAssertTrue(api.calls.isEmpty)
    }

    func testTransientFailuresRetryWithBackoff() async throws {
        try pending.save(SyncTests.record("a"))
        api.fail(.put, with: URLError(.notConnectedToInternet))
        api.fail(.confirm, with: LapcatAPIError.notUploaded)

        let outcomes = await uploader().uploadPending()

        XCTAssertEqual(outcomes, ["a": .uploaded])
        XCTAssertEqual(recorder.delays, [2, 4])
        XCTAssertEqual(recorder.acks, ["a"])
    }

    func testGivesUpAfterMaxAttemptsAndKeepsSwim() async throws {
        try pending.save(SyncTests.record("a"))
        api.fail(.uploadURL, with: LapcatAPIError.http(503, ""), LapcatAPIError.http(503, ""), LapcatAPIError.http(503, ""))

        let outcomes = await uploader(maxAttempts: 3).uploadPending()

        guard case .failed = outcomes["a"] else { return XCTFail("expected failure, got \(String(describing: outcomes["a"]))") }
        XCTAssertEqual(recorder.delays, [2, 4])
        XCTAssertEqual(pending.swimIds(), ["a"], "swim stays queued for the next run")
        XCTAssertEqual(recorder.acks, [], "never ack an unconfirmed swim")
    }

    func testNonTransientHttpErrorDoesNotRetry() async throws {
        try pending.save(SyncTests.record("a"))
        api.fail(.uploadURL, with: LapcatAPIError.http(400, "bad request"))
        let outcomes = await uploader().uploadPending()
        guard case .failed = outcomes["a"] else { return XCTFail() }
        XCTAssertEqual(recorder.delays, [])
        XCTAssertTrue(pending.contains("a"))
    }

    func testNotSignedInStopsTheRunAndKeepsEverything() async throws {
        try pending.save(SyncTests.record("a"))
        try pending.save(SyncTests.record("b"))
        api.fail(.uploadURL, with: LapcatAPIError.notAuthenticated)

        let outcomes = await uploader().uploadPending()

        XCTAssertEqual(outcomes, ["a": .waitingForSignIn])
        XCTAssertEqual(api.calls.count, 1, "doesn't hammer the API for the remaining swims")
        XCTAssertEqual(pending.swimIds(), ["a", "b"])
        XCTAssertEqual(recorder.acks, [])
    }

    func testInvalidSwimIsParkedAndNotAcked() async throws {
        try pending.save(SyncTests.record("a"))
        try pending.save(SyncTests.record("b"))
        api.fail(.confirm, with: LapcatAPIError.invalidSwim("bad laps"))

        let outcomes = await uploader().uploadPending()

        XCTAssertEqual(outcomes, ["a": .rejected("bad laps"), "b": .uploaded])
        XCTAssertEqual(rejected.swimIds(), ["a"])
        XCTAssertEqual(pending.swimIds(), [])
        XCTAssertEqual(recorder.acks, ["b"])
    }

    func testRepeatUploadOfSameSwimIsHarmless() async throws {
        let up = uploader()
        try pending.save(SyncTests.record("a"))
        _ = await up.uploadPending()
        try pending.save(SyncTests.record("a")) // the watch re-sent it
        _ = await up.uploadPending()
        XCTAssertEqual(recorder.acks, ["a", "a"])
        XCTAssertEqual(pending.swimIds(), [])
    }

    func testRetryPolicyCapsDelay() {
        let policy = RetryPolicy(maxAttempts: 10, baseDelay: 2, maxDelay: 30)
        XCTAssertEqual((1...6).map(policy.delay(afterAttempt:)), [2, 4, 8, 16, 30, 30])
        XCTAssertEqual(RetryPolicy(maxAttempts: 0).maxAttempts, 1)
    }
}
