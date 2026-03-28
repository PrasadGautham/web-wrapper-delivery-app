# Setup Guide

## Purpose

This guide is for local development and day-to-day setup of the current system in `C:\dev\DriverApp`.

It covers:

- backend
- Flutter driver app
- local web portals

For business-facing feature walkthroughs, deployment, and production env values, use:

- [BUSINESS_OPERATIONS_GUIDE.md](/c:/dev/DriverApp/docs/BUSINESS_OPERATIONS_GUIDE.md)
- [DEPLOYMENT.md](/c:/dev/DriverApp/docs/DEPLOYMENT.md)
- [PRODUCTION_ENV_CHECKLIST.md](/c:/dev/DriverApp/docs/PRODUCTION_ENV_CHECKLIST.md)

## 1. Prerequisites

Install locally:

- Flutter stable
- Android Studio and Android SDK
- Node.js LTS
- npm
- PostgreSQL if you want to use Postgres locally
- Xcode only if you are working on iOS from macOS

Windows note:

- enable Developer Mode so Flutter plugin symlinks work correctly

```powershell
start ms-settings:developers
```

## 2. Working Folder

Use only:

```text
C:\dev\DriverApp
```

Do not build or edit from the old OneDrive copy.

## 3. Backend Local Setup

From [backend](/c:/dev/DriverApp/backend):

```powershell
cd C:\dev\DriverApp\backend
npm install
npm run prisma:generate
```

If you are using Postgres locally:

```powershell
npm run prisma:migrate:deploy
```

Start backend in local mode:

```powershell
.\start-local.ps1
```

That script is the preferred local backend entry point.

## 4. Flutter Driver App Local Setup

From the repo root:

```powershell
cd C:\dev\DriverApp
C:\flutter\bin\flutter.bat pub get
C:\flutter\bin\flutter.bat run
```

If you need to verify tooling first:

```powershell
C:\flutter\bin\flutter.bat doctor -v
```

## 5. Local Portal URLs

Once backend is running:

- Admin portal: `http://127.0.0.1:8080/admin`
- Merchant portal: `http://127.0.0.1:8080/merchant`
- Restaurant portal: `http://127.0.0.1:8080/restaurant`
- Backend health: `http://127.0.0.1:8080/api/health`

## 6. Current Backend Modes

### File-store mode

Good for:

- quick local demos
- frontend and integration development

Runtime file:

- [db.json](/c:/dev/DriverApp/backend/data/db.json)

Seed source:

- [seed.json](/c:/dev/DriverApp/backend/data/seed.json)

### Postgres mode

Good for:

- production-shaped local development
- realistic persistence testing

Enable by setting `DATABASE_URL`.

## 7. Current Demo Accounts

- Admin: `admin@demo.com` / `Password123`
- Merchant: `falafel.group@demo.com` / `Password123`
- Restaurant staff: `falafel.dispatch@demo.com` / `Password123`
- Driver: `driver@demo.com` / `Password123`

## 8. Firebase / Push Notes

Android:

- `google-services.json` should exist locally under `android/app/`

Backend:

- `FIREBASE_SERVICE_ACCOUNT_PATH` is required for backend-driven FCM offers

iOS:

- `GoogleService-Info.plist` exists, but iOS native validation still requires macOS/Xcode

## 9. Maps Notes

The driver app currently uses external Google Maps deep links.

That means:

- no embedded `google_maps_flutter` dependency is required for the core delivery flow
- current driver navigation does not need an in-app maps SDK view

Traffic-aware ETA on the backend is optional and controlled separately by `GOOGLE_MAPS_API_KEY`.

## 10. Daily Verification Commands

Backend:

```powershell
cd C:\dev\DriverApp\backend
npm run check
npm test
npm run test:e2e:web
```

Flutter:

```powershell
cd C:\dev\DriverApp
C:\flutter\bin\flutter.bat analyze
C:\flutter\bin\flutter.bat test
```

## 11. What This Guide Does Not Cover

This file intentionally does not duplicate:

- business feature walkthroughs
- deployment hosting steps
- production env and secrets policy
- full go-live business checklist
- iOS release completion steps

Use the other docs for those.
