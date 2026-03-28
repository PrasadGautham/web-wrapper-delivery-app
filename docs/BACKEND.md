# Backend Guide

## Overview

The backend lives in [backend](/c:/dev/DriverApp/backend) and serves four client surfaces:

- Flutter driver app via `/api/driver/*`
- store-level restaurant portal via `/restaurant` and `/api/restaurants/*`
- merchant or franchise portal via `/merchant` and `/api/merchant/*`
- platform admin portal via `/admin` and `/api/admin/*`

Use these companion docs for the broader picture:

- [BUSINESS_OPERATIONS_GUIDE.md](/c:/dev/DriverApp/docs/BUSINESS_OPERATIONS_GUIDE.md)
- [SYSTEM_ARCHITECTURE.md](/c:/dev/DriverApp/docs/SYSTEM_ARCHITECTURE.md)
- [DEPLOYMENT.md](/c:/dev/DriverApp/docs/DEPLOYMENT.md)
- [PRODUCTION_ENV_CHECKLIST.md](/c:/dev/DriverApp/docs/PRODUCTION_ENV_CHECKLIST.md)
- [GO_LIVE_CHECKLIST.md](/c:/dev/DriverApp/docs/GO_LIVE_CHECKLIST.md)

## Current Backend Capabilities

- backend-driven FCM order dispatch
- live driver location ingestion from the Flutter app
- fresh-location-aware nearest-driver dispatch
- driver eligibility rules by store and merchant
- per-driver capacity via `maxActiveOrders`
- restaurant tracking settings for status wording and ETA visibility
- admin and merchant commercial-term management for restaurants
- merchant-wide visibility across multiple restaurants
- multiple store staff users per restaurant
- platform admin and merchant user management
- password reset flow with SMTP support
- session expiry and session rotation
- audit logging
- rate limiting
- Prometheus-style metrics endpoint
- file-store local mode and Postgres-backed mode
- Prisma schema and migrations
- optional Google Routes ETA provider
- CSP reporting endpoint for browser policy violations

## Core Environment Variables

Use [backend/.env.example](/c:/dev/DriverApp/backend/.env.example).

Most important:

- `DATABASE_URL`
- `FIREBASE_SERVICE_ACCOUNT_PATH`
- `ADMIN_API_KEY`
- `ALLOW_ADMIN_API_KEY_FALLBACK`
- `ALLOWED_WEB_ORIGINS`
- `METRICS_API_KEY`
- `SESSION_TTL_HOURS`
- `STALE_LOCATION_MINUTES`
- `DISPATCH_INTERVAL_MS`
- `ALLOW_INSECURE_PASSWORD_RESET_TOKEN_RESPONSE`
- `GOOGLE_MAPS_API_KEY`
- `REDIS_URL`
- `WEB_SESSION_COOKIE_SECURE`
- `WEB_SESSION_COOKIE_SAME_SITE`
- `CSP_REPORT_ONLY`
- `CSP_REPORT_URI`

## Web Session Model

- Flutter driver app continues to use bearer tokens in secure device storage
- `/admin`, `/merchant`, and `/restaurant` use HttpOnly cookie sessions in browser mode
- browser portals identify themselves with `X-Portal-Client: web`
- browser portals do not persist API tokens in `localStorage`

## Run Locally

From `C:\dev\DriverApp\backend`:

```powershell
npm install
npm run prisma:generate
.\start-local.ps1
```

Optional Postgres local mode:

```powershell
$env:DATABASE_URL='postgresql://postgres:postgres@localhost:5432/driver_app?schema=public'
npm run prisma:migrate:deploy
npm start
```

## Client URLs In Local Mode

- backend: `http://127.0.0.1:8080`
- admin portal: `http://127.0.0.1:8080/admin`
- merchant portal: `http://127.0.0.1:8080/merchant`
- restaurant portal: `http://127.0.0.1:8080/restaurant`

## Main API Families

### Shared Auth

- `POST /api/auth/password-reset/request`
- `POST /api/auth/password-reset/confirm`

### Driver

- `POST /api/auth/driver/login`
- `GET /api/auth/driver/session`
- `POST /api/auth/driver/refresh`
- `POST /api/auth/driver/logout`
- `POST /api/driver/devices/token`
- `POST /api/driver/location`
- `GET /api/driver/profile`
- `PATCH /api/driver/availability`
- `GET /api/driver/orders/incoming`
- `GET /api/driver/orders/active`
- `POST /api/driver/orders/:orderId/accept`
- `POST /api/driver/orders/:orderId/reject`
- `POST /api/driver/orders/:orderId/arrived`
- `POST /api/driver/orders/:orderId/pickup`
- `POST /api/driver/orders/:orderId/deliver`
- `GET /api/driver/earnings`

### Restaurant

- `POST /api/auth/restaurant/login`
- `GET /api/auth/restaurant/session`
- `POST /api/auth/restaurant/refresh`
- `POST /api/auth/restaurant/logout`
- `POST /api/auth/restaurant/stream-ticket`
- `GET /api/restaurants/me/profile`
- `GET /api/restaurants/me/orders`
- `POST /api/restaurants/me/orders`
- `GET /api/restaurants/me/report`

### Merchant

- `POST /api/auth/merchant/login`
- `GET /api/auth/merchant/session`
- `POST /api/auth/merchant/refresh`
- `POST /api/auth/merchant/logout`
- `POST /api/auth/merchant/stream-ticket`
- `GET /api/merchant/me/profile`
- `GET /api/merchant/me/restaurants`
- `GET /api/merchant/me/orders`
- `GET /api/merchant/me/report`
- `GET /api/merchant/me/restaurants/:restaurantId/staff-users`
- `POST /api/merchant/me/restaurants/:restaurantId/staff-users`
- `PATCH /api/merchant/me/restaurants/:restaurantId/staff-users/:staffUserId`
- `PATCH /api/merchant/me/restaurants/:restaurantId/pricing`
- `PATCH /api/merchant/me/restaurants/:restaurantId/tracking-settings`

### Admin

- `POST /api/auth/admin/login`
- `GET /api/auth/admin/session`
- `POST /api/auth/admin/refresh`
- `POST /api/auth/admin/logout`
- `GET /api/admin/merchants`
- `GET /api/admin/merchants/:merchantId/users`
- `GET /api/admin/restaurants`
- `GET /api/admin/drivers`
- `GET /api/admin/admin-users`
- `GET /api/admin/restaurants/:restaurantId/staff-users`
- `POST /api/admin/admin-users`
- `PATCH /api/admin/admin-users/:adminUserId`
- `POST /api/admin/merchants/:merchantId/users`
- `PATCH /api/admin/merchants/:merchantId/users/:merchantUserId`
- `POST /api/admin/restaurants/:restaurantId/staff-users`
- `PATCH /api/admin/restaurants/:restaurantId/staff-users/:staffUserId`
- `PATCH /api/admin/drivers/:driverId/dispatch-policy`
- `PATCH /api/admin/drivers/:driverId/capacity`
- `PATCH /api/admin/restaurants/:restaurantId/pricing`
- `PATCH /api/admin/restaurants/:restaurantId/tracking-settings`

## Current Demo Accounts

- Admin: `admin@demo.com` / `Password123`
- Merchant: `falafel.group@demo.com` / `Password123`
- Restaurant staff: `falafel.dispatch@demo.com` / `Password123`
- Driver: `driver@demo.com` / `Password123`

## Verification Commands

From [backend](/c:/dev/DriverApp/backend):

```powershell
npm run check
npm test
npm run test:e2e:web
npm run smoke:deploy
```

Optional when `POSTGRES_TEST_DATABASE_URL` is set:

```powershell
npm run test:postgres
```

## Commercial Terms Model`r`n`r`nEach restaurant stores two pricing rules:`r`n`r`n- `driverPayoutRule`: what the driver earns`r`n- `merchantBillingRule`: what the store is billed`r`n`r`nEach rule supports:`r`n`r`n- `baseAmount``r`n- `includedDistanceKm``r`n- `additionalPerKm``r`n`r`nThis supports both flat pricing and “includes X km, then Y per km” pricing without exposing merchant billing to the driver app.`r`n`r`n## Notes

- file-store mode is acceptable for local development only
- deployed environments should use Postgres
- `REDIS_URL` is optional and only needed for shared rate limiting across multiple backend instances
- Android can be treated as the current release target
- the iOS mobile path still needs real macOS/Xcode validation before claiming full production readiness

