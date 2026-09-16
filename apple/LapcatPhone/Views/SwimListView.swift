import LapcatShared
import SwiftUI

struct SwimListView: View {
    let api: LapcatAPIClient

    @EnvironmentObject private var auth: AuthService
    @EnvironmentObject private var sync: PhoneSyncService
    @State private var swims: [SwimSummary] = []
    @State private var loading = false
    @State private var error: String?
    @State private var confirmingSignOut = false

    var body: some View {
        NavigationStack {
            List {
                if sync.pendingCount > 0 || sync.rejectedCount > 0 {
                    Section {
                        SyncStatusRow()
                    }
                }

                if let error {
                    Section {
                        Text(error).foregroundStyle(.red).font(.footnote)
                    }
                }

                Section {
                    ForEach(swims) { swim in
                        NavigationLink {
                            SwimDetailView(api: api, summary: swim)
                        } label: {
                            SwimRow(swim: swim)
                        }
                    }
                } footer: {
                    if swims.isEmpty && !loading && error == nil {
                        Text("No swims yet. Start one from Lapcat on your Apple Watch.")
                    }
                }
            }
            .navigationTitle("Swims")
            .overlay { if loading && swims.isEmpty { ProgressView() } }
            .refreshable { await load() }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        if let name = auth.email ?? auth.displayName {
                            Text(name)
                        }
                        Text(Bundle.main.versionLabel + (AppConfig.isSandbox ? " · sandbox" : ""))
                        Button("Sign Out", role: .destructive) { confirmingSignOut = true }
                    } label: {
                        Image(systemName: "person.crop.circle")
                    }
                }
            }
            .confirmationDialog("Sign out?", isPresented: $confirmingSignOut, titleVisibility: .visible) {
                Button("Sign Out", role: .destructive) { auth.signOut() }
            } message: {
                Text("Swims from your watch will wait on this iPhone until you sign in again.")
            }
            .task { await load() }
            .onChange(of: sync.pendingCount) { old, new in
                if new < old { Task { await load() } }
            }
        }
    }

    private func load() async {
        loading = true
        defer { loading = false }
        do {
            swims = try await api.listSwims().sorted { $0.startDate > $1.startDate }
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }
}

private struct SyncStatusRow: View {
    @EnvironmentObject private var sync: PhoneSyncService

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if sync.pendingCount > 0 {
                HStack {
                    Label("\(sync.pendingCount) swim\(sync.pendingCount == 1 ? "" : "s") waiting to upload",
                          systemImage: "icloud.and.arrow.up")
                    Spacer()
                    if sync.isUploading {
                        ProgressView()
                    } else {
                        Button("Retry") { sync.uploadPending() }.buttonStyle(.borderless)
                    }
                }
            }
            if sync.rejectedCount > 0 {
                Label("\(sync.rejectedCount) swim\(sync.rejectedCount == 1 ? "" : "s") rejected by the server",
                      systemImage: "exclamationmark.triangle")
                    .foregroundStyle(.orange)
            }
            if let error = sync.lastError {
                Text(error).font(.caption).foregroundStyle(.secondary)
            }
        }
        .font(.subheadline)
    }
}

private struct SwimRow: View {
    let swim: SwimSummary

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(swim.startDate.formatted(date: .abbreviated, time: .shortened))
                .font(.headline)
            HStack(spacing: 16) {
                Label("\(swim.lapCount)", systemImage: "arrow.left.arrow.right")
                Text(SwimFormatting.distance(metres: swim.distanceMetres, unit: swim.poolLength.unit))
                Label(SwimFormatting.duration(swim.activeDurationSeconds), systemImage: "stopwatch")
            }
            .font(.subheadline)
            .foregroundStyle(.secondary)
            .monospacedDigit()
        }
        .padding(.vertical, 2)
    }
}
