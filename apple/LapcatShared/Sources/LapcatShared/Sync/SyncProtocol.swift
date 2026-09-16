import Foundation

/// Keys exchanged between watch and phone over WatchConnectivity.
///
/// - Watch → phone: `transferFile(swimFile, metadata: [swimId: id])`
/// - Phone → watch: `transferUserInfo([ackSwimId: id])` once the backend has confirmed the swim
public enum SyncKeys {
    public static let swimId = "swimId"
    public static let ackSwimId = "ackSwimId"

    public static let watchPendingDirectory = "PendingSwims"
    public static let phonePendingDirectory = "PendingUploads"
    public static let phoneRejectedDirectory = "RejectedUploads"
}

public enum SyncMessages {
    public static func transferMetadata(swimId: String) -> [String: Any] {
        [SyncKeys.swimId: swimId]
    }

    public static func ack(swimId: String) -> [String: Any] {
        [SyncKeys.ackSwimId: swimId]
    }

    public static func swimId(fromTransferMetadata metadata: [String: Any]?) -> String? {
        validId(metadata?[SyncKeys.swimId])
    }

    public static func ackedSwimId(fromUserInfo userInfo: [String: Any]) -> String? {
        validId(userInfo[SyncKeys.ackSwimId])
    }

    private static func validId(_ value: Any?) -> String? {
        guard let id = value as? String, PendingSwimStore.isValidSwimId(id) else { return nil }
        return id
    }
}

/// Watch-side sync decisions: what to send, and what an ack means.
public struct WatchOutbox: Sendable {
    public let store: PendingSwimStore

    public init(store: PendingSwimStore) {
        self.store = store
    }

    /// Pending swims not already in flight. `outstandingSwimIds` comes from the metadata of
    /// `WCSession.outstandingFileTransfers`.
    public func swimIdsToTransfer(outstandingSwimIds: [String]) -> [String] {
        let inFlight = Set(outstandingSwimIds)
        return store.swimIds().filter { !inFlight.contains($0) }
    }

    /// Handles a userInfo payload from the phone. Returns the swim id deleted, if it was an ack.
    /// Duplicate acks, or acks for swims already gone, are harmless.
    @discardableResult
    public func handle(userInfo: [String: Any]) -> String? {
        guard let id = SyncMessages.ackedSwimId(fromUserInfo: userInfo) else { return nil }
        try? store.delete(id)
        return id
    }
}

/// Phone-side handling of a swim file arriving from the watch.
public struct PhoneInbox: Sendable {
    public enum Result: Equatable, Sendable {
        case imported(String)
        /// The backend has already rejected this swim as invalid; don't queue it again.
        case previouslyRejected(String)
        case invalidMetadata
        case failed(String)
    }

    public let pending: PendingSwimStore
    public let rejected: PendingSwimStore

    public init(pending: PendingSwimStore, rejected: PendingSwimStore) {
        self.pending = pending
        self.rejected = rejected
    }

    /// Must be called synchronously inside `session(_:didReceive:)`: WatchConnectivity deletes the
    /// temp file as soon as that callback returns.
    public func receive(fileAt url: URL, metadata: [String: Any]?) -> Result {
        guard let id = SyncMessages.swimId(fromTransferMetadata: metadata) else { return .invalidMetadata }
        if rejected.contains(id) { return .previouslyRejected(id) }
        do {
            try pending.importFile(at: url, swimId: id)
            return .imported(id)
        } catch {
            return .failed(id)
        }
    }
}
