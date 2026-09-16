import CoreMotion
import Foundation
import LapcatShared

/// Records depth and water temperature during a swim via `CMWaterSubmersionManager`.
///
/// Needs the `com.apple.developer.submerged-shallow-depth-and-pressure` entitlement (LAPC-10),
/// which Apple may not have granted yet. The manager is only ever created when the app is built
/// with the `LAPCAT_SUBMERSION` compilation condition — see `apple/README.md` for the switch.
/// Without it `start()` does nothing and `stop()` returns nil, so the swim record simply omits
/// its `submersion` field.
final class SubmersionRecorder: NSObject, CMWaterSubmersionManagerDelegate {
    static var isEnabledInBuild: Bool {
        #if LAPCAT_SUBMERSION
        return true
        #else
        return false
        #endif
    }

    private let lock = NSLock()
    private var manager: CMWaterSubmersionManager?
    private var depth: [SwimRecord.DepthSample] = []
    private var temperature: [SwimRecord.TemperatureSample] = []

    /// Whether this build and this device can record submersion data at all.
    var isAvailable: Bool {
        Self.isEnabledInBuild && CMWaterSubmersionManager.waterSubmersionAvailable
    }

    func start() {
        guard isAvailable else { return }
        lock.lock()
        depth = []
        temperature = []
        lock.unlock()
        let manager = CMWaterSubmersionManager()
        // Setting the delegate starts updates (and triggers the Motion & Fitness prompt).
        manager.delegate = self
        self.manager = manager
    }

    /// Stops updates and returns what was recorded, or nil if nothing was.
    func stop() -> SwimRecord.Submersion? {
        manager?.delegate = nil
        manager = nil
        lock.lock(); defer { lock.unlock() }
        let result = SwimRecord.Submersion(depth: depth, waterTemperature: temperature)
        return result.isEmpty ? nil : result
    }

    // MARK: CMWaterSubmersionManagerDelegate

    func manager(_ manager: CMWaterSubmersionManager, didUpdate event: CMWaterSubmersionEvent) {}

    func manager(_ manager: CMWaterSubmersionManager, didUpdate measurement: CMWaterSubmersionMeasurement) {
        guard let metres = measurement.depth?.converted(to: .meters).value else { return }
        lock.lock(); defer { lock.unlock() }
        depth.append(.init(date: measurement.date, metres: metres))
    }

    func manager(_ manager: CMWaterSubmersionManager, didUpdate measurement: CMWaterTemperature) {
        let celsius = measurement.temperature.converted(to: .celsius).value
        lock.lock(); defer { lock.unlock() }
        temperature.append(.init(date: measurement.date, celsius: celsius))
    }

    func manager(_ manager: CMWaterSubmersionManager, errorOccurred error: Error) {
        NSLog("Lapcat: water submersion error: \(error.localizedDescription)")
    }
}
