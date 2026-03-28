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

- `/admin`
- `/merchant`
- `/restaurant`
- Flutter driver app APIs

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
- named restaurant groups or merchants

## Tracking Display Rules

Per restaurant, admin can set:
- show picked up as `In transit`
- show driver ETA to pickup
- show destination ETA after pickup

These rules change restaurant-facing display only.

## Store Market Settings

Per restaurant, admin can set:
- `currency`, using a 3-letter ISO code such as `AED`, `USD`, or `KWD`
- `distanceUnit`, either `kilometer` or `mile`

The backend uses these settings to:
- format pricing and payout values consistently across portals and the driver app
- convert pricing-rule distance thresholds and per-distance rates between internal kilometers and the selected business unit
- snapshot the driver-facing currency and distance unit onto each order

## Driver Offer Display Rules

Per restaurant, admin and merchant can set what the driver app shows on an incoming offer:
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
- Admin portal: `/admin`
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

## Validation

```powershell
cd C:\dev\DriverApp\backend
npm run check
npm test
npm run test:e2e:web
npm run smoke:deploy
```

## Current Portal Notes

### Admin

Admin can:
- manage merchant users
- manage restaurant staff users
- configure store commercial rules
- configure store tracking display
- configure driver workload and assignment scope

The admin driver UI now uses named selectors for stores and restaurant groups instead of raw IDs.

### Merchant

Merchant can:
- manage owned-store commercial rules
- manage owned-store tracking-display rules
- manage owned-store driver-offer display rules
- manage owned-store staff
- see merchant-wide reporting and live order updates
- view admin-controlled store market settings

### Restaurant

Restaurant can:
- create orders
- watch live movement
- see store-facing billing and ETA status
- use password reset flow
