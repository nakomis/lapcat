import Foundation
import LapcatShared
import WatchKit

enum DeviceInfo {
    static func current() -> SwimRecord.Device {
        SwimRecord.Device(model: modelIdentifier(),
                          osVersion: WKInterfaceDevice.current().systemVersion,
                          appVersion: appVersion())
    }

    /// Hardware identifier, e.g. "Watch7,12" (the simulator reports the model it's simulating).
    static func modelIdentifier() -> String {
        if let simulated = ProcessInfo.processInfo.environment["SIMULATOR_MODEL_IDENTIFIER"] {
            return simulated
        }
        var info = utsname()
        uname(&info)
        return withUnsafeBytes(of: &info.machine) { buffer in
            String(decoding: buffer.prefix(while: { $0 != 0 }), as: UTF8.self)
        }
    }

    /// "1.0 (1)"
    static func appVersion() -> String {
        let info = Bundle.main.infoDictionary
        let short = info?["CFBundleShortVersionString"] as? String ?? "?"
        let build = info?["CFBundleVersion"] as? String ?? "?"
        return "\(short) (\(build))"
    }
}
