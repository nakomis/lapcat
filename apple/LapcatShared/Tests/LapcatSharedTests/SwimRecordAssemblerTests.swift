import XCTest
@testable import LapcatShared

final class SwimRecordAssemblerTests: XCTestCase {
    private let t0 = Date(timeIntervalSince1970: 1_789_800_000)
    private let device = SwimRecord.Device(model: "Watch7,12", osVersion: "27.0", appVersion: "1.0 (1)")

    private func at(_ seconds: Double) -> Date { t0.addingTimeInterval(seconds) }

    private func lap(_ from: Double, _ to: Double, style: Int? = 2) -> WorkoutEventInput {
        WorkoutEventInput(kind: .lap, startDate: at(from), endDate: at(to), strokeStyleRawValue: style)
    }

    private func input(events: [WorkoutEventInput],
                       strokes: [IntervalSampleInput] = [],
                       distance: [IntervalSampleInput] = [],
                       totals: BuilderTotals = BuilderTotals(),
                       submersion: SwimRecord.Submersion? = nil,
                       end: Double = 600,
                       pool: PoolLength = .twentyFiveMetres) -> SwimAssemblyInput {
        SwimAssemblyInput(swimId: "swim-1", startDate: t0, endDate: at(end), poolLength: pool,
                          events: events, strokeCountSamples: strokes, distanceSamples: distance,
                          heartRate: [.init(date: at(20), bpm: 140), .init(date: at(10), bpm: 120)],
                          builderTotals: totals, submersion: submersion, device: device)
    }

    func testLapCountIgnoresOtherEvents() {
        let events = [lap(0, 30), WorkoutEventInput(kind: .segment, startDate: at(0), endDate: at(60)),
                      lap(30, 60), WorkoutEventInput(kind: .pause, startDate: at(61), endDate: at(61))]
        XCTAssertEqual(SwimRecordAssembler.lapCount(in: events), 2)
        XCTAssertEqual(SwimRecordAssembler.lapCount(in: []), 0)
    }

    func testLapsAreSortedIndexedAndTimed() {
        let record = SwimRecordAssembler.assemble(input(events: [lap(40, 85, style: 4), lap(2, 40)]))
        XCTAssertEqual(record.laps.map(\.index), [0, 1])
        XCTAssertEqual(record.laps.map(\.startDate), [at(2), at(40)])
        XCTAssertEqual(record.laps.map(\.durationSeconds), [38, 45])
        XCTAssertEqual(record.laps.map(\.strokeStyle), [.freestyle, .breaststroke])
        XCTAssertEqual(record.totals.lapCount, 2)
    }

    func testLapWithoutStrokeMetadataHasNoStyle() {
        let record = SwimRecordAssembler.assemble(input(events: [lap(0, 30, style: nil)]))
        XCTAssertNil(record.laps[0].strokeStyle)
    }

    func testSamplesCorrelateToLapByMidpoint() {
        let strokes = [
            IntervalSampleInput(startDate: at(0), endDate: at(10), value: 8),   // mid 5 → lap 0
            IntervalSampleInput(startDate: at(25), endDate: at(33), value: 6),  // mid 29 → lap 0
            IntervalSampleInput(startDate: at(28), endDate: at(40), value: 7),  // mid 34 → lap 1
        ]
        let distance = [IntervalSampleInput(startDate: at(30), endDate: at(60), value: 25)]
        let record = SwimRecordAssembler.assemble(input(events: [lap(0, 30), lap(30, 60), lap(60, 90)],
                                                        strokes: strokes, distance: distance))
        XCTAssertEqual(record.laps.map(\.strokeCount), [14, 7, nil])
        // Lap 1 has a sample; laps 0 and 2 fall back to one pool length.
        XCTAssertEqual(record.laps.map(\.distanceMetres), [25, 25, 25])
        XCTAssertEqual(record.totals.strokeCount, 21, "no builder total → sum of samples")
        XCTAssertEqual(record.totals.distanceMetres, 25, "no builder total → sum of samples")
    }

    func testYardPoolLapDistanceFallbackIsInMetres() {
        let record = SwimRecordAssembler.assemble(input(events: [lap(0, 30)], pool: .twentyFiveYards))
        XCTAssertEqual(try XCTUnwrap(record.laps[0].distanceMetres), 22.86, accuracy: 0.0001)
        XCTAssertEqual(record.totals.distanceMetres, 22.86, accuracy: 0.0001)
    }

    func testBuilderTotalsTakePrecedence() {
        let totals = BuilderTotals(distanceMetres: 1000, strokeCount: 899.6, activeEnergyKcal: 350, activeDurationSeconds: 1500)
        let record = SwimRecordAssembler.assemble(input(
            events: [lap(0, 30)],
            strokes: [IntervalSampleInput(startDate: at(0), endDate: at(30), value: 20)],
            totals: totals, end: 1800))
        XCTAssertEqual(record.totals.distanceMetres, 1000)
        XCTAssertEqual(record.totals.strokeCount, 900)
        XCTAssertEqual(record.totals.activeEnergyKcal, 350)
        XCTAssertEqual(record.totals.activeDurationSeconds, 1500)
        XCTAssertEqual(record.totals.elapsedDurationSeconds, 1800)
    }

    func testNoStrokeDataMeansStrokeCountOmitted() {
        let record = SwimRecordAssembler.assemble(input(events: [lap(0, 30)]))
        XCTAssertNil(record.totals.strokeCount)
        XCTAssertNil(record.totals.activeEnergyKcal)
        XCTAssertNil(record.laps[0].strokeCount)
    }

    func testPausesPairManualAndMotionEvents() {
        let events = [
            WorkoutEventInput(kind: .pause, startDate: at(100), endDate: at(100)),
            WorkoutEventInput(kind: .resume, startDate: at(160), endDate: at(160)),
            WorkoutEventInput(kind: .motionPaused, startDate: at(300), endDate: at(300)),
            WorkoutEventInput(kind: .motionPaused, startDate: at(305), endDate: at(305)), // duplicate, ignored
            WorkoutEventInput(kind: .motionResumed, startDate: at(320), endDate: at(320)),
            WorkoutEventInput(kind: .resume, startDate: at(400), endDate: at(400)),       // unmatched resume, ignored
            WorkoutEventInput(kind: .pause, startDate: at(550), endDate: at(550)),        // open at the end
        ]
        let record = SwimRecordAssembler.assemble(input(events: events, end: 600))
        XCTAssertEqual(record.pauses, [
            .init(startDate: at(100), endDate: at(160)),
            .init(startDate: at(300), endDate: at(320)),
            .init(startDate: at(550), endDate: at(600)),
        ])
        // No builder active time → elapsed minus pauses (600 − 60 − 20 − 50).
        XCTAssertEqual(record.totals.activeDurationSeconds, 470)
    }

    func testSegmentsHeartRateAndSubmersion() {
        let events = [
            WorkoutEventInput(kind: .segment, startDate: at(200), endDate: at(300), strokeStyleRawValue: 3),
            WorkoutEventInput(kind: .segment, startDate: at(0), endDate: at(200), strokeStyleRawValue: 1),
        ]
        let submersion = SwimRecord.Submersion(depth: [.init(date: at(5), metres: 1.1)])
        let record = SwimRecordAssembler.assemble(input(events: events, submersion: submersion))
        XCTAssertEqual(record.segments.map(\.strokeStyle), [.mixed, .backstroke])
        XCTAssertEqual(record.segments.map(\.index), [0, 1])
        XCTAssertEqual(record.heartRate.map(\.bpm), [120, 140], "sorted by date")
        XCTAssertEqual(record.submersion, submersion)
    }

    func testEmptySubmersionIsOmitted() {
        let record = SwimRecordAssembler.assemble(input(events: [], submersion: SwimRecord.Submersion()))
        XCTAssertNil(record.submersion)
        XCTAssertEqual(record.totals.lapCount, 0)
        XCTAssertEqual(record.totals.distanceMetres, 0)
    }

    func testAssembledRecordSurvivesEncoding() throws {
        let record = SwimRecordAssembler.assemble(input(events: [lap(0.123, 38.456)]))
        let decoded = try SwimJSON.decode(try SwimJSON.encode(record))
        XCTAssertEqual(decoded.swimId, record.swimId)
        XCTAssertEqual(decoded.laps.count, 1)
        XCTAssertEqual(decoded.laps[0].startDate.timeIntervalSince1970,
                       record.laps[0].startDate.timeIntervalSince1970, accuracy: 0.001)
    }
}
