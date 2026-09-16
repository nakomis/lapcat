import LapcatShared
import SwiftUI

struct SummaryView: View {
    let record: SwimRecord
    @EnvironmentObject private var workout: WorkoutManager
    @EnvironmentObject private var sync: WatchSyncService

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 8) {
                row("Laps", "\(record.totals.lapCount)")
                row("Distance", SwimFormatting.distance(metres: record.totals.distanceMetres, unit: record.poolLength.unit))
                row("Active", SwimFormatting.duration(record.totals.activeDurationSeconds))
                row("Elapsed", SwimFormatting.duration(record.totals.elapsedDurationSeconds))
                if let strokes = record.totals.strokeCount {
                    row("Strokes", "\(strokes)")
                }

                Text(sync.pendingCount > 0 ? "Saved — will sync to iPhone" : "Synced")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .padding(.top, 4)

                Button("Done") { workout.reset() }
                    .padding(.top, 4)
            }
        }
        .navigationTitle("Swim")
    }

    private func row(_ title: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(title).font(.caption).foregroundStyle(.secondary)
            Text(value).font(.system(.title2, design: .rounded).bold()).monospacedDigit()
        }
    }
}
