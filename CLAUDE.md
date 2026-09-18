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
- **Depth / water temperature** — `CMWaterSubmersionManager` with the shallow-depth entitlement (LAPC-10, enabled
  on the watch App ID). Everything must still work when no readings arrive; the fields are simply absent.
- **Sync** — watch keeps each swim's JSON on disk until the iPhone acknowledges a confirmed upload
  (`WCSession.transferFile` → iPhone pending queue → presigned S3 PUT → `POST /swims/{id}` confirm → ack).
- **Backend** — CDK TypeScript (pnpm) in `infra/`. HTTP API + Node Lambdas, Cognito JWT authoriser on the
  **shared** user pool (`/nakomis-infra/{env}/cognito/user-pool-id`), multi-user from day one.
  S3 holds raw swim JSON (`users/{sub}/swims/{swimId}.json`); DynamoDB `lapcat-swims-{env}` (userId PK,
  swimId SK) holds the summary/index row.
- **Distribution** — TestFlight only, via `fastlane beta` in `apple/fastlane`, run locally (Recipator pattern). Config (API URL, Cognito client id/domain) is per-build-configuration in `project.yml` → Info.plist.
- **Versioning** — shared deployment tracker (`nakomis-deployments`, project key `lapcat`). CI computes the version once per merge, deploys it to sandbox then prod, and publishes it to SSM `/lapcat/{env}/version`; `fastlane beta` stamps `MARKETING_VERSION` from `/lapcat/prod/version`, build number = commit count. Bump with `--bump-minor`/`--bump-major` in the PR description.
- **Submersion entitlement** — build setting `LAPCAT_SUBMERSION` (`YES` since LAPC-10) picks the entitlements file and Swift flag; see `apple/README.md`.
- **Web portal (LAPC-12)** — `lapcat.nakomis.com` / `lapcat.sandbox.nakomis.com`. Swim history and graphs.
  Vite + React 19 + Tailwind 4 + shadcn `ui/` + Biome + Vitest (pnpm) in `web/`, nakostat look and feel.
  `LapcatWebCertStack` (us-east-1 cert) + `LapcatWebStack` (private S3 + OAC, CloudFront with a viewer-request
  SPA-rewrite function and **no** `errorResponses`, Route53, Cognito client `lapcat-web-{env}` + One Dark managed
  login branding). SSM `/lapcat/{env}/web/{client-id,user-pool-id,login-domain,bucket,distribution-id}`.
  The API's JWT authoriser accepts both the iOS and web client ids; ApiStack reads the web client id from SSM,
  so `LapcatWebStack` deploys first. The SPA sends the **ID token** (access tokens carry no `email`).
  Config: `web/scripts/set-config.sh <sandbox|prod|localhost>` → `src/config/config.json` (gitignored).
  Footer version comes from `src/version.json`, overwritten by CI with the tracker version.
  API CORS (`corsPreflight` on the HTTP API) and S3 CORS (on the swims bucket, for `fetch()`-ing the presigned
  download URL) allow `https://lapcat.{zone}` plus `http://localhost:3000` on sandbox only — never on prod.
  Home shows last-30-days stat tiles, a distance-per-week bar chart and a pace-over-time line chart (Recharts,
  pinned `3.10.1`), plus the swim list; `/swims/$swimId` adds lap splits (coloured by stroke style), heart rate
  with shaded rest periods, and water temperature/depth when `submersion` is present. Chart colours are the
  dataviz skill's default categorical palette, re-validated against this app's own dark card surface
  (`#21252b`) rather than the skill's own — see `web/src/lib/chart-colors.ts`.
- **Reference implementations** — `~/repos/nakomis/nakostat` (CI/CD, Cognito, web) and `~/repos/nakomis/recipator` (iOS app, fastlane, Cognito PKCE).

## AWS credentials

- Sandbox: `AWS_PROFILE=nakom.is-sandbox` (account `975050268859`)
- Production: `AWS_PROFILE=nakom.is-admin` (account `637423226886`)

## Repository layout

| Directory | Purpose |
|---|---|
| `apple/` | XcodeGen project: `LapcatWatch/`, `LapcatPhone/`, `LapcatShared/` (local Swift package: swim model, JSON, sync, API client, uploader), tests, `fastlane/` |
| `infra/` | CDK app, Lambdas, tests |
| `web/` | Web portal (Vite/React SPA) |
| `docs/` | Logo (`logo.png`, `logo-candidates/`), architecture diagrams |

## Testing

- Infra: `cd infra && pnpm test` (Jest, 70% coverage minimum)
- Web: `cd web && pnpm lint && pnpm typecheck && pnpm test && pnpm build` (Vitest, 70% line coverage minimum). Needs `src/config/config.json` — copy the template or run `scripts/set-config.sh localhost`; `pnpm dev` serves on port 3000 (the Cognito localhost callback)
- Apple: `cd apple/LapcatShared && swift test`, then `cd apple && xcodegen generate && xcodebuild test -project Lapcat.xcodeproj -scheme "Lapcat (Sandbox)" -destination 'platform=iOS Simulator,name=iPhone 17' CODE_SIGNING_ALLOWED=NO` (or `fastlane test`)
- Lap detection itself can only be verified on a real watch in a real pool.

## Architecture diagrams

Source: `docs/architecture/lapcat.drawio` — SVG auto-regenerated on commit by `.githooks/pre-commit`.

```bash
git config core.hooksPath .githooks
```
