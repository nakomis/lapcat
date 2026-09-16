import LapcatShared
import SwiftUI

/// The in-pool screen: page 1 is the metrics (huge lap count), page 2 the controls.
/// While Water Lock is on the controls can't be touched; turning the crown clears it.
struct SwimView: View {
    @EnvironmentObject private var workout: WorkoutManager
    @State private var page = 0

    var body: some View {
        TabView(selection: $page) {
            MetricsView().tag(0)
            ControlsView().tag(1)
        }
        .tabViewStyle(.verticalPage)
        .background(Color.black)
        .overlay {
            if workout.phase == .saving {
                ZStack {
                    Color.black.opacity(0.85)
                    ProgressView("Saving swim…")
                }
                .ignoresSafeArea()
            }
        }
    }
}

private struct MetricsView: View {
    @EnvironmentObject private var workout: WorkoutManager

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            VStack(spacing: 0) {
                Text("\(workout.lapCount)")
                    .font(.system(size: 96, weight: .heavy, design: .rounded))
                    .monospacedDigit()
                    .minimumScaleFactor(0.5)
                    .lineLimit(1)
                    .foregroundStyle(.white)
                Text(workout.lapCount == 1 ? "LAP" : "LAPS")
                    .font(.caption.bold())
                    .foregroundStyle(.yellow)

                Text(SwimFormatting.duration(workout.elapsedTime(at: context.date)))
                    .font(.system(size: 34, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(workout.isPaused ? .orange : .yellow)
                    .padding(.top, 4)

                Text(SwimFormatting.distance(metres: workout.distanceMetres, unit: workout.poolLength.unit))
                    .font(.system(.body, design: .rounded).bold())
                    .foregroundStyle(.white.opacity(0.8))

                if workout.isPaused {
                    Text("PAUSED").font(.caption.bold()).foregroundStyle(.orange)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .background(Color.black)
    }
}

private struct ControlsView: View {
    @EnvironmentObject private var workout: WorkoutManager
    @State private var confirmingEnd = false

    var body: some View {
        VStack(spacing: 8) {
            Button(role: .destructive) {
                confirmingEnd = true
            } label: {
                Label("End", systemImage: "xmark")
                    .font(.title3.bold())
                    .frame(maxWidth: .infinity, minHeight: 48)
            }
            .tint(.red)

            HStack(spacing: 8) {
                Button {
                    workout.togglePause()
                } label: {
                    Image(systemName: workout.isPaused ? "play.fill" : "pause.fill")
                        .frame(maxWidth: .infinity, minHeight: 40)
                }
                .tint(.yellow)

                Button {
                    workout.lockScreen()
                } label: {
                    Image(systemName: "drop.fill")
                        .frame(maxWidth: .infinity, minHeight: 40)
                }
                .tint(.cyan)
                .accessibilityLabel("Water Lock")
            }
        }
        .padding(.horizontal, 4)
        .confirmationDialog("End this swim?", isPresented: $confirmingEnd, titleVisibility: .visible) {
            Button("End swim", role: .destructive) { workout.end() }
            Button("Keep swimming", role: .cancel) {}
        }
    }
}
