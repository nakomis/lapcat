import Foundation

/// A directory of swim JSON files named `{swimId}.json`.
///
/// Used on the watch for `Application Support/PendingSwims` (kept until the phone acks) and on the
/// phone for `Application Support/PendingUploads` (kept until the backend confirms). All writes
/// are atomic, and every operation is idempotent: saving twice overwrites, deleting a missing
/// swim is a no-op.
public final class PendingSwimStore: @unchecked Sendable {
    public enum StoreError: Error, Equatable {
        case invalidSwimId(String)
    }

    public let directory: URL
    private let fileManager: FileManager
    private let lock = NSLock()

    public init(directory: URL, fileManager: FileManager = .default) {
        self.directory = directory
        self.fileManager = fileManager
    }

    /// A store in `Application Support/{subdirectory}` of the current app container.
    public static func applicationSupport(_ subdirectory: String, fileManager: FileManager = .default) -> PendingSwimStore {
        let base = (try? fileManager.url(for: .applicationSupportDirectory, in: .userDomainMask,
                                         appropriateFor: nil, create: true))
            ?? fileManager.temporaryDirectory
        return PendingSwimStore(directory: base.appendingPathComponent(subdirectory, isDirectory: true),
                                fileManager: fileManager)
    }

    /// Swim ids arrive over WatchConnectivity metadata, so only allow a safe file-name alphabet.
    public static func isValidSwimId(_ swimId: String) -> Bool {
        guard !swimId.isEmpty, swimId.count <= 128 else { return false }
        return swimId.unicodeScalars.allSatisfy {
            CharacterSet.alphanumerics.contains($0) && $0.isASCII || $0 == "-" || $0 == "_"
        }
    }

    public func fileURL(for swimId: String) throws -> URL {
        guard Self.isValidSwimId(swimId) else { throw StoreError.invalidSwimId(swimId) }
        return directory.appendingPathComponent("\(swimId).json", isDirectory: false)
    }

    @discardableResult
    public func save(_ record: SwimRecord) throws -> URL {
        try save(data: SwimJSON.encode(record), swimId: record.swimId)
    }

    @discardableResult
    public func save(data: Data, swimId: String) throws -> URL {
        let url = try fileURL(for: swimId)
        lock.lock(); defer { lock.unlock() }
        try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
        try data.write(to: url, options: [.atomic])
        return url
    }

    /// Copies a file (e.g. a WatchConnectivity temp file that is deleted once the delegate
    /// callback returns) into the store synchronously. Overwrites any existing copy.
    @discardableResult
    public func importFile(at source: URL, swimId: String) throws -> URL {
        let data = try Data(contentsOf: source)
        return try save(data: data, swimId: swimId)
    }

    public func data(for swimId: String) throws -> Data {
        try Data(contentsOf: fileURL(for: swimId))
    }

    public func record(for swimId: String) throws -> SwimRecord {
        try SwimJSON.decode(data(for: swimId))
    }

    public func contains(_ swimId: String) -> Bool {
        guard let url = try? fileURL(for: swimId) else { return false }
        return fileManager.fileExists(atPath: url.path)
    }

    public func delete(_ swimId: String) throws {
        let url = try fileURL(for: swimId)
        lock.lock(); defer { lock.unlock() }
        guard fileManager.fileExists(atPath: url.path) else { return }
        try fileManager.removeItem(at: url)
    }

    /// Moves a swim into another store (e.g. PendingUploads → RejectedUploads).
    public func move(_ swimId: String, to other: PendingSwimStore) throws {
        let data = try data(for: swimId)
        try other.save(data: data, swimId: swimId)
        try delete(swimId)
    }

    /// Ids of every stored swim, sorted for determinism.
    public func swimIds() -> [String] {
        guard let names = try? fileManager.contentsOfDirectory(atPath: directory.path) else { return [] }
        return names
            .filter { $0.hasSuffix(".json") }
            .map { String($0.dropLast(".json".count)) }
            .filter(Self.isValidSwimId)
            .sorted()
    }

    public var count: Int { swimIds().count }
}
