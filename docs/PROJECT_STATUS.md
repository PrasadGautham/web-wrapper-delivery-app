# Project Status

Last verified: March 28, 2026
Canonical working path: `C:\dev\DriverApp`
Legacy OneDrive copy: do not use

## Current Source Of Truth

Only use `C:\dev\DriverApp`.

The old OneDrive copy is no longer the source of truth and should not be used for builds, releases, or further code changes.

## Platform Summary

### Backend

Current state:

- Node.js backend under [backend](/c:/dev/DriverApp/backend)
- file-store local mode and Postgres mode both supported
- Prisma schema and migrations in place
- backend-driven FCM dispatch implemented
- live driver location ingestion implemented
- admin, merchant, and restaurant scoped web portals implemented
- password reset, session rotation, rate limiting, audit logs, metrics, and CSP reporting implemented

### Flutter Driver App

Current state:

- Android flow works locally from Windows
- secure token storage is implemented
- backend integration is active
- FCM token registration is active
- live location sync is active
- external Google Maps deep links are used instead of embedded maps

### Web Portals

Current state:

- Admin portal: `/admin`
- Merchant portal: `/merchant`
- Restaurant portal: `/restaurant`
- portals are served by the backend
- browser portals use HttpOnly cookie sessions
- restaurant and merchant portals use SSE for realtime updates

### iOS

Current state:

- Firebase iOS metadata exists
- bundle ID is aligned to `com.fooddelivery.driverapp`
- Windows cannot complete the native Xcode validation steps

Still pending:

- Xcode capability validation
- APNs validation
- real iPhone background location validation
- production iOS signing and release steps

See:

- [IOS_LATER.md](/c:/dev/DriverApp/docs/IOS_LATER.md)
- [IOS_BACKGROUND_VALIDATION.md](/c:/dev/DriverApp/docs/IOS_BACKGROUND_VALIDATION.md)

## Current Documentation Structure

These docs are now the intended source set:

- [BUSINESS_OPERATIONS_GUIDE.md](/c:/dev/DriverApp/docs/BUSINESS_OPERATIONS_GUIDE.md): business-facing feature list and role-by-role testing guide
- [SETUP.md](/c:/dev/DriverApp/docs/SETUP.md): local development and daily setup
- [BACKEND.md](/c:/dev/DriverApp/docs/BACKEND.md): backend behavior, APIs, and backend portals
- [SYSTEM_ARCHITECTURE.md](/c:/dev/DriverApp/docs/SYSTEM_ARCHITECTURE.md): architectural decisions and layering
- [DEPLOYMENT.md](/c:/dev/DriverApp/docs/DEPLOYMENT.md): deployment flow
- [PRODUCTION_ENV_CHECKLIST.md](/c:/dev/DriverApp/docs/PRODUCTION_ENV_CHECKLIST.md): runtime env and secrets checklist
- [GO_LIVE_CHECKLIST.md](/c:/dev/DriverApp/docs/GO_LIVE_CHECKLIST.md): final business rollout checklist
- [PRODUCTION_READINESS.md](/c:/dev/DriverApp/docs/PRODUCTION_READINESS.md): honest readiness assessment
- [RELEASE.md](/c:/dev/DriverApp/docs/RELEASE.md): mobile release preparation

## Current Verification Commands

Backend:

```powershell
cd C:\dev\DriverApp\backend
npm run check
npm test
npm run test:e2e:web
npm run smoke:deploy
```

Flutter:

```powershell
cd C:\dev\DriverApp
C:\flutter\bin\flutter.bat analyze
C:\flutter\bin\flutter.bat test
```

## Current Demo Accounts

- Admin: `admin@demo.com` / `Password123`
- Merchant: `falafel.group@demo.com` / `Password123`
- Restaurant staff: `falafel.dispatch@demo.com` / `Password123`
- Driver: `driver@demo.com` / `Password123`

## Current Honest Status

- backend: strong pilot / early production shape
- Android driver app: acceptable production target for an Android-only rollout after deployment validation
- web portals: strong pilot / early production shape
- iOS: still requires macOS and real-device validation before claiming production readiness
