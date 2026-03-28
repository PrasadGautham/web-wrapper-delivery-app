# Project Status

Last verified: March 28, 2026
Canonical working path: `C:\dev\DriverApp`
Legacy OneDrive copy: do not use

## Current Scope

The active system includes:
- Node.js backend
- Admin portal
- Merchant portal
- Restaurant portal
- Flutter Android driver app

The current release assumption is Android-first.

iOS remains a later validation and release track.

## Current Working Model

This platform is designed for a driver fleet company.

Current business separation:
- restaurant creates the order
- backend assigns the best eligible driver, preferring fresh nearby drivers and using tied-driver fallback when needed
- driver sees only the driver pay for the trip
- store sees only the amount billed to the store
- merchant sees cross-store reporting within its own merchant group
- tenant admin controls pricing, dispatch, staffing, and policy inside one client workspace
- platform admin controls tenant provisioning and cross-tenant support

## Current Technical State

### Backend

- Node.js backend under [backend](/c:/dev/DriverApp/backend)
- local file-store mode and Postgres mode supported
- Prisma schema and migrations in place
- backend-driven FCM dispatch supported
- live driver location updates supported
- pricing snapshots and reporting supported
- audit logs, session rotation, password reset, rate limiting, metrics, and CSP reporting implemented

### Web Portals

- Platform admin portal: `/platform-admin`
- Tenant admin portal: `/tenant-admin`
- Merchant portal: `/merchant`
- Restaurant portal: `/restaurant`
- browser portals use HttpOnly cookie sessions
- merchant and restaurant portals use SSE live updates
- admin and merchant pricing, tracking, and driver-offer display controls are available in the UI

### Flutter Driver App

- Android app works locally from Windows
- backend integration is active
- Flutter backend base URL is now build-time configurable with `BACKEND_API_BASE_URL`
- secure token storage is implemented
- FCM token registration is implemented
- live location sync is implemented
- external Google Maps deep links are used instead of embedded maps

### iOS

- Firebase metadata exists
- bundle identifier alignment is complete
- native validation still requires macOS, Xcode, APNs, and real-device testing

## Documentation Map

- Business and role testing: [BUSINESS_OPERATIONS_GUIDE.md](/c:/dev/DriverApp/docs/BUSINESS_OPERATIONS_GUIDE.md)
- Local setup: [SETUP.md](/c:/dev/DriverApp/docs/SETUP.md)
- Backend details: [BACKEND.md](/c:/dev/DriverApp/docs/BACKEND.md)
- Architecture: [SYSTEM_ARCHITECTURE.md](/c:/dev/DriverApp/docs/SYSTEM_ARCHITECTURE.md)
- Deployment: [DEPLOYMENT.md](/c:/dev/DriverApp/docs/DEPLOYMENT.md)
- Environment checklist: [PRODUCTION_ENV_CHECKLIST.md](/c:/dev/DriverApp/docs/PRODUCTION_ENV_CHECKLIST.md)
- Go-live checklist: [GO_LIVE_CHECKLIST.md](/c:/dev/DriverApp/docs/GO_LIVE_CHECKLIST.md)
- Deployment check matrix: [DEPLOY_CHECKS.md](/c:/dev/DriverApp/docs/DEPLOY_CHECKS.md)
- Final go-live gaps: [FINAL_GO_LIVE_GAPS.md](/c:/dev/DriverApp/docs/FINAL_GO_LIVE_GAPS.md)
- Production readiness: [PRODUCTION_READINESS.md](/c:/dev/DriverApp/docs/PRODUCTION_READINESS.md)
- Mobile release guide: [RELEASE.md](/c:/dev/DriverApp/docs/RELEASE.md)

## Verification Commands

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

## Seeded Demo State

The local seed source is [seed.json](/c:/dev/DriverApp/backend/data/seed.json). It currently defines two tenants, tenant-scoped merchants, restaurants, drivers, and admin users.

Common demo accounts:
- Platform admin: `admin@demo.com` / `Password123`
- Platform ops admin: `ops@demo.com` / `Password123`
- Tenant admin: `falafel.admin@demo.com` / `Password123`
- Tenant admin: `burger.admin@demo.com` / `Password123`
- Merchant owner: `falafel.group@demo.com` / `Password123`
- Merchant manager: `falafel.ops@demo.com` / `Password123`
- Restaurant staff: `falafel.dispatch@demo.com` / `Password123`
- Restaurant owner: `falafel.owner@demo.com` / `Password123`
- Driver: `driver@demo.com` / `Password123`
