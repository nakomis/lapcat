import LapcatShared
import SwiftUI

@main
struct LapcatWatchApp: App {
    @StateObject private var sync: WatchSyncService
    @StateObject private var workout: WorkoutManager
    @Environment(\.scenePhase) private var scenePhase

    init() {
        let store = PendingSwimStore.applicationSupport(SyncKeys.watchPendingDirectory)
        let sync = WatchSyncService(store: store)
        _sync = StateObject(wrappedValue: sync)
        _workout = StateObject(wrappedValue: WorkoutManager(store: store, sync: sync))
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(workout)
                .environmentObject(sync)
                .task { sync.activate() }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { sync.transferPending() }
        }
    }
}

struct RootView: View {
    @EnvironmentObject private var workout: WorkoutManager

    var body: some View {
        switch workout.phase {
        case .idle, .starting, .failed:
            StartView()
        case .active, .saving:
            SwimView()
        case .finished(let record):
            SummaryView(record: record)
        }
    }
}
