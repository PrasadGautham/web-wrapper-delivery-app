# Backend Guide

## Purpose

This document explains the backend, portal behavior, and current operational rules.

Backend path:
- `C:\dev\DriverApp\backend`

## Main Responsibilities

The backend handles:
- authentication and session management
- restaurant order creation
- driver eligibility and dispatch
- driver live location updates
- FCM order offers
- SSE updates for merchant and restaurant portals
- pricing snapshots
- reporting
- audit logs
- rate limiting
- password reset and session rotation

## Role Surfaces Served By Backend

- `/platform-admin`
  - platform admin mode for your internal team
- `/tenant-admin`
  - tenant admin mode for one fleet-company client workspace
- `/merchant`
- `/restaurant`
- Flutter driver app APIs

## Tenant Isolation Model

The backend now uses a true tenant layer.

One PostgreSQL database is still used, but tenant-owned data carries `tenantId`, including:
- merchants
- restaurants
- drivers
- orders
- sessions
- password reset tokens
- tenant admin users
- audit logs

Important boundary:
- `tenant` means one fleet-company client workspace
- `merchant group` means a restaurant group inside a tenant

Dispatch policy validation and driver assignment now enforce tenant boundaries so a driver cannot be tied to stores or merchant groups from another tenant.

The canonical local seed source is [seed.json](/c:/dev/DriverApp/backend/data/seed.json). Local Postgres reset and local file-store demo mode both derive their initial tenant-aware data from that file.

## Browser Auth Model

Browser portals use:
- HttpOnly cookie sessions

Flutter app uses:
- token-based auth stored securely on device

## Commercial Model

Per restaurant, the backend stores two separate pricing rule sets:
- `driverPayoutRule`
- `merchantBillingRule`

Current UI wording:
- `driver pay`: what the fleet company pays the driver
- `store charge`: what the fleet company charges the restaurant

Each rule supports:
- `baseAmount`
- `includedDistanceKm`
- `additionalPerKm`

When an order is created and assigned, the backend snapshots:
- driver pay for that trip
- store charge for that trip

That preserves historical accuracy when pricing rules change later.

## Dispatch Rules

Driver dispatch eligibility and ranking consider:
- online status
- current load versus max live deliveries
- dispatch policy
- location freshness and distance when fresh driver location is available

Important current behavior:
- fresh eligible drivers are preferred first
- stale or missing driver location reduces ranking quality and ETA quality
- a dedicated allow-listed driver can still be used as a fallback so tied-store orders do not stay stranded forever

Dispatch policy supports:
- `open`
- `allowListOnly`
- `allowListWithFallback`

Policy can be tied to:
- named stores
- named merchant groups

## Tracking Display Rules

Per restaurant, admin can set:
- show picked up as `In transit`
- show driver ETA to pickup
- show destination ETA after pickup

These rules change restaurant-facing display only.

## Tenant Market Settings

Per tenant, platform admin can set:
- `currency`, using a 3-letter ISO code such as `AED`, `USD`, or `KWD`
- `timeZone`, using an IANA zone such as `Asia/Dubai`

Per restaurant, tenant admin can still set:
- `distanceUnit`, either `kilometer` or `mile`

The backend uses these settings to:
- format pricing and payout values consistently across portals and the driver app
- interpret report date ranges and per-day bucketing in the tenant's local time zone
- convert pricing-rule distance thresholds and per-distance rates between internal kilometers and the selected business unit
- snapshot the driver-facing currency and distance unit onto each order

Centralized backend defaults live in [backend/src/utils/timezones.ts](/c:/dev/DriverApp/backend/src/utils/timezones.ts). They are bootstrap defaults only, not tenant-specific business values.

## Driver Offer Display Rules

Per restaurant, tenant admin and merchant can set what the driver app shows on an incoming offer:
- `storeToCustomer`: only the delivery leg
- `includeCommuteToStore`: driver to store plus delivery

The backend snapshots the chosen distance and ETA onto the order at assignment time so the driver app, push notification text, and backend state stay aligned.

## Live Updates

Merchant and restaurant portals use SSE.

Driver app uses:
- live location sync
- backend APIs
- backend-driven FCM order offers

## Important Local Endpoints

- Health: `/api/health`
- Metrics: `/api/metrics`
- CSP reports: `/api/security/csp-report`
- Platform admin portal: `/platform-admin`
- Tenant admin portal: `/tenant-admin`
- Merchant portal: `/merchant`
- Restaurant portal: `/restaurant`

## Local Run

```powershell
cd C:\dev\DriverApp\backend
npm install
npm run prisma:generate
.\start-local-postgres.ps1
```

Explicit local reset:

```powershell
cd C:\dev\DriverApp\backend
.\reset-local-postgres.ps1
```

Normal backend startup preserves data. Reset is a separate local operator action.

When `backend/.env.local-postgres` exists, the backend test suite also derives a separate `_test` Postgres database automatically so integration tests do not touch your main local database.

## Validation

```powershell
cd C:\dev\DriverApp\backend
npm run check
npm test
npm run test:e2e:web
npm run smoke:deploy
```

## Portal Frontend Structure

Browser portal assets live under [backend/public](/c:/dev/DriverApp/backend/public). The current maintainable split is:
- shared admin shell: [admin.html](/c:/dev/DriverApp/backend/public/admin.html) served for both `/platform-admin` and `/tenant-admin`
- merchant shell: [merchant.html](/c:/dev/DriverApp/backend/public/merchant.html)
- restaurant shell: [restaurant.html](/c:/dev/DriverApp/backend/public/restaurant.html)
- shared browser helpers: [backend/public/shared](/c:/dev/DriverApp/backend/public/shared)
- portal stylesheets: [backend/public/styles](/c:/dev/DriverApp/backend/public/styles)

Keep new cross-portal browser helpers in `backend/public/shared` instead of duplicating utility code in each page script.

## Current Portal Notes

### Admin

Admin can:
- manage merchant users
- manage restaurant staff users
- configure store commercial rules
- configure store tracking display
- configure driver workload and assignment scope

The admin driver UI now uses named selectors for stores and merchant groups instead of raw IDs.

### Merchant

Merchant can:
- view owned-store billing terms
- manage owned-store tracking-display rules
- manage owned-store driver-offer display rules
- manage owned-store staff
- see merchant-wide reporting and live order updates
- view platform-admin-controlled tenant market settings and store distance units
- does not receive driver-pay data from the backend

### Restaurant

Restaurant can:
- create orders
- watch live movement
- see store-facing billing and ETA status
- use password reset flow
- does not receive driver-pay data from the backend

## Reporting Endpoints

Current report and export routes:
- Platform or tenant admin:
  - `/api/admin/report`
  - `/api/admin/report-export.csv`
- Merchant:
  - `/api/merchant/me/report`
  - `/api/merchant/me/report-export.csv`
- Restaurant:
  - `/api/restaurants/me/report`
  - `/api/restaurants/me/report-export.csv`

Admin exports support typed report slices through the `reportType` query value:
- `orders`
- `drivers`
- `stores`
- `merchant-groups`
- `tenants`
- `days`

Merchant and restaurant exports are detailed order exports with clear date-based filenames.
