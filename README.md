# Driver Delivery Platform

Current source of truth: `C:\dev\DriverApp`

This repository contains the current working delivery platform for a driver fleet company.

It includes:
- Flutter Android driver app in the repo root
- Node.js backend in [backend](/c:/dev/DriverApp/backend)
- backend-served web portals for:
  - platform admin
  - merchant-group operations
  - restaurant or store staff

## Business Model

The platform is built for a driver fleet company.

That means:
- restaurants create delivery orders in the restaurant portal
- merchant-group owners can see all stores under their group
- the fleet company controls dispatching and commercial rules
- drivers only see the payout they earn for a trip
- drivers do not see what the fleet company charges the restaurant

Each restaurant has two separate commercial rule sets:
- `driver pay`: what the fleet company pays the driver
- `store charge`: what the fleet company charges the restaurant

Each restaurant also has store-level market settings for how amounts and distances are shown:
- `currency`: for example `AED`, `USD`, `KWD`
- `distanceUnit`: `kilometer` or `mile`

Each restaurant also has a driver-offer display setting for what the courier sees in the app:
- `store to customer only`
- `include commute to store plus delivery`

Those values are snapped onto each order so historical reporting and driver-facing offer metrics stay correct even if rules change later.

Admin controls those market settings. Merchant users can view them but cannot change them.

## Main Entry Points

- Backend server: [server.ts](/c:/dev/DriverApp/backend/src/server.ts)
- Driver app config: [app_config.dart](/c:/dev/DriverApp/lib/core/config/app_config.dart)
  Use `--dart-define=BACKEND_API_BASE_URL=https://your-host/api` for hosted environments.
- Admin portal: `http://127.0.0.1:8080/admin`
- Merchant portal: `http://127.0.0.1:8080/merchant`
- Restaurant portal: `http://127.0.0.1:8080/restaurant`

## Current Role Surfaces

- Admin portal: internal fleet-company operations and support
- Merchant portal: merchant-group oversight
- Restaurant portal: store-level dispatch and order creation
- Driver app: driver order intake, delivery progress, and earnings

## Demo Accounts

- Admin: `admin@demo.com` / `Password123`
- Merchant: `falafel.group@demo.com` / `Password123`
- Restaurant staff: `falafel.dispatch@demo.com` / `Password123`
- Driver: `driver@demo.com` / `Password123`

## Docs Map

- Documentation index: [DOCS_INDEX.md](/c:/dev/DriverApp/docs/DOCS_INDEX.md)
- Business-facing feature and testing guide: [BUSINESS_OPERATIONS_GUIDE.md](/c:/dev/DriverApp/docs/BUSINESS_OPERATIONS_GUIDE.md)
- Current platform status: [PROJECT_STATUS.md](/c:/dev/DriverApp/docs/PROJECT_STATUS.md)
- Local setup: [SETUP.md](/c:/dev/DriverApp/docs/SETUP.md)
- Backend and portal behavior: [BACKEND.md](/c:/dev/DriverApp/docs/BACKEND.md)
- Architecture: [SYSTEM_ARCHITECTURE.md](/c:/dev/DriverApp/docs/SYSTEM_ARCHITECTURE.md)
- Deployment: [DEPLOYMENT.md](/c:/dev/DriverApp/docs/DEPLOYMENT.md)
- Environment checklist: [PRODUCTION_ENV_CHECKLIST.md](/c:/dev/DriverApp/docs/PRODUCTION_ENV_CHECKLIST.md)
- Go-live checklist: [GO_LIVE_CHECKLIST.md](/c:/dev/DriverApp/docs/GO_LIVE_CHECKLIST.md)
- Deployment check matrix: [DEPLOY_CHECKS.md](/c:/dev/DriverApp/docs/DEPLOY_CHECKS.md)
- Final go-live gaps: [FINAL_GO_LIVE_GAPS.md](/c:/dev/DriverApp/docs/FINAL_GO_LIVE_GAPS.md)
- Production readiness: [PRODUCTION_READINESS.md](/c:/dev/DriverApp/docs/PRODUCTION_READINESS.md)
- Mobile release guide: [RELEASE.md](/c:/dev/DriverApp/docs/RELEASE.md)
- iOS pending work: [IOS_LATER.md](/c:/dev/DriverApp/docs/IOS_LATER.md)
- iOS background validation: [IOS_BACKGROUND_VALIDATION.md](/c:/dev/DriverApp/docs/IOS_BACKGROUND_VALIDATION.md)

## Local Run

Backend with PostgreSQL:

```powershell
cd C:\dev\DriverApp\backend
npm install
npm run prisma:generate
.\start-local-postgres.ps1
```

Optional explicit local reset back to seed data:

```powershell
cd C:\dev\DriverApp\backend
.\reset-local-postgres.ps1
```

Backend tests will automatically use a derived local Postgres test database such as `driverapp_test` when `backend/.env.local-postgres` is present.

File-store mode remains available only as a quick fallback demo path:

```powershell
cd C:\dev\DriverApp\backend
.\start-local-file-store.ps1
```

Flutter app:

```powershell
cd C:\dev\DriverApp
C:\flutter\bin\flutter.bat pub get
C:\flutter\bin\flutter.bat run
```

## Verification

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
