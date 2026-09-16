import Foundation
import HealthKit
import LapcatShared
import WatchKit

/// Runs a pool-swim workout: HealthKit session + live builder, Water Lock, live lap count, and
/// on finish assembles the full `SwimRecord` and writes it to the pending queue.
@MainActor
final class WorkoutManager: NSObject, ObservableObject {
    enum Phase: Equatable {
        case idle
        case starting
        case active
        case saving
        case finished(SwimRecord)
        case failed(String)
    }

    @Published private(set) var phase: Phase = .idle
    @Published private(set) var lapCount = 0
    @Published private(set) var distanceMetres: Double = 0
    @Published private(set) var isPaused = false
    @Published private(set) var poolLength: PoolLength = .twentyFiveMetres

    let healthStore = HKHealthStore()
    private let store: PendingSwimStore
    private let sync: WatchSyncService
    private let submersion = SubmersionRecorder()

    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?
    private var swimId = ""
    private var startDate = Date()

    init(store: PendingSwimStore, sync: WatchSyncService) {
        self.store = store
        self.sync = sync
    }

    // MARK: - Authorisation

    private static let shareTypes: Set<HKSampleType> = [
        HKObjectType.workoutType(),
        HKQuantityType(.distanceSwimming),
        HKQuantityType(.swimmingStrokeCount),
        HKQuantityType(.activeEnergyBurned),
    ]

    private static let readTypes: Set<HKObjectType> = [
        HKQuantityType(.heartRate),
        HKQuantityType(.distanceSwimming),
        HKQuantityType(.swimmingStrokeCount),
        HKQuantityType(.activeEnergyBurned),
        HKObjectType.workoutType(),
    ]

    func requestAuthorisation() async throws {
        guard HKHealthStore.isHealthDataAvailable() else { throw WorkoutError.healthUnavailable }
        try await healthStore.requestAuthorization(toShare: Self.shareTypes, read: Self.readTypes)
    }

    // MARK: - Controls

    func start(poolLength: PoolLength) async {
        guard phase == .idle || phase.isTerminal else { return }
        phase = .starting
        lapCount = 0
        distanceMetres = 0
        isPaused = false
        self.poolLength = poolLength

        do {
            try await requestAuthorisation()

            let configuration = HKWorkoutConfiguration()
            configuration.activityType = .swimming
            configuration.swimmingLocationType = .pool
            configuration.lapLength = HKQuantity(unit: poolLength.unit == .yards ? .yard() : .meter(),
                                                 doubleValue: poolLength.value)

            let session = try HKWorkoutSession(healthStore: healthStore, configuration: configuration)
            let builder = session.associatedWorkoutBuilder()
            builder.dataSource = HKLiveWorkoutDataSource(healthStore: healthStore, workoutConfiguration: configuration)
            session.delegate = self
            builder.delegate = self
            self.session = session
            self.builder = builder

            swimId = SwimRecord.newSwimId()
            startDate = Date()
            session.startActivity(with: startDate)
            try await builder.beginCollection(at: startDate)

            submersion.start()
            phase = .active
            WKInterfaceDevice.current().enableWaterLock()
        } catch {
            session?.end()
            session = nil
            builder = nil
            phase = .failed(error.localizedDescription)
        }
    }

    func togglePause() {
        guard let session, phase == .active else { return }
        if isPaused { session.resume() } else { session.pause() }
    }

    func lockScreen() {
        WKInterfaceDevice.current().enableWaterLock()
    }

    /// Ends the session; finishing and saving continue in the session delegate once HealthKit
    /// reports the `.ended` state.
    func end() {
        guard let session, phase == .active else { return }
        phase = .saving
        session.end()
    }

    /// Back to the start screen after the summary.
    func reset() {
        guard phase.isTerminal else { return }
        session = nil
        builder = nil
        phase = .idle
        lapCount = 0
        distanceMetres = 0
    }

    /// Active (unpaused) time for the live timer.
    func elapsedTime(at date: Date) -> TimeInterval {
        builder?.elapsedTime(at: date) ?? 0
    }

    // MARK: - Finish

    private func finish(endDate: Date) async {
        guard let builder else { return }
        do {
            try await builder.endCollection(at: endDate)
            _ = try await builder.finishWorkout()
        } catch {
            // The workout may not have saved to Health, but the swim data is still in the builder:
            // keep going so the record isn't lost.
            NSLog("Lapcat: finishing workout failed: \(error.localizedDescription)")
        }

        let events = builder.workoutEvents.map(WorkoutEventInput.init(healthKitEvent:))
        let strokes = await intervalSamples(.swimmingStrokeCount, unit: .count(), from: startDate, to: endDate)
        let distance = await intervalSamples(.distanceSwimming, unit: .meter(), from: startDate, to: endDate)
        let heartRate = await intervalSamples(.heartRate, unit: .count().unitDivided(by: .minute()),
                                              from: startDate, to: endDate)
            .map { SwimRecord.HeartRateSample(date: $0.startDate, bpm: $0.value) }

        let totals = BuilderTotals(
            distanceMetres: builder.statistics(for: HKQuantityType(.distanceSwimming))?.sumQuantity()?.doubleValue(for: .meter()),
            strokeCount: builder.statistics(for: HKQuantityType(.swimmingStrokeCount))?.sumQuantity()?.doubleValue(for: .count()),
            activeEnergyKcal: builder.statistics(for: HKQuantityType(.activeEnergyBurned))?.sumQuantity()?.doubleValue(for: .kilocalorie()),
            activeDurationSeconds: builder.elapsedTime(at: endDate)
        )

        let record = SwimRecordAssembler.assemble(SwimAssemblyInput(
            swimId: swimId, startDate: startDate, endDate: endDate, poolLength: poolLength,
            events: events, strokeCountSamples: strokes, distanceSamples: distance, heartRate: heartRate,
            builderTotals: totals, submersion: submersion.stop(), device: DeviceInfo.current()))

        do {
            try store.save(record)
            sync.transferPending()
            phase = .finished(record)
        } catch {
            phase = .failed("Couldn't save the swim: \(error.localizedDescription)")
        }
    }

    private func intervalSamples(_ identifier: HKQuantityTypeIdentifier, unit: HKUnit,
                                 from start: Date, to end: Date) async -> [IntervalSampleInput] {
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: [])
        let descriptor = HKSampleQueryDescriptor(
            predicates: [.quantitySample(type: HKQuantityType(identifier), predicate: predicate)],
            sortDescriptors: [SortDescriptor(\.startDate)])
        do {
            return try await descriptor.result(for: healthStore).map {
                IntervalSampleInput(startDate: $0.startDate, endDate: $0.endDate,
                                    value: $0.quantity.doubleValue(for: unit))
            }
        } catch {
            NSLog("Lapcat: sample query for \(identifier.rawValue) failed: \(error.localizedDescription)")
            return []
        }
    }

    private func refreshLiveMetrics() {
        guard let builder else { return }
        lapCount = SwimRecordAssembler.lapCount(in: builder.workoutEvents.map(WorkoutEventInput.init(healthKitEvent:)))
        if let metres = builder.statistics(for: HKQuantityType(.distanceSwimming))?.sumQuantity()?.doubleValue(for: .meter()) {
            distanceMetres = metres
        }
    }
}

enum WorkoutError: LocalizedError {
    case healthUnavailable

    var errorDescription: String? {
        switch self {
        case .healthUnavailable: return "Health data isn't available on this device."
        }
    }
}

extension WorkoutManager.Phase {
    var isTerminal: Bool {
        switch self {
        case .finished, .failed: return true
        default: return false
        }
    }
}

// MARK: - HKWorkoutSessionDelegate

extension WorkoutManager: HKWorkoutSessionDelegate {
    nonisolated func workoutSession(_ workoutSession: HKWorkoutSession, didChangeTo toState: HKWorkoutSessionState,
                                    from fromState: HKWorkoutSessionState, date: Date) {
        Task { @MainActor in
            switch toState {
            case .paused:
                isPaused = true
            case .running:
                isPaused = false
            case .ended:
                // Also covers the system ending the session. A session torn down during a failed
                // start has no builder and must leave the `.failed` phase alone.
                guard builder != nil, phase == .active || phase == .saving else { return }
                phase = .saving
                await finish(endDate: date)
            default:
                break
            }
        }
    }

    nonisolated func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {
        NSLog("Lapcat: workout session failed: \(error.localizedDescription)")
    }
}

// MARK: - HKLiveWorkoutBuilderDelegate

extension WorkoutManager: HKLiveWorkoutBuilderDelegate {
    nonisolated func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {
        Task { @MainActor in refreshLiveMetrics() }
    }

    nonisolated func workoutBuilder(_ workoutBuilder: HKLiveWorkoutBuilder, didCollectDataOf collectedTypes: Set<HKSampleType>) {
        Task { @MainActor in refreshLiveMetrics() }
    }
}

// MARK: - HealthKit → shared model

extension WorkoutEventInput {
    init(healthKitEvent event: HKWorkoutEvent) {
        let kind: Kind
        switch event.type {
        case .lap:           kind = .lap
        case .segment:       kind = .segment
        case .pause:         kind = .pause
        case .resume:        kind = .resume
        case .motionPaused:  kind = .motionPaused
        case .motionResumed: kind = .motionResumed
        default:             kind = .other
        }
        let style = (event.metadata?[HKMetadataKeySwimmingStrokeStyle] as? NSNumber)?.intValue
        self.init(kind: kind, startDate: event.dateInterval.start, endDate: event.dateInterval.end,
                  strokeStyleRawValue: style)
    }
}
