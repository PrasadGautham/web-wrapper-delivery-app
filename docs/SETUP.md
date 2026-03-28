# Setup Guide

## Purpose

Use this guide for local development and local business demos.

Canonical path:
- `C:\dev\DriverApp`

## Prerequisites

Backend:
- Node.js
- npm

Flutter:
- Flutter SDK at `C:\flutter`
- Android SDK and ADB
- Android Studio or a working Android emulator/device

Optional for full local backend features:
- Firebase Admin service account JSON for backend FCM
- Local PostgreSQL if you want to test database-backed mode instead of file-store mode
- Create `backend/.env.local-postgres` from `backend/.env.local-postgres.example` if you want local Postgres startup through `start-local-postgres.ps1`

## Local Start Order

### 1. Start backend

Optional legacy local mode: file-store

```powershell
cd C:\dev\DriverApp\backend
npm install
npm run prisma:generate
.\start-local-file-store.ps1
```

Local Postgres-backed mode:

```powershell
cd C:\dev\DriverApp\backend
Copy-Item .env.local-postgres.example .env.local-postgres
# edit DATABASE_URL in .env.local-postgres first
.\start-local-postgres.ps1
```

Expected:
- backend listens on `http://127.0.0.1:8080`

### 2. Open portals

- Admin: `http://127.0.0.1:8080/admin`
- Merchant: `http://127.0.0.1:8080/merchant`
- Restaurant: `http://127.0.0.1:8080/restaurant`

### 3. Start Android emulator or connect Android phone

Check devices:

```powershell
C:\flutter\bin\flutter.bat devices
```

### 4. Start Flutter driver app

```powershell
cd C:\dev\DriverApp
C:\flutter\bin\flutter.bat pub get
C:\flutter\bin\flutter.bat run
```

If multiple devices are connected:

```powershell
C:\flutter\bin\flutter.bat run -d emulator-5556
```

Use the actual device id shown by `flutter devices`.

## Demo Accounts

- Admin: `admin@demo.com` / `Password123`
- Merchant: `falafel.group@demo.com` / `Password123`
- Restaurant staff: `falafel.dispatch@demo.com` / `Password123`
- Driver: `driver@demo.com` / `Password123`

## Local Verification

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

## Notes

- File-store local mode is acceptable for quick demos.
- For production-like local testing, use Postgres and production-style env values.
- Android is the current supported launch track from this Windows environment.
- iOS native validation still requires macOS.


