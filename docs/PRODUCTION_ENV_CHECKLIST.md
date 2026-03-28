# Production Environment Checklist

## Purpose

Use this file as the single env and secrets checklist for the full system:

- Node backend
- backend-served web portals (`/admin`, `/merchant`, `/restaurant`)
- Flutter driver app

This is written to keep production setup explicit and repeatable.

## 1. Backend Environment

Baseline template:

- [backend/.env.example](/c:/dev/DriverApp/backend/.env.example)

Required for real production:

- `HOST`
- `PORT`
- `DATABASE_URL`
- `SESSION_TTL_HOURS`
- `STALE_LOCATION_MINUTES`
- `DISPATCH_INTERVAL_MS`
- `FIREBASE_SERVICE_ACCOUNT_PATH`
- `ALLOWED_WEB_ORIGINS`
- `ADMIN_API_KEY`
- `ALLOW_ADMIN_API_KEY_FALLBACK=false`
- `METRICS_API_KEY`

Strongly recommended when those features are enabled:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASSWORD`
- `SMTP_FROM_EMAIL`
- `PASSWORD_RESET_BASE_URL`
- `GOOGLE_MAPS_API_KEY`
- `ALERT_WEBHOOK_URL`

Optional depending on deployment shape:

- `REDIS_URL`
  Use only when you run more than one backend instance and want shared rate limiting.

## 2. Backend Secret Handling

Do not keep these in the repo:

- Firebase Admin service account JSON
- SMTP password
- database password
- admin API key
- metrics API key
- alert webhook secret values

Recommended storage:

- platform secret manager when hosted
- local machine secret file only for local development

Recommended production rule:

- treat `FIREBASE_SERVICE_ACCOUNT_PATH` as a mounted secret file path
- treat all other secrets as injected env vars

## 3. Web Portal Origin Allowlist

Set `ALLOWED_WEB_ORIGINS` to the exact browser origins that should be allowed to call the backend.

Example:

```text
ALLOWED_WEB_ORIGINS=https://ops.example.com,https://merchant.example.com,https://store.example.com
```

If the portals are served from the same backend origin, you can leave this empty in some deployments, but do not use broad permissive CORS in production.

## 4. Metrics Protection

If `/api/metrics` will be exposed outside a private network, set:

```text
METRICS_API_KEY=replace-with-a-strong-random-secret
```

Then scrape with header:

- `x-metrics-key: <METRICS_API_KEY>`

## 5. Admin Access Policy

Production recommendation:

```text
ALLOW_ADMIN_API_KEY_FALLBACK=false
```

Meaning:

- admin session auth is the normal path
- `x-admin-key` emergency bypass is disabled by default

Only set `ALLOW_ADMIN_API_KEY_FALLBACK=true` if you intentionally want that fallback and can protect it operationally.

## 6. Database Requirements

Production should use Postgres only.

Checklist:

- create a dedicated production database
- create a separate staging database
- never point production app at a test database
- enable backups/snapshots on the database platform
- ensure TLS/secure connection settings as required by your host

Before first production start:

```powershell
cd C:\dev\DriverApp\backend
npm install
npm run prisma:generate
npm run prisma:migrate:deploy
npm run check
npm test
```

## 7. Firebase / Push Setup

Backend:

- `FIREBASE_SERVICE_ACCOUNT_PATH` must point to a valid Firebase Admin SDK JSON

Android driver app:

- `android/app/google-services.json` must exist locally for builds

iOS driver app:

- `ios/Runner/GoogleService-Info.plist` must exist and iOS native setup must be validated on macOS

## 8. Google Routes / ETA Setup

If traffic-aware ETA is needed:

- set `GOOGLE_MAPS_API_KEY`
- enable the required Google Maps / Routes APIs in the Google project
- set billing on that Google project

Recommended use at current scale:

- restaurant ETA display only
- not dispatch ranking

## 9. SMTP / Password Reset Setup

SMTP is used for:

- password reset emails
- account recovery emails
- later, admin/store invitation emails if needed

Required when enabling real reset email delivery:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASSWORD`
- `SMTP_FROM_EMAIL`
- `PASSWORD_RESET_BASE_URL`

Do not enable insecure debug reset token response in production:

```text
ALLOW_INSECURE_PASSWORD_RESET_TOKEN_RESPONSE=false
```

## 10. Flutter Driver App Environment

Current driver app backend base URL lives in [app_config.dart](/c:/dev/DriverApp/lib/core/config/app_config.dart).

Current defaults:

- Android emulator: `http://10.0.2.2:8080/api`
- Web: `http://localhost:8080/api`
- other platforms: `http://127.0.0.1:8080/api`

Before a real deployment, replace that with a production-safe config strategy such as:

- `--dart-define`
- flavor-specific config
- environment-specific build pipeline

Production expectation:

- no local loopback URLs in release builds
- HTTPS backend URL only

## 11. Mobile App Release Prerequisites

Android:

- release keystore configured
- application ID verified
- Firebase Android app configured for release
- notification and location permissions tested on a real Android device

iOS:

- bundle ID verified
- background location capability validated on a real iPhone from macOS/Xcode
- APNs / Firebase iOS push path validated
- release signing and provisioning profiles configured

## 12. Web Portal Release Prerequisites

For `/admin`, `/merchant`, `/restaurant`:

- verify CSP works with the served scripts
- verify session refresh works after idle time
- verify logout clears the current session
- verify portal users only see their intended scope

Expected scopes:

- admin: platform-wide
- merchant: all restaurants under that merchant only
- restaurant/store staff: one restaurant only

## 13. Pre-Release Validation Commands

Backend:

```powershell
cd C:\dev\DriverApp\backend
npm run check
npm test
npm run smoke:deploy
```

Flutter:

```powershell
cd C:\dev\DriverApp
C:\flutter\bin\flutter.bat analyze
C:\flutter\bin\flutter.bat test
```

Optional with isolated Postgres test DB:

```powershell
cd C:\dev\DriverApp\backend
npm run test:postgres
```

## 14. Final Production Env Sanity Rules

- use HTTPS for every browser/mobile production endpoint
- use Postgres, not file storage
- keep admin API key fallback off unless intentionally needed
- keep insecure reset token response off
- protect `/api/metrics`
- use explicit allowed origins
- store secrets outside git
- use separate staging and production values
