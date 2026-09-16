import Foundation

/// Unit a pool is measured in. Raw values are the JSON v1 wire values.
public enum PoolLengthUnit: String, Codable, CaseIterable, Sendable {
    case metres = "m"
    case yards = "yd"

    public var symbol: String { rawValue }

    public static let metresPerYard = 0.9144
}

/// Length of one pool lap, as configured on the watch before a swim.
public struct PoolLength: Codable, Equatable, Hashable, Sendable {
    public var value: Double
    public var unit: PoolLengthUnit

    public init(value: Double, unit: PoolLengthUnit) {
        self.value = value
        self.unit = unit
    }

    /// Length in metres, whatever unit the pool is measured in.
    public var metres: Double {
        switch unit {
        case .metres: return value
        case .yards:  return value * PoolLengthUnit.metresPerYard
        }
    }

    public var isValid: Bool { value.isFinite && value > 0 && value <= 1000 }

    public static let twentyFiveMetres = PoolLength(value: 25, unit: .metres)
    public static let fiftyMetres = PoolLength(value: 50, unit: .metres)
    public static let twentyFiveYards = PoolLength(value: 25, unit: .yards)
    public static let thirtyThreeAndAThirdMetres = PoolLength(value: 100.0 / 3.0, unit: .metres)

    /// Human label, e.g. "25 m", "33⅓ m", "20.5 yd".
    public var label: String {
        if unit == .metres, abs(value - 100.0 / 3.0) < 0.0001 { return "33⅓ m" }
        let rounded = (value * 100).rounded() / 100
        let number = rounded == rounded.rounded()
            ? String(Int(rounded))
            : String(format: "%g", rounded)
        return "\(number) \(unit.symbol)"
    }
}

/// The choices offered by the pool-length picker.
public enum PoolLengthPreset: String, CaseIterable, Identifiable, Sendable {
    case twentyFiveMetres
    case fiftyMetres
    case twentyFiveYards
    case thirtyThreeAndAThirdMetres
    case custom

    public var id: String { rawValue }

    /// The fixed length for a preset; nil for `.custom`.
    public var poolLength: PoolLength? {
        switch self {
        case .twentyFiveMetres:           return .twentyFiveMetres
        case .fiftyMetres:                return .fiftyMetres
        case .twentyFiveYards:            return .twentyFiveYards
        case .thirtyThreeAndAThirdMetres: return .thirtyThreeAndAThirdMetres
        case .custom:                     return nil
        }
    }

    public var label: String { poolLength?.label ?? "Custom" }

    /// The preset matching a length, or `.custom` if it isn't one of the standard sizes.
    public static func matching(_ length: PoolLength) -> PoolLengthPreset {
        allCases.first { preset in
            guard let p = preset.poolLength else { return false }
            return p.unit == length.unit && abs(p.value - length.value) < 0.0001
        } ?? .custom
    }
}

/// Persists the chosen pool length as JSON in a `UserDefaults` suite.
public struct PoolLengthSetting: Sendable {
    public static let defaultsKey = "poolLength"
    public static let fallback = PoolLength.twentyFiveMetres

    private let defaultsSuite: String?

    public init(suiteName: String? = nil) {
        self.defaultsSuite = suiteName
    }

    private var defaults: UserDefaults {
        defaultsSuite.flatMap(UserDefaults.init(suiteName:)) ?? .standard
    }

    public func load() -> PoolLength {
        guard let data = defaults.data(forKey: Self.defaultsKey),
              let length = try? JSONDecoder().decode(PoolLength.self, from: data),
              length.isValid
        else { return Self.fallback }
        return length
    }

    public func save(_ length: PoolLength) {
        guard length.isValid, let data = try? JSONEncoder().encode(length) else { return }
        defaults.set(data, forKey: Self.defaultsKey)
    }
}
