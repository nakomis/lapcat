# Lapcat

Swim lap counter for Apple Watch, with an iPhone companion and AWS backend that record every detail of each swim.

Plane project: `LAPC` (https://plane.home.nakomis.com). Branches/PRs carry the ref, e.g. `lapc-4-lap-count`.

## Stack

- **Apple** — Swift, SwiftUI, XcodeGen (`apple/project.yml`; `*.xcodeproj` is generated, not committed).
  watchOS app embedded in an iPhone app. Team `62YFUFBSFX`; bundles `com.nakomis.lapcat` (iPhone)
  and `com.nakomis.lapcat.watchkitapp` (watch). Target hardware: Apple Watch Series 12.
- **Swim tracking** — `HKWorkoutSession` `.swimming` with `swimmingLocationType = .pool` and `lapLength`;
  laps come from `.lap` workout events on `HKLiveWorkoutBuilder`. Use HealthKit's built-in lap detection,
  not hand-rolled accelerometer turn detection. Water Lock via `WKInterfaceDevice.current().enableWaterLock()`.
- **Depth / water temperature** — `CMWaterSubmersionManager`, needs the shallow-depth entitlement (LAPC-10).
  Everything must work without it; the fields are simply absent.
- **Sync** — watch keeps each swim's JSON on disk until the iPhone acknowledges a confirmed upload
  (`WCSession.transferFile` → iPhone pending queue → presigned S3 PUT → `POST /swims/{id}` confirm → ack).
- **Backend** — CDK TypeScript (pnpm) in `infra/`. HTTP API + Node Lambdas, Cognito JWT authoriser on the
  **shared** user pool (`/nakomis-infra/{env}/cognito/user-pool-id`), multi-user from day one.
  S3 holds raw swim JSON (`users/{sub}/swims/{swimId}.json`); DynamoDB `lapcat-swims-{env}` (userId PK,
  swimId SK) holds the summary/index row.
- **Distribution** — TestFlight only, via fastlane in `apple/fastlane` (Recipator pattern).
- **Reference implementation** — `~/repos/nakomis/recipator` (iOS + CDK + fastlane + Cognito PKCE).

## AWS credentials

- Sandbox: `AWS_PROFILE=nakom.is-sandbox` (account `975050268859`)
- Production: `AWS_PROFILE=nakom.is-admin` (account `637423226886`)

## Repository layout

| Directory | Purpose |
|---|---|
| `apple/` | XcodeGen project: `LapcatWatch/`, `LapcatPhone/`, `Shared/` (swim model, sync protocol), tests, `fastlane/` |
| `infra/` | CDK app, Lambdas, tests |
| `docs/` | Logo (`logo.png`, `logo-candidates/`), architecture diagrams |

## Testing

- Infra: `cd infra && pnpm test` (Jest, 70% coverage minimum)
- Apple: `cd apple && xcodegen generate && xcodebuild test -scheme LapcatShared ...` — see `apple/README` notes in CI
- Lap detection itself can only be verified on a real watch in a real pool.

## Architecture diagrams

Source: `docs/architecture/lapcat.drawio` — SVG auto-regenerated on commit by `.githooks/pre-commit`.

```bash
git config core.hooksPath .githooks
```
