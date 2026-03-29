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

Each tenant now owns the canonical market settings for its workspace:
- `currency`: for example `AED`, `USD`, `KWD`
- `timeZone`: an IANA zone such as `Asia/Dubai`

Each restaurant still owns its own `distanceUnit`: `kilometer` or `mile`.

Each restaurant also has a driver-offer display setting for what the courier sees in the app:
- `store to customer only`
- `include commute to store plus delivery`

Those values are snapped onto each order so historical reporting and driver-facing offer metrics stay correct even if rules change later.

Platform admin controls tenant market settings. Tenant admins, merchant users, and restaurant users inherit those tenant values. Restaurant distance unit remains store-level and merchant users can view but not change the tenant-owned market settings.

## Main Entry Points

- Backend server: [server.ts](/c:/dev/DriverApp/backend/src/server.ts)
- Driver app config: [app_config.dart](/c:/dev/DriverApp/lib/core/config/app_config.dart)
  Use `--dart-define=BACKEND_API_BASE_URL=https://your-host/api` for hosted environments.
- Platform admin portal: `http://127.0.0.1:8080/platform-admin`
- Tenant admin portal: `http://127.0.0.1:8080/tenant-admin`
- Merchant portal: `http://127.0.0.1:8080/merchant`
- Restaurant portal: `http://127.0.0.1:8080/restaurant`

Only use the explicit split admin routes above. `/admin` is no longer supported.

## Current Role Surfaces

- Platform admin portal: internal fleet-company operations and cross-tenant support
- Tenant admin workspace inside `/tenant-admin`: one client tenant only
- Merchant portal: merchant-group oversight inside one tenant
- Restaurant portal: store-level dispatch and order creation inside one tenant
- Driver app: driver order intake, delivery progress, and earnings inside one tenant

## Tenant Model

The platform now separates:
- `platform admin`: your internal team, with access across tenants
- `tenant`: one fleet-company client workspace
- `merchant group`: a restaurant group or franchise group inside a tenant
- `restaurant`: one store inside a merchant group
- `driver`: one courier account owned by one tenant

This keeps client data isolated without needing a separate database per client at this stage.

## Seeded Local Demo Data

Local Postgres resets and local file-store demo mode both seed from [seed.json](/c:/dev/DriverApp/backend/data/seed.json). The current seed is tenant-aware and represents two sample client tenants:
- `tnt_fleet_001` = `Desert Fleet Services`
- `tnt_fleet_002` = `Metro Fleet Partners`

Primary demo accounts:
- Platform admin: `admin@demo.com` / `Password123`
- Platform ops admin: `platform.ops@demo.com` / `Password123`
- Tenant admin: `desertfleet.admin@demo.com` / `Password123`
- Tenant admin: `metrofleet.admin@demo.com` / `Password123`
- Merchant owner: `falafel.group@demo.com` / `Password123`
- Merchant manager: `falafel.ops@demo.com` / `Password123`
- Restaurant staff: `falafel.dispatch@demo.com` / `Password123`
- Restaurant owner: `falafel.owner@demo.com` / `Password123`
- Driver: `driver@demo.com` / `Password123`

Secondary seeded accounts also exist for the second sample tenant and restaurant. If you need the full list, use [seed.json](/c:/dev/DriverApp/backend/data/seed.json) as the source of truth.


## Reporting Surfaces

Current reporting and export behavior:
- Platform admin and tenant admin:
  - date-filtered operational reporting
  - breakdowns by driver, store, merchant group, day, and tenant
  - CSV exports with clear type-and-date filenames such as `platform-admin-report-drivers-2026-03-01-to-2026-03-31.csv`
- Merchant portal:
  - date-filtered merchant-wide reporting across all owned stores
  - breakdowns by store, courier, day, and status mix
  - CSV export filenames such as `merchant-orders-report-2026-03-01-to-2026-03-31.csv`
- Restaurant portal:
  - date-filtered store-only reporting
  - breakdowns by courier, day, status mix, and store-facing billing totals
  - CSV export filenames such as `restaurant-orders-report-2026-03-01-to-2026-03-31.csv`

Commercial visibility boundaries remain enforced:
- admin can see both `driver pay` and `store charge`
- merchant and restaurant can see `store charge` only
- driver app can see `driver pay` only

## Portal Frontend Structure

Web portal assets now use a cleaner split so the browser surfaces are easier to maintain:
- shared admin shell: [admin.html](/c:/dev/DriverApp/backend/public/admin.html) served for both `/platform-admin` and `/tenant-admin`, with role-specific tenant currency and time-zone behavior
- merchant shell: [merchant.html](/c:/dev/DriverApp/backend/public/merchant.html)
- restaurant shell: [restaurant.html](/c:/dev/DriverApp/backend/public/restaurant.html)
- shared browser helpers: [backend/public/shared](/c:/dev/DriverApp/backend/public/shared)
- portal stylesheets: [backend/public/styles](/c:/dev/DriverApp/backend/public/styles)

This keeps auth-gate logic, formatting helpers, date-range helpers, and page styles from drifting across duplicated files.

Tenant localization defaults are centralized in:
- [backend/src/utils/timezones.ts](/c:/dev/DriverApp/backend/src/utils/timezones.ts) for backend runtime and reporting
- [backend/public/shared/constants.js](/c:/dev/DriverApp/backend/public/shared/constants.js) for web portals
- [lib/core/config/app_defaults.dart](/c:/dev/DriverApp/lib/core/config/app_defaults.dart) for Flutter parsing and formatting fallbacks

Runtime business behavior should derive from tenant settings first, with these files acting only as bootstrap defaults when data is missing or a brand-new tenant is being created.

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

If local Postgres ever contains broken half-migrated tenant data, the backend now fails fast instead of silently showing wrong admin counts. Tenant-owned rows must always have `tenantId`, platform admins must remain global, and tenant admins must always belong to exactly one tenant. Use `backend\reset-local-postgres.ps1` to rebuild local data from seed.

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

Mobile startup behavior:
- the driver app now defers heavy startup work until after the first frame
- FCM bootstrap runs in the background instead of blocking first render
- location sync serializes permission and startup requests so Android does not receive overlapping permission prompts
- `Today's earnings` on the dashboard is live backend data, shown in tenant currency, and falls back to `0.0` only when the driver has no earnings yet
- lightweight startup timing logs now measure auth restore, notification bootstrap, and location sync during launch
- unchanged backend snapshots are no longer re-emitted to the UI, and the dashboard countdown no longer forces the whole home screen to rebuild every second
- the driver app now supports multiple simultaneous incoming offers and active trips when driver capacity is greater than `1`, with explicit order switching in the app UI

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

## Batched Trips

The platform now models multi-order courier runs explicitly. When a driver accepts multiple orders while still under capacity, the backend groups them into a `driver trip` and each order is linked by `tripId`.

What this enables:
- restaurant, merchant, and admin reports can identify batched trips directly
- CSV exports include `Trip ID`, `Trip Size`, and `Batched Trip` columns
- the driver app shows when an active order is part of a batched trip

Trips stay `open` while they still have undelivered orders and are marked `completed` when the last linked order is delivered.

