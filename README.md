# Driver Delivery Platform

This repository contains the current working system for the food delivery driver platform at `C:\dev\DriverApp`.

It includes:

- Flutter driver mobile app in the repo root
- Node.js backend in [backend](/c:/dev/DriverApp/backend)
- backend-served web portals for:
  - platform admin
  - merchant or franchise operations
  - restaurant or store staff

## Current Entry Points

- Driver mobile app API base config: [app_config.dart](/c:/dev/DriverApp/lib/core/config/app_config.dart)
- Backend server: [server.ts](/c:/dev/DriverApp/backend/src/server.ts)
- Admin portal: `http://127.0.0.1:8080/admin`
- Merchant portal: `http://127.0.0.1:8080/merchant`
- Restaurant portal: `http://127.0.0.1:8080/restaurant`

## Current Capabilities

- backend-driven dispatch with live driver location updates
- store-tied, merchant-tied, and open-pool driver assignment policies
- per-driver capacity limits
- FCM offer dispatch from backend
- separate driver payout and restaurant billing values per order
- restaurant staff accounts per store
- merchant users who can see and manage all restaurants under one merchant
- admin and merchant controls for restaurant pricing and tracking settings
- platform admin users for cross-platform operations
- optional traffic-aware ETA through Google Routes
- password reset flow with SMTP support
- audit logs, rate limiting, metrics, and CSP reporting

## Current Demo Accounts

- Admin: `admin@demo.com` / `Password123`
- Merchant: `falafel.group@demo.com` / `Password123`
- Restaurant staff: `falafel.dispatch@demo.com` / `Password123`
- Driver: `driver@demo.com` / `Password123`

## Docs Map

Start here depending on task:

- Business-facing feature list and testing guide: [BUSINESS_OPERATIONS_GUIDE.md](/c:/dev/DriverApp/docs/BUSINESS_OPERATIONS_GUIDE.md)
- Current repo and platform status: [PROJECT_STATUS.md](/c:/dev/DriverApp/docs/PROJECT_STATUS.md)
- Local setup and daily development: [SETUP.md](/c:/dev/DriverApp/docs/SETUP.md)
- Backend architecture and APIs: [BACKEND.md](/c:/dev/DriverApp/docs/BACKEND.md)
- System design: [SYSTEM_ARCHITECTURE.md](/c:/dev/DriverApp/docs/SYSTEM_ARCHITECTURE.md)
- Deployment guide: [DEPLOYMENT.md](/c:/dev/DriverApp/docs/DEPLOYMENT.md)
- Production environment checklist: [PRODUCTION_ENV_CHECKLIST.md](/c:/dev/DriverApp/docs/PRODUCTION_ENV_CHECKLIST.md)
- Go-live checklist: [GO_LIVE_CHECKLIST.md](/c:/dev/DriverApp/docs/GO_LIVE_CHECKLIST.md)
- Production readiness assessment: [PRODUCTION_READINESS.md](/c:/dev/DriverApp/docs/PRODUCTION_READINESS.md)
- Mobile release notes: [RELEASE.md](/c:/dev/DriverApp/docs/RELEASE.md)
- iOS later work: [IOS_LATER.md](/c:/dev/DriverApp/docs/IOS_LATER.md)
- iOS background tracking validation: [IOS_BACKGROUND_VALIDATION.md](/c:/dev/DriverApp/docs/IOS_BACKGROUND_VALIDATION.md)

## Local Run

Backend:

```powershell
cd C:\dev\DriverApp\backend
npm install
npm run prisma:generate
.\start-local.ps1
```

Flutter app:

```powershell
cd C:\dev\DriverApp
C:\flutter\bin\flutter.bat pub get
C:\flutter\bin\flutter.bat run
```

## Verification

Current expected verification commands:

```powershell
cd C:\dev\DriverApp\backend
npm run check
npm test
npm run test:e2e:web
npm run smoke:deploy

cd C:\dev\DriverApp
C:\flutter\bin\flutter.bat analyze
C:\flutter\bin\flutter.bat test
```
