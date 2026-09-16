import XCTest
@testable import LapcatShared

final class SyncTests: XCTestCase {
    private var root: URL!

    override func setUpWithError() throws {
        root = FileManager.default.temporaryDirectory.appendingPathComponent("lapcat-\(UUID().uuidString)")
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: root)
    }

    private func store(_ name: String) -> PendingSwimStore {
        PendingSwimStore(directory: root.appendingPathComponent(name))
    }

    static func record(_ id: String) -> SwimRecord {
        SwimRecord(swimId: id, startDate: Date(timeIntervalSince1970: 0), endDate: Date(timeIntervalSince1970: 60),
                   poolLength: .twentyFiveMetres,
                   totals: .init(lapCount: 0, distanceMetres: 0, activeDurationSeconds: 60, elapsedDurationSeconds: 60),
                   device: .init(model: "Watch", osVersion: "27.0", appVersion: "1.0 (1)"))
    }

    // MARK: PendingSwimStore

    func testSaveListReadDelete() throws {
        let s = store("PendingSwims")
        XCTAssertEqual(s.swimIds(), [], "missing directory is simply empty")
        let url = try s.save(Self.record("b"))
        try s.save(Self.record("a"))
        XCTAssertEqual(url.lastPathComponent, "b.json")
        XCTAssertEqual(s.swimIds(), ["a", "b"])
        XCTAssertEqual(s.count, 2)
        XCTAssertEqual(try s.record(for: "a").swimId, "a")

        try s.delete("a")
        try s.delete("a") // idempotent
        XCTAssertFalse(s.contains("a"))
        XCTAssertEqual(s.swimIds(), ["b"])
    }

    func testSaveOverwritesAndIgnoresStrayFiles() throws {
        let s = store("PendingSwims")
        try s.save(data: Data("one".utf8), swimId: "x")
        try s.save(data: Data("two".utf8), swimId: "x")
        XCTAssertEqual(try s.data(for: "x"), Data("two".utf8))
        try Data().write(to: s.directory.appendingPathComponent("notes.txt"))
        XCTAssertEqual(s.swimIds(), ["x"])
    }

    func testRejectsUnsafeIds() {
        let s = store("PendingSwims")
        XCTAssertThrowsError(try s.save(data: Data(), swimId: "../escape"))
        XCTAssertThrowsError(try s.save(data: Data(), swimId: ""))
        XCTAssertThrowsError(try s.save(data: Data(), swimId: "a/b"))
        XCTAssertFalse(PendingSwimStore.isValidSwimId("é"))
        XCTAssertTrue(PendingSwimStore.isValidSwimId("6f1c2b3a-9d4e-4f5a-8b7c-1234567890ab"))
        XCTAssertFalse(s.contains("../escape"))
    }

    func testImportCopiesSoSourceCanVanish() throws {
        let s = store("PendingUploads")
        let temp = root.appendingPathComponent("wc-temp.json")
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        try Data("payload".utf8).write(to: temp)
        try s.importFile(at: temp, swimId: "abc")
        try FileManager.default.removeItem(at: temp)
        XCTAssertEqual(try s.data(for: "abc"), Data("payload".utf8))
    }

    func testMoveBetweenStores() throws {
        let pending = store("PendingUploads"), rejected = store("RejectedUploads")
        try pending.save(Self.record("r"))
        try pending.move("r", to: rejected)
        XCTAssertFalse(pending.contains("r"))
        XCTAssertTrue(rejected.contains("r"))
    }

    // MARK: Watch outbox

    func testWatchSkipsSwimsAlreadyInFlight() throws {
        let s = store("PendingSwims")
        for id in ["a", "b", "c"] { try s.save(Self.record(id)) }
        let outbox = WatchOutbox(store: s)
        XCTAssertEqual(outbox.swimIdsToTransfer(outstandingSwimIds: ["b"]), ["a", "c"])
        XCTAssertEqual(outbox.swimIdsToTransfer(outstandingSwimIds: []), ["a", "b", "c"])
        XCTAssertEqual(outbox.swimIdsToTransfer(outstandingSwimIds: ["a", "b", "c", "zzz"]), [])
    }

    func testWatchAckDeletesAndDuplicatesAreHarmless() throws {
        let s = store("PendingSwims")
        try s.save(Self.record("a"))
        try s.save(Self.record("b"))
        let outbox = WatchOutbox(store: s)

        XCTAssertEqual(outbox.handle(userInfo: SyncMessages.ack(swimId: "a")), "a")
        XCTAssertEqual(outbox.handle(userInfo: SyncMessages.ack(swimId: "a")), "a")
        XCTAssertNil(outbox.handle(userInfo: ["somethingElse": 1]))
        XCTAssertNil(outbox.handle(userInfo: [SyncKeys.ackSwimId: 42]))
        XCTAssertNil(outbox.handle(userInfo: [SyncKeys.ackSwimId: "../b"]))
        XCTAssertEqual(s.swimIds(), ["b"])
    }

    // MARK: Phone inbox

    func testPhoneInboxImportsAndIsIdempotent() throws {
        let inbox = PhoneInbox(pending: store("PendingUploads"), rejected: store("RejectedUploads"))
        let temp = root.appendingPathComponent("tmp.json")
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        try SwimJSON.encode(Self.record("s1")).write(to: temp)

        let metadata = SyncMessages.transferMetadata(swimId: "s1")
        XCTAssertEqual(inbox.receive(fileAt: temp, metadata: metadata), .imported("s1"))
        XCTAssertEqual(inbox.receive(fileAt: temp, metadata: metadata), .imported("s1"))
        XCTAssertEqual(inbox.pending.swimIds(), ["s1"])
    }

    func testPhoneInboxRejectsBadMetadataAndKnownRejects() throws {
        let inbox = PhoneInbox(pending: store("PendingUploads"), rejected: store("RejectedUploads"))
        let temp = root.appendingPathComponent("tmp.json")
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        try Data("{}".utf8).write(to: temp)

        XCTAssertEqual(inbox.receive(fileAt: temp, metadata: nil), .invalidMetadata)
        XCTAssertEqual(inbox.receive(fileAt: temp, metadata: ["swimId": "../x"]), .invalidMetadata)

        try inbox.rejected.save(data: Data("{}".utf8), swimId: "bad")
        XCTAssertEqual(inbox.receive(fileAt: temp, metadata: ["swimId": "bad"]), .previouslyRejected("bad"))
        XCTAssertEqual(inbox.receive(fileAt: root.appendingPathComponent("gone.json"), metadata: ["swimId": "gone"]),
                       .failed("gone"))
        XCTAssertEqual(inbox.pending.swimIds(), [])
    }

    // MARK: Formatting

    func testFormatting() {
        XCTAssertEqual(SwimFormatting.duration(0), "0:00")
        XCTAssertEqual(SwimFormatting.duration(65.9), "1:05")
        XCTAssertEqual(SwimFormatting.duration(3725), "1:02:05")
        XCTAssertEqual(SwimFormatting.duration(-5), "0:00")
        XCTAssertEqual(SwimFormatting.split(38.24), "38.2s")
        XCTAssertEqual(SwimFormatting.split(65.44), "1:05.4")
        XCTAssertEqual(SwimFormatting.distance(metres: 1000, unit: .metres), "1000 m")
        XCTAssertEqual(SwimFormatting.distance(metres: 457.2, unit: .yards), "500 yd")
    }
}
