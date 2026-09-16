// swift-tools-version: 6.2
import PackageDescription

// Pure-Swift core shared by the watch and iPhone apps: the swim record (JSON v1), pool length,
// record assembly from workout events, the sync protocol and pending queues, and the API client.
// Deliberately free of HealthKit/WatchConnectivity so it tests on macOS with `swift test`.
let package = Package(
    name: "LapcatShared",
    platforms: [
        .iOS(.v18),
        .watchOS(.v26),
        .macOS(.v15),
    ],
    products: [
        .library(name: "LapcatShared", targets: ["LapcatShared"]),
    ],
    targets: [
        .target(name: "LapcatShared"),
        .testTarget(
            name: "LapcatSharedTests",
            dependencies: ["LapcatShared"],
            resources: [.copy("Fixtures")]
        ),
    ],
    swiftLanguageModes: [.v5]
)
