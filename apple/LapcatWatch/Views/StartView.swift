import LapcatShared
import SwiftUI

struct StartView: View {
    @EnvironmentObject private var workout: WorkoutManager
    @EnvironmentObject private var sync: WatchSyncService
    @State private var poolLength = PoolLengthSetting().load()

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 10) {
                    Button {
                        Task { await workout.start(poolLength: poolLength) }
                    } label: {
                        Label("Swim", systemImage: "figure.pool.swim")
                            .font(.title3.bold())
                            .frame(maxWidth: .infinity, minHeight: 56)
                    }
                    .tint(.accentColor)
                    .disabled(workout.phase == .starting)

                    NavigationLink {
                        PoolLengthPickerView(poolLength: $poolLength)
                    } label: {
                        HStack {
                            Text("Pool")
                            Spacer()
                            Text(poolLength.label).foregroundStyle(.secondary)
                        }
                    }

                    if case .failed(let message) = workout.phase {
                        Text(message)
                            .font(.footnote)
                            .foregroundStyle(.red)
                            .multilineTextAlignment(.center)
                    }

                    if sync.pendingCount > 0 {
                        Label("\(sync.pendingCount) waiting for iPhone", systemImage: "arrow.triangle.2.circlepath")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .navigationTitle("Lapcat")
        }
    }
}

struct PoolLengthPickerView: View {
    @Binding var poolLength: PoolLength
    @Environment(\.dismiss) private var dismiss
    @State private var preset: PoolLengthPreset = .twentyFiveMetres
    @State private var customValue: Double = 25
    @State private var customUnit: PoolLengthUnit = .metres

    var body: some View {
        List {
            ForEach(PoolLengthPreset.allCases) { option in
                Button {
                    preset = option
                    if let length = option.poolLength { choose(length) }
                } label: {
                    HStack {
                        Text(option.label)
                        Spacer()
                        if preset == option { Image(systemName: "checkmark") }
                    }
                }
            }

            if preset == .custom {
                Section("Custom length") {
                    Stepper(value: $customValue, in: 5...200, step: 0.5) {
                        Text(PoolLength(value: customValue, unit: customUnit).label)
                            .font(.headline)
                    }
                    Picker("Unit", selection: $customUnit) {
                        Text("Metres").tag(PoolLengthUnit.metres)
                        Text("Yards").tag(PoolLengthUnit.yards)
                    }
                    Button("Use custom length") {
                        choose(PoolLength(value: customValue, unit: customUnit))
                    }
                }
            }
        }
        .navigationTitle("Pool length")
        .onAppear {
            preset = PoolLengthPreset.matching(poolLength)
            if preset == .custom {
                customValue = poolLength.value
                customUnit = poolLength.unit
            }
        }
    }

    private func choose(_ length: PoolLength) {
        poolLength = length
        PoolLengthSetting().save(length)
        dismiss()
    }
}
