# Lapcat — Apple apps

XcodeGen project: `project.yml` → `Lapcat.xcodeproj` (generated, not committed).

| Target | What |
|---|---|
| `LapcatPhone` | iPhone app (`com.nakomis.lapcat`, product name `Lapcat`); embeds the watch app |
| `LapcatWatch` | Single-target watchOS app (`com.nakomis.lapcat.watchkitapp`) |
| `LapcatShared/` | Local Swift package: swim JSON v1 model, record assembly, pending queues, sync protocol, uploader, API client |
| `LapcatPhoneTests` | iOS unit tests (auth/config/ack queue) |
| `LapcatShared/Tests` | `LapcatSharedTests` — the bulk of the coverage, runs on macOS |

Schemes: `Lapcat (Sandbox)`, `Lapcat (Production)`, `LapcatWatch`.

## Build and test

```bash
cd apple
xcodegen generate

# Shared package (macOS, no simulator needed)
(cd LapcatShared && swift test)

# iPhone app + embedded watch app
xcodebuild -project Lapcat.xcodeproj -scheme "Lapcat (Sandbox)" \
  -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build

# Watch app on its own
xcodebuild -project Lapcat.xcodeproj -scheme LapcatWatch \
  -destination 'generic/platform=watchOS Simulator' CODE_SIGNING_ALLOWED=NO build

# iOS tests (LapcatPhoneTests + LapcatSharedTests) on a simulator
xcodebuild test -project Lapcat.xcodeproj -scheme "Lapcat (Sandbox)" \
  -destination 'platform=iOS Simulator,name=iPhone 17' CODE_SIGNING_ALLOWED=NO
```

Lap detection can only be tested on a real watch in a real pool.

## Configuration

Per-environment values live in `project.yml` build settings and are baked into the iPhone app's
Info.plist (the Recipator pattern): `LapcatApiBaseURL`, `LapcatCognitoClientID`,
`LapcatCognitoLoginDomain`. Sandbox is used by the `Debug/Release Sandbox` configurations,
production by `Debug/Release Production`.

The Cognito client ids in `project.yml` come from SSM `/lapcat/{env}/cognito/client-id` (they are
public PKCE client ids, so committing them is fine). If the app clients are ever recreated, update them
there and run `xcodegen generate`. Sign-in shows a clear message if a placeholder is ever put back.

## Depth and water temperature (LAPC-10)

`CMWaterSubmersionManager` needs the `com.apple.developer.submerged-shallow-depth-and-pressure`
entitlement, which Apple grants on request. It is **off by default**, and everything works
without it — the swim record just omits `submersion`.

To switch it on once Apple has granted the entitlement for `com.nakomis.lapcat.watchkitapp`:

1. In `project.yml`, under `LapcatWatch` settings, set `LAPCAT_SUBMERSION: YES`
   (or pass `LAPCAT_SUBMERSION=YES` to `xcodebuild`/fastlane `xcargs` for a one-off build).
2. `xcodegen generate`.

That one setting both signs with `LapcatWatch-Submersion.entitlements` and adds the
`LAPCAT_SUBMERSION` Swift compilation condition, which is what lets `SubmersionRecorder` create a
`CMWaterSubmersionManager`. Signing fails if the entitlement hasn't actually been granted.

## Sync

Watch writes `Application Support/PendingSwims/{swimId}.json` when a workout finishes and sends it
with `WCSession.transferFile` (metadata `swimId`). The iPhone copies it into `PendingUploads/`,
uploads it (`POST /swims/{id}/upload-url` → `PUT` → `POST /swims/{id}`), deletes it, and sends
`transferUserInfo(["ackSwimId": id])`; only then does the watch delete its copy. Swims the server
rejects as invalid are parked in `RejectedUploads/` on the phone (not acked, not retried).

## TestFlight

```bash
cd apple && fastlane beta          # builds Lapcat (Production), uploads to TestFlight
```

App Store Connect API key comes from env vars on CI, or the `app-store-connect` keychain entries
shared with Recipator locally.

The version is read from SSM `/lapcat/prod/version` (profile `nakom.is-admin`, so `aws sso login` first),
or pass `fastlane beta version:x.y.z`. The build number is the commit count.

### First-time setup (already done for Lapcat, 2026-09-17)

- **App Store Connect app record** (`com.nakomis.lapcat`, SKU `lapcat`, app id `6813074014`) has to be
  created by hand: the API can't create apps, and `upload_to_testflight` fails with
  `Couldn't find app 'com.nakomis.lapcat'` until it exists. Xcode registers the bundle ids on the first
  signed build.
- **Internal beta group "Internal"** (all builds, tester `ipod@nakomis.com`). Without a group a processed
  build sits at "Ready for beta testing" and never appears in the TestFlight app.
- **`fastlane pilot builds` is broken** against the current API (`relationship 'buildDeliveries' does not
  exist`). To check processing state, query `/v1/builds?filter[app]=6813074014&include=buildBetaDetail`
  directly with an ES256 JWT built from the keychain entries.
- **Re-uploading an existing `.ipa`** without rebuilding: `fastlane pilot upload --ipa Lapcat.ipa
  --api_key_path <json>` (write the JSON from the keychain to a temp file and delete it afterwards).
