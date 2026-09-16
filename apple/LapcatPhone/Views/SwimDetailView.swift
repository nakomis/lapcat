import LapcatShared
import SwiftUI

struct SwimDetailView: View {
    let api: LapcatAPIClient
    let summary: SwimSummary

    @State private var record: SwimRecord?
    @State private var error: String?

    var body: some View {
        List {
            Section("Summary") {
                LabeledContent("Pool", value: summary.poolLength.label)
                LabeledContent("Laps", value: "\(summary.lapCount)")
                LabeledContent("Distance", value: SwimFormatting.distance(metres: summary.distanceMetres, unit: summary.poolLength.unit))
                LabeledContent("Active time", value: SwimFormatting.duration(summary.activeDurationSeconds))
                LabeledContent("Elapsed time", value: SwimFormatting.duration(summary.elapsedDurationSeconds))
                if let strokes = record?.totals.strokeCount {
                    LabeledContent("Strokes", value: "\(strokes)")
                }
                if let kcal = record?.totals.activeEnergyKcal {
                    LabeledContent("Active energy", value: "\(Int(kcal.rounded())) kcal")
                }
                if let temperatures = record?.submersion?.waterTemperature, !temperatures.isEmpty {
                    let mean = temperatures.map(\.celsius).reduce(0, +) / Double(temperatures.count)
                    LabeledContent("Water", value: String(format: "%.1f °C", mean))
                }
            }

            Section("Laps") {
                if let record {
                    if record.laps.isEmpty {
                        Text("No laps recorded.").foregroundStyle(.secondary)
                    } else {
                        LapHeader()
                        ForEach(record.laps, id: \.index) { lap in
                            LapRow(lap: lap)
                        }
                    }
                } else if let error {
                    Text(error).foregroundStyle(.red).font(.footnote)
                } else {
                    ProgressView()
                }
            }
        }
        .navigationTitle(summary.startDate.formatted(date: .abbreviated, time: .shortened))
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private func load() async {
        do {
            let detail = try await api.getSwim(swimId: summary.swimId)
            guard let url = URL(string: detail.downloadUrl) else { throw LapcatAPIError.invalidResponse }
            record = try await api.downloadRecord(from: url)
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }
}

private struct LapHeader: View {
    var body: some View {
        HStack {
            Text("#").frame(width: 36, alignment: .leading)
            Text("Time").frame(width: 72, alignment: .leading)
            Text("Stroke")
            Spacer()
            Text("Strokes")
        }
        .font(.caption.bold())
        .foregroundStyle(.secondary)
    }
}

private struct LapRow: View {
    let lap: SwimRecord.Lap

    var body: some View {
        HStack {
            Text("\(lap.index + 1)").frame(width: 36, alignment: .leading)
            Text(SwimFormatting.split(lap.durationSeconds)).frame(width: 72, alignment: .leading)
            Text(lap.strokeStyle?.displayName ?? "—")
            Spacer()
            Text(lap.strokeCount.map(String.init) ?? "—")
        }
        .monospacedDigit()
    }
}
