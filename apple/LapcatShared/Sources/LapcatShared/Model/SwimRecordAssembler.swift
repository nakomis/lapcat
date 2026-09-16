import Foundation

/// A HealthKit workout event, flattened so the assembly logic needs no HealthKit import.
/// The watch maps each `HKWorkoutEvent` into one of these.
public struct WorkoutEventInput: Equatable, Sendable {
    public enum Kind: Equatable, Sendable {
        case lap, segment, pause, resume, motionPaused, motionResumed, other
    }

    public var kind: Kind
    public var startDate: Date
    public var endDate: Date
    /// `HKSwimmingStrokeStyle` raw value from the event's metadata, if present.
    public var strokeStyleRawValue: Int?

    public init(kind: Kind, startDate: Date, endDate: Date, strokeStyleRawValue: Int? = nil) {
        self.kind = kind
        self.startDate = startDate
        self.endDate = endDate
        self.strokeStyleRawValue = strokeStyleRawValue
    }

    public var strokeStyle: StrokeStyle? { strokeStyleRawValue.map(StrokeStyle.init(healthKitRawValue:)) }
}

/// A cumulative quantity sample (stroke count, distance in metres) over an interval.
public struct IntervalSampleInput: Equatable, Sendable {
    public var startDate: Date
    public var endDate: Date
    public var value: Double

    public init(startDate: Date, endDate: Date, value: Double) {
        self.startDate = startDate
        self.endDate = endDate
        self.value = value
    }

    var midpoint: Date { startDate.addingTimeInterval(endDate.timeIntervalSince(startDate) / 2) }
}

/// Totals as reported by `HKLiveWorkoutBuilder` statistics; any may be unavailable.
public struct BuilderTotals: Equatable, Sendable {
    public var distanceMetres: Double?
    public var strokeCount: Double?
    public var activeEnergyKcal: Double?
    /// `builder.elapsedTime` at the end — HealthKit's active time, excluding pauses.
    public var activeDurationSeconds: Double?

    public init(distanceMetres: Double? = nil, strokeCount: Double? = nil,
                activeEnergyKcal: Double? = nil, activeDurationSeconds: Double? = nil) {
        self.distanceMetres = distanceMetres
        self.strokeCount = strokeCount
        self.activeEnergyKcal = activeEnergyKcal
        self.activeDurationSeconds = activeDurationSeconds
    }
}

/// Everything collected during and after a workout, ready to be turned into a `SwimRecord`.
public struct SwimAssemblyInput: Sendable {
    public var swimId: String
    public var startDate: Date
    public var endDate: Date
    public var poolLength: PoolLength
    public var events: [WorkoutEventInput]
    public var strokeCountSamples: [IntervalSampleInput]
    public var distanceSamples: [IntervalSampleInput]
    public var heartRate: [SwimRecord.HeartRateSample]
    public var builderTotals: BuilderTotals
    public var submersion: SwimRecord.Submersion?
    public var device: SwimRecord.Device

    public init(swimId: String, startDate: Date, endDate: Date, poolLength: PoolLength,
                events: [WorkoutEventInput], strokeCountSamples: [IntervalSampleInput] = [],
                distanceSamples: [IntervalSampleInput] = [], heartRate: [SwimRecord.HeartRateSample] = [],
                builderTotals: BuilderTotals = BuilderTotals(), submersion: SwimRecord.Submersion? = nil,
                device: SwimRecord.Device) {
        self.swimId = swimId
        self.startDate = startDate
        self.endDate = endDate
        self.poolLength = poolLength
        self.events = events
        self.strokeCountSamples = strokeCountSamples
        self.distanceSamples = distanceSamples
        self.heartRate = heartRate
        self.builderTotals = builderTotals
        self.submersion = submersion
        self.device = device
    }
}

public enum SwimRecordAssembler {
    /// Number of laps HealthKit has detected so far — the live on-screen counter.
    public static func lapCount(in events: [WorkoutEventInput]) -> Int {
        events.lazy.filter { $0.kind == .lap }.count
    }

    public static func assemble(_ input: SwimAssemblyInput) -> SwimRecord {
        let laps = buildLaps(input)
        let pauses = buildPauses(events: input.events, workoutEnd: input.endDate)
        let segments = input.events
            .filter { $0.kind == .segment }
            .sorted { $0.startDate < $1.startDate }
            .enumerated()
            .map { SwimRecord.Segment(index: $0.offset, startDate: $0.element.startDate,
                                      endDate: $0.element.endDate, strokeStyle: $0.element.strokeStyle) }

        let elapsed = max(0, input.endDate.timeIntervalSince(input.startDate))
        let pausedTotal = pauses.reduce(0) { $0 + $1.durationSeconds }
        let active = input.builderTotals.activeDurationSeconds ?? max(0, elapsed - pausedTotal)

        let sampledDistance = input.distanceSamples.isEmpty ? nil : input.distanceSamples.reduce(0) { $0 + $1.value }
        let distance = input.builderTotals.distanceMetres
            ?? sampledDistance
            ?? Double(laps.count) * input.poolLength.metres

        let sampledStrokes = input.strokeCountSamples.isEmpty ? nil : input.strokeCountSamples.reduce(0) { $0 + $1.value }
        let strokes = (input.builderTotals.strokeCount ?? sampledStrokes).map { Int($0.rounded()) }

        let heartRate = input.heartRate.sorted { $0.date < $1.date }
        let submersion = (input.submersion?.isEmpty ?? true) ? nil : input.submersion

        return SwimRecord(
            swimId: input.swimId,
            startDate: input.startDate,
            endDate: input.endDate,
            poolLength: input.poolLength,
            totals: SwimRecord.Totals(
                lapCount: laps.count,
                distanceMetres: distance,
                activeDurationSeconds: active,
                elapsedDurationSeconds: elapsed,
                strokeCount: strokes,
                activeEnergyKcal: input.builderTotals.activeEnergyKcal
            ),
            laps: laps,
            segments: segments,
            pauses: pauses,
            heartRate: heartRate,
            submersion: submersion,
            device: input.device
        )
    }

    /// Laps in time order. Stroke count and distance are correlated post-workout: a sample belongs
    /// to the lap containing its midpoint. When no distance sample lands in a lap, the lap is one
    /// pool length (which is what HealthKit means by a lap).
    static func buildLaps(_ input: SwimAssemblyInput) -> [SwimRecord.Lap] {
        input.events
            .filter { $0.kind == .lap }
            .sorted { $0.startDate < $1.startDate }
            .enumerated()
            .map { offset, event in
                let strokes = sum(of: input.strokeCountSamples, from: event.startDate, to: event.endDate)
                let distance = sum(of: input.distanceSamples, from: event.startDate, to: event.endDate)
                return SwimRecord.Lap(
                    index: offset,
                    startDate: event.startDate,
                    endDate: event.endDate,
                    durationSeconds: max(0, event.endDate.timeIntervalSince(event.startDate)),
                    strokeStyle: event.strokeStyle,
                    strokeCount: strokes.map { Int($0.rounded()) },
                    distanceMetres: distance ?? input.poolLength.metres
                )
            }
    }

    private static func sum(of samples: [IntervalSampleInput], from start: Date, to end: Date) -> Double? {
        let matching = samples.filter { $0.midpoint >= start && $0.midpoint <= end }
        guard !matching.isEmpty else { return nil }
        return matching.reduce(0) { $0 + $1.value }
    }

    /// Pairs each pause (manual or motion) with the next resume. A pause still open when the
    /// workout ended closes at the workout's end.
    static func buildPauses(events: [WorkoutEventInput], workoutEnd: Date) -> [SwimRecord.Pause] {
        var pauses: [SwimRecord.Pause] = []
        var openedAt: Date?
        for event in events.sorted(by: { $0.startDate < $1.startDate }) {
            switch event.kind {
            case .pause, .motionPaused:
                if openedAt == nil { openedAt = event.startDate }
            case .resume, .motionResumed:
                if let start = openedAt {
                    pauses.append(SwimRecord.Pause(startDate: start, endDate: max(start, event.startDate)))
                    openedAt = nil
                }
            default:
                break
            }
        }
        if let start = openedAt {
            pauses.append(SwimRecord.Pause(startDate: start, endDate: max(start, workoutEnd)))
        }
        return pauses
    }
}
