import XCTest
@testable import LapcatShared

final class SwimRecordCodingTests: XCTestCase {

    private func fixture(_ name: String) throws -> Data {
        let url = try XCTUnwrap(Bundle.module.url(forResource: name, withExtension: "json", subdirectory: "Fixtures"))
        return try Data(contentsOf: url)
    }

    private func jsonObject(_ data: Data) throws -> NSDictionary {
        try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? NSDictionary)
    }

    func testFullFixtureRoundTripsExactly() throws {
        let data = try fixture("swim-v1")
        let record = try SwimJSON.decode(data)
        let reencoded = try SwimJSON.encode(record)
        XCTAssertEqual(try jsonObject(reencoded), try jsonObject(data))
    }

    func testFullFixtureDecodesValues() throws {
        let record = try SwimJSON.decode(try fixture("swim-v1"))
        XCTAssertEqual(record.schemaVersion, 1)
        XCTAssertEqual(record.poolLength, PoolLength(value: 25, unit: .metres))
        XCTAssertEqual(record.totals.lapCount, 2)
        XCTAssertEqual(record.totals.strokeCount, 45)
        XCTAssertEqual(record.laps.map(\.strokeStyle), [.freestyle, .breaststroke])
        XCTAssertEqual(record.laps[0].durationSeconds, 38.2, accuracy: 0.0001)
        XCTAssertEqual(record.segments.first?.strokeStyle, .mixed)
        XCTAssertEqual(record.heartRate.last?.bpm, 132.5)
        XCTAssertEqual(record.submersion?.depth.first?.metres, 1.2)
        XCTAssertEqual(record.submersion?.waterTemperature.first?.celsius, 28.1)
        XCTAssertEqual(record.device.model, "Watch7,12")
        XCTAssertEqual(SwimJSON.string(from: record.laps[0].startDate), "2026-09-19T08:30:05.250Z")
    }

    func testOptionalFieldsAreOmittedNotNull() throws {
        let data = try fixture("swim-v1-minimal")
        let record = try SwimJSON.decode(data)
        XCTAssertNil(record.submersion)
        XCTAssertNil(record.totals.strokeCount)

        let encoded = try SwimJSON.encode(record)
        let text = try XCTUnwrap(String(data: encoded, encoding: .utf8))
        XCTAssertFalse(text.contains("null"))
        XCTAssertFalse(text.contains("submersion"))
        XCTAssertFalse(text.contains("strokeCount"))
        XCTAssertFalse(text.contains("activeEnergyKcal"))

        let object = try jsonObject(encoded)
        XCTAssertEqual((object["poolLength"] as? NSDictionary)?["unit"] as? String, "yd")
        XCTAssertNotNil(object["laps"] as? NSArray, "arrays are always present, even when empty")
    }

    func testDecodesOffsetsAndMissingFractionalSeconds() throws {
        let record = try SwimJSON.decode(try fixture("swim-v1-minimal"))
        // 08:30+01:00 is 07:30Z, and the end date has no fractional part.
        XCTAssertEqual(SwimJSON.string(from: record.startDate), "2026-09-19T07:30:00.000Z")
        XCTAssertEqual(SwimJSON.string(from: record.endDate), "2026-09-19T08:31:00.000Z")
    }

    func testEncodedDatesHaveFractionalSecondsAndZ() throws {
        let date = Date(timeIntervalSince1970: 1_789_000_000.125)
        let text = SwimJSON.string(from: date)
        XCTAssertTrue(text.hasSuffix(".125Z"), text)
        XCTAssertEqual(SwimJSON.date(from: text), date)
    }

    func testRejectsNonIsoDate() {
        let json = #"{"date":"19/09/2026","bpm":120}"#
        XCTAssertThrowsError(try SwimJSON.makeDecoder().decode(SwimRecord.HeartRateSample.self, from: Data(json.utf8)))
    }

    func testEncodedKeysAreExactlyTheV1Schema() throws {
        let object = try jsonObject(try SwimJSON.encode(try SwimJSON.decode(try fixture("swim-v1"))))
        XCTAssertEqual(Set(object.allKeys as? [String] ?? []), [
            "schemaVersion", "swimId", "startDate", "endDate", "poolLength", "totals", "laps",
            "segments", "pauses", "heartRate", "submersion", "device",
        ])
        let lap = try XCTUnwrap((object["laps"] as? [NSDictionary])?.first)
        XCTAssertEqual(Set(lap.allKeys as? [String] ?? []), [
            "index", "startDate", "endDate", "durationSeconds", "strokeStyle", "strokeCount", "distanceMetres",
        ])
        let totals = try XCTUnwrap(object["totals"] as? NSDictionary)
        XCTAssertEqual(Set(totals.allKeys as? [String] ?? []), [
            "lapCount", "distanceMetres", "activeDurationSeconds", "elapsedDurationSeconds", "strokeCount", "activeEnergyKcal",
        ])
    }

    func testStrokeStyleFromHealthKitRawValues() {
        XCTAssertEqual((0...6).map(StrokeStyle.init(healthKitRawValue:)),
                       [.unknown, .mixed, .freestyle, .backstroke, .breaststroke, .butterfly, .kickboard])
        XCTAssertEqual(StrokeStyle(healthKitRawValue: 99), .unknown)
    }

    func testNewSwimIdIsLowerCaseUUID() {
        let id = SwimRecord.newSwimId()
        XCTAssertEqual(id, id.lowercased())
        XCTAssertNotNil(UUID(uuidString: id))
    }
}
