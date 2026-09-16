import Foundation

/// Environment config baked in at build time via Info.plist (Recipator pattern).
/// Values differ between the Sandbox and Production build configurations — see `project.yml`.
enum AppConfig {
    static let apiBaseURL: String         = plist("LapcatApiBaseURL")
    static let cognitoClientID: String    = plist("LapcatCognitoClientID")
    static let cognitoLoginDomain: String = plist("LapcatCognitoLoginDomain")
    static let cognitoRedirectURI         = "com.nakomis.lapcat://callback"

    /// True when this build points at the sandbox API (vs production).
    static var isSandbox: Bool { apiBaseURL.contains("sandbox") }

    /// False while `project.yml` still carries the placeholder client id.
    static var isConfigured: Bool { !cognitoClientID.hasPrefix("REPLACE_") }

    private static func plist(_ key: String) -> String {
        guard let value = Bundle.main.infoDictionary?[key] as? String, !value.isEmpty else {
            fatalError("Missing Info.plist key: \(key)")
        }
        return value
    }
}

extension Bundle {
    /// User-facing version label, e.g. "v1.0 (114)".
    var versionLabel: String {
        let short = infoDictionary?["CFBundleShortVersionString"] as? String ?? "?"
        let build = infoDictionary?["CFBundleVersion"] as? String ?? "?"
        return "v\(short) (\(build))"
    }
}
