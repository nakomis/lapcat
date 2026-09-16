import LapcatShared
import SwiftUI

@main
struct LapcatPhoneApp: App {
    @StateObject private var auth: AuthService
    @StateObject private var sync: PhoneSyncService
    private let api: LapcatAPIClient
    @Environment(\.scenePhase) private var scenePhase

    init() {
        let auth = AuthService()
        let api = LapcatAPIClient(baseURL: URL(string: AppConfig.apiBaseURL)!) { [auth] in
            await auth.idToken()
        }
        let sync = PhoneSyncService(api: api)
        // Activate straight away so files queued by the watch are delivered on launch.
        sync.activate()
        self.api = api
        _auth = StateObject(wrappedValue: auth)
        _sync = StateObject(wrappedValue: sync)
    }

    var body: some Scene {
        WindowGroup {
            Group {
                if auth.isRestoring {
                    ProgressView()
                } else if auth.isSignedIn {
                    SwimListView(api: api)
                } else {
                    SignInView()
                }
            }
            .environmentObject(auth)
            .environmentObject(sync)
            .tint(AppConfig.isSandbox ? .green : nil)
            .task {
                await auth.restore()
                sync.uploadPending()
            }
            .onChange(of: auth.isSignedIn) { _, signedIn in
                if signedIn { sync.uploadPending() }
            }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active, !auth.isRestoring { sync.uploadPending() }
        }
    }
}
