import Foundation

/// JSON coding for the swim wire format: camelCase keys, ISO-8601 dates with fractional seconds.
public enum SwimJSON {
    public enum DateError: Error, Equatable {
        case invalid(String)
    }

    /// Formats a date as e.g. `2026-09-19T08:30:00.123Z` (UTC, millisecond precision).
    public static func string(from date: Date) -> String {
        date.formatted(Date.ISO8601FormatStyle(includingFractionalSeconds: true))
    }

    /// Parses ISO-8601 with or without fractional seconds, with `Z` or a numeric offset.
    public static func date(from string: String) -> Date? {
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = withFraction.date(from: string) { return date }
        let plain = ISO8601DateFormatter()
        plain.formatOptions = [.withInternetDateTime]
        return plain.date(from: string)
    }

    public static func makeEncoder(pretty: Bool = false) -> JSONEncoder {
        let encoder = JSONEncoder()
        encoder.outputFormatting = pretty ? [.sortedKeys, .prettyPrinted, .withoutEscapingSlashes]
                                          : [.sortedKeys, .withoutEscapingSlashes]
        encoder.dateEncodingStrategy = .custom { date, encoder in
            var container = encoder.singleValueContainer()
            try container.encode(string(from: date))
        }
        return encoder
    }

    public static func makeDecoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let raw = try container.decode(String.self)
            guard let date = date(from: raw) else {
                throw DecodingError.dataCorruptedError(
                    in: container, debugDescription: "Not an ISO-8601 date: \(raw)")
            }
            return date
        }
        return decoder
    }

    public static func encode(_ record: SwimRecord, pretty: Bool = false) throws -> Data {
        try makeEncoder(pretty: pretty).encode(record)
    }

    public static func decode(_ data: Data) throws -> SwimRecord {
        try makeDecoder().decode(SwimRecord.self, from: data)
    }
}
