import Foundation

/// Stroke style as recorded by HealthKit. Raw values are the JSON v1 wire values.
public enum StrokeStyle: String, Codable, CaseIterable, Sendable {
    case unknown, mixed, freestyle, backstroke, breaststroke, butterfly, kickboard

    /// Maps `HKSwimmingStrokeStyle`'s raw value (as found under `HKMetadataKeySwimmingStrokeStyle`).
    /// Kept numeric here so this module needs no HealthKit import.
    public init(healthKitRawValue: Int) {
        switch healthKitRawValue {
        case 1: self = .mixed
        case 2: self = .freestyle
        case 3: self = .backstroke
        case 4: self = .breaststroke
        case 5: self = .butterfly
        case 6: self = .kickboard
        default: self = .unknown
        }
    }

    public var displayName: String {
        switch self {
        case .unknown:      return "Unknown"
        case .mixed:        return "Mixed"
        case .freestyle:    return "Freestyle"
        case .backstroke:   return "Backstroke"
        case .breaststroke: return "Breaststroke"
        case .butterfly:    return "Butterfly"
        case .kickboard:    return "Kickboard"
        }
    }
}

/// A complete swim, exactly as uploaded to the backend (swim JSON schema v1).
///
/// Optional properties are omitted from the JSON when nil (synthesised `Codable` uses
/// `encodeIfPresent`), never written as `null`.
public struct SwimRecord: Codable, Equatable, Sendable, Identifiable {
    public static let currentSchemaVersion = 1

    public var schemaVersion: Int
    public var swimId: String
    public var startDate: Date
    public var endDate: Date
    public var poolLength: PoolLength
    public var totals: Totals
    public var laps: [Lap]
    public var segments: [Segment]
    public var pauses: [Pause]
    public var heartRate: [HeartRateSample]
    public var submersion: Submersion?
    public var device: Device

    public var id: String { swimId }

    public init(
        schemaVersion: Int = SwimRecord.currentSchemaVersion,
        swimId: String,
        startDate: Date,
        endDate: Date,
        poolLength: PoolLength,
        totals: Totals,
        laps: [Lap] = [],
        segments: [Segment] = [],
        pauses: [Pause] = [],
        heartRate: [HeartRateSample] = [],
        submersion: Submersion? = nil,
        device: Device
    ) {
        self.schemaVersion = schemaVersion
        self.swimId = swimId
        self.startDate = startDate
        self.endDate = endDate
        self.poolLength = poolLength
        self.totals = totals
        self.laps = laps
        self.segments = segments
        self.pauses = pauses
        self.heartRate = heartRate
        self.submersion = submersion
        self.device = device
    }

    /// A new swim identifier: a lower-case UUID string.
    public static func newSwimId() -> String { UUID().uuidString.lowercased() }

    public struct Totals: Codable, Equatable, Sendable {
        public var lapCount: Int
        public var distanceMetres: Double
        public var activeDurationSeconds: Double
        public var elapsedDurationSeconds: Double
        public var strokeCount: Int?
        public var activeEnergyKcal: Double?

        public init(lapCount: Int, distanceMetres: Double, activeDurationSeconds: Double,
                    elapsedDurationSeconds: Double, strokeCount: Int? = nil, activeEnergyKcal: Double? = nil) {
            self.lapCount = lapCount
            self.distanceMetres = distanceMetres
            self.activeDurationSeconds = activeDurationSeconds
            self.elapsedDurationSeconds = elapsedDurationSeconds
            self.strokeCount = strokeCount
            self.activeEnergyKcal = activeEnergyKcal
        }
    }

    public struct Lap: Codable, Equatable, Sendable {
        public var index: Int
        public var startDate: Date
        public var endDate: Date
        public var durationSeconds: Double
        public var strokeStyle: StrokeStyle?
        public var strokeCount: Int?
        public var distanceMetres: Double?

        public init(index: Int, startDate: Date, endDate: Date, durationSeconds: Double,
                    strokeStyle: StrokeStyle? = nil, strokeCount: Int? = nil, distanceMetres: Double? = nil) {
            self.index = index
            self.startDate = startDate
            self.endDate = endDate
            self.durationSeconds = durationSeconds
            self.strokeStyle = strokeStyle
            self.strokeCount = strokeCount
            self.distanceMetres = distanceMetres
        }
    }

    public struct Segment: Codable, Equatable, Sendable {
        public var index: Int
        public var startDate: Date
        public var endDate: Date
        public var strokeStyle: StrokeStyle?

        public init(index: Int, startDate: Date, endDate: Date, strokeStyle: StrokeStyle? = nil) {
            self.index = index
            self.startDate = startDate
            self.endDate = endDate
            self.strokeStyle = strokeStyle
        }
    }

    public struct Pause: Codable, Equatable, Sendable {
        public var startDate: Date
        public var endDate: Date

        public init(startDate: Date, endDate: Date) {
            self.startDate = startDate
            self.endDate = endDate
        }

        public var durationSeconds: Double { endDate.timeIntervalSince(startDate) }
    }

    public struct HeartRateSample: Codable, Equatable, Sendable {
        public var date: Date
        public var bpm: Double

        public init(date: Date, bpm: Double) {
            self.date = date
            self.bpm = bpm
        }
    }

    public struct Submersion: Codable, Equatable, Sendable {
        public var depth: [DepthSample]
        public var waterTemperature: [TemperatureSample]

        public init(depth: [DepthSample] = [], waterTemperature: [TemperatureSample] = []) {
            self.depth = depth
            self.waterTemperature = waterTemperature
        }

        public var isEmpty: Bool { depth.isEmpty && waterTemperature.isEmpty }
    }

    public struct DepthSample: Codable, Equatable, Sendable {
        public var date: Date
        public var metres: Double

        public init(date: Date, metres: Double) {
            self.date = date
            self.metres = metres
        }
    }

    public struct TemperatureSample: Codable, Equatable, Sendable {
        public var date: Date
        public var celsius: Double

        public init(date: Date, celsius: Double) {
            self.date = date
            self.celsius = celsius
        }
    }

    public struct Device: Codable, Equatable, Sendable {
        public var model: String
        public var osVersion: String
        public var appVersion: String

        public init(model: String, osVersion: String, appVersion: String) {
            self.model = model
            self.osVersion = osVersion
            self.appVersion = appVersion
        }
    }
}
