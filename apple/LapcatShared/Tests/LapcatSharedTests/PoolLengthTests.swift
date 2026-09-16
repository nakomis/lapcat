import XCTest
@testable import LapcatShared

final class PoolLengthTests: XCTestCase {

    func testMetresConversion() {
        XCTAssertEqual(PoolLength.twentyFiveMetres.metres, 25)
        XCTAssertEqual(PoolLength.twentyFiveYards.metres, 22.86, accuracy: 0.0001)
        XCTAssertEqual(PoolLength.thirtyThreeAndAThirdMetres.metres * 3, 100, accuracy: 0.0001)
    }

    func testLabels() {
        XCTAssertEqual(PoolLength.twentyFiveMetres.label, "25 m")
        XCTAssertEqual(PoolLength.fiftyMetres.label, "50 m")
        XCTAssertEqual(PoolLength.twentyFiveYards.label, "25 yd")
        XCTAssertEqual(PoolLength.thirtyThreeAndAThirdMetres.label, "33⅓ m")
        XCTAssertEqual(PoolLength(value: 20.5, unit: .yards).label, "20.5 yd")
        XCTAssertEqual(PoolLengthPreset.custom.label, "Custom")
    }

    func testPresetMatching() {
        XCTAssertEqual(PoolLengthPreset.matching(.fiftyMetres), .fiftyMetres)
        XCTAssertEqual(PoolLengthPreset.matching(PoolLength(value: 100.0 / 3.0, unit: .metres)), .thirtyThreeAndAThirdMetres)
        XCTAssertEqual(PoolLengthPreset.matching(PoolLength(value: 25, unit: .yards)), .twentyFiveYards)
        XCTAssertEqual(PoolLengthPreset.matching(PoolLength(value: 50, unit: .yards)), .custom)
        XCTAssertEqual(PoolLengthPreset.matching(PoolLength(value: 20, unit: .metres)), .custom)
    }

    func testValidity() {
        XCTAssertTrue(PoolLength(value: 12.5, unit: .metres).isValid)
        XCTAssertFalse(PoolLength(value: 0, unit: .metres).isValid)
        XCTAssertFalse(PoolLength(value: -25, unit: .yards).isValid)
        XCTAssertFalse(PoolLength(value: .nan, unit: .metres).isValid)
    }

    func testWireUnits() throws {
        let data = try JSONEncoder().encode(PoolLength.twentyFiveYards)
        XCTAssertEqual(String(data: data, encoding: .utf8)?.contains(#""unit":"yd""#), true)
        XCTAssertEqual(PoolLengthUnit.metres.rawValue, "m")
    }

    func testSettingPersistsAndFallsBack() throws {
        let suite = "lapcat-tests-\(UUID().uuidString)"
        defer { UserDefaults().removePersistentDomain(forName: suite) }
        let setting = PoolLengthSetting(suiteName: suite)

        XCTAssertEqual(setting.load(), .twentyFiveMetres, "defaults to 25 m")
        setting.save(PoolLength(value: 33, unit: .yards))
        XCTAssertEqual(setting.load(), PoolLength(value: 33, unit: .yards))

        setting.save(PoolLength(value: 0, unit: .metres))
        XCTAssertEqual(setting.load(), PoolLength(value: 33, unit: .yards), "invalid lengths are ignored")

        UserDefaults(suiteName: suite)?.set(Data("junk".utf8), forKey: PoolLengthSetting.defaultsKey)
        XCTAssertEqual(setting.load(), .twentyFiveMetres, "corrupt data falls back")
    }
}
