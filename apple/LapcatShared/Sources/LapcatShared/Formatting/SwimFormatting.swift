import Foundation

/// Display formatting shared by the watch and phone.
public enum SwimFormatting {
    /// `mm:ss` below an hour, `h:mm:ss` above. Negative and non-finite values show as 0:00.
    public static func duration(_ seconds: Double) -> String {
        let total = seconds.isFinite ? max(0, Int(seconds.rounded(.down))) : 0
        let h = total / 3600, m = (total % 3600) / 60, s = total % 60
        return h > 0 ? String(format: "%d:%02d:%02d", h, m, s) : String(format: "%d:%02d", m, s)
    }

    /// Lap split with tenths, e.g. `38.2s` or `1:05.4`.
    public static func split(_ seconds: Double) -> String {
        let clamped = seconds.isFinite ? max(0, seconds) : 0
        let tenths = Int((clamped * 10).rounded())
        let minutes = tenths / 600
        let rest = Double(tenths - minutes * 600) / 10
        return minutes > 0 ? String(format: "%d:%04.1f", minutes, rest) : String(format: "%.1fs", rest)
    }

    /// Distance in the pool's own unit, e.g. `1000 m` or `500 yd`.
    public static func distance(metres: Double, unit: PoolLengthUnit) -> String {
        let value = unit == .yards ? metres / PoolLengthUnit.metresPerYard : metres
        return "\(Int(value.rounded())) \(unit.symbol)"
    }
}
