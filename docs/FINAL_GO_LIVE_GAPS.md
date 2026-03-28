# Final Go-Live Gaps

## Purpose

This is the short list of remaining gaps after the current code and documentation pass.

These are not known blocking code defects in the repository. They are the last items that still need real environment or release validation before claiming full production readiness.

## Current Code Status

Verified in the current repository state:
- backend `npm run check` passes
- backend `npm test` passes
- backend `npm run test:e2e:web` passes
- Flutter `flutter analyze` passes
- Flutter `flutter test` passes
- Postgres integration tests run against a separate derived local test database

## Remaining Gaps

### 1. Hosted environment validation

Still required in a real hosted environment:
- deploy backend with production env values
- verify HTTPS portal access
- verify cookie behavior on hosted origin
- verify admin, merchant, and restaurant login against hosted backend
- verify SSE works through the hosted origin and any proxy layer

### 2. Firebase push validation in deployed mode

The code path is ready, but real production confidence still requires:
- valid `FIREBASE_SERVICE_ACCOUNT_PATH` in deployed backend
- release Android app connected to the correct Firebase project
- real device validation that incoming offers arrive reliably

### 3. Android release build validation

Still required on real Android hardware:
- release-signed build installation
- login against hosted backend
- notification permission flow
- background delivery behavior under battery optimization
- location updates while online
- accept, pickup, and delivery transitions in release mode

### 4. Final production env review

Still required before go-live:
- confirm `DATABASE_URL`
- confirm `ALLOWED_WEB_ORIGINS`
- confirm `WEB_SESSION_COOKIE_SECURE=true`
- confirm `WEB_SESSION_COOKIE_SAME_SITE` matches deployment model
- confirm metrics protection and alert webhook values if used

### 5. iOS remains out of current launch scope

Current supported release scope is Android-first.

iOS still requires:
- macOS and Xcode validation
- APNs validation
- real iPhone validation

## What Is No Longer A Gap

Closed in the current repository state:
- Postgres integration tests no longer skip by default when local Postgres env is present
- portal E2E is no longer auth-only; it covers a real restaurant-to-merchant order flow
- browser market settings are admin-controlled only
- mobile backend base URL is build-time configurable
- shipped login forms no longer prefill demo credentials
- stale debug artifacts and package-id leftovers were removed

## Go-Live Recommendation

For the current scope, the product is ready for a staging or pilot deployment pass.

Do not call it fully production-complete until the hosted environment and real-device Android checks above are completed.
