import Foundation
import LapcatShared
import WatchConnectivity

/// Sends finished swims to the iPhone and deletes them once the phone acknowledges a confirmed
/// upload. Files stay in `PendingSwims/` until then, so nothing is lost if the phone is away,
/// the transfer fails, or the app is killed.
final class WatchSyncService: NSObject, ObservableObject, WCSessionDelegate {
    @Published private(set) var pendingCount = 0

    private let outbox: WatchOutbox
    private var session: WCSession? { WCSession.isSupported() ? WCSession.default : nil }

    init(store: PendingSwimStore) {
        self.outbox = WatchOutbox(store: store)
        super.init()
        refreshCount()
    }

    func activate() {
        guard let session else { return }
        session.delegate = self
        if session.activationState == .activated {
            transferPending()
        } else {
            session.activate()
        }
    }

    /// Queues every pending swim that isn't already in flight. Safe to call as often as you like.
    func transferPending() {
        refreshCount()
        guard let session, session.activationState == .activated else { return }
        let outstanding = session.outstandingFileTransfers.compactMap {
            SyncMessages.swimId(fromTransferMetadata: $0.file.metadata)
        }
        for swimId in outbox.swimIdsToTransfer(outstandingSwimIds: outstanding) {
            guard let url = try? outbox.store.fileURL(for: swimId) else { continue }
            session.transferFile(url, metadata: SyncMessages.transferMetadata(swimId: swimId))
        }
    }

    private func refreshCount() {
        let count = outbox.store.count
        DispatchQueue.main.async { self.pendingCount = count }
    }

    // MARK: WCSessionDelegate

    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        if let error { NSLog("Lapcat: WCSession activation failed: \(error.localizedDescription)") }
        if activationState == .activated { transferPending() }
    }

    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
        if outbox.handle(userInfo: userInfo) != nil { refreshCount() }
    }

    func session(_ session: WCSession, didFinish fileTransfer: WCSessionFileTransfer, error: Error?) {
        // Success here only means the phone has the file; we keep ours until the ack arrives.
        // A failed transfer is retried on the next launch or activation.
        if let error { NSLog("Lapcat: swim transfer failed: \(error.localizedDescription)") }
    }
}
