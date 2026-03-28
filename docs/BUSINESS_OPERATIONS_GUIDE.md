# Business Operations Guide

## Purpose

This is the business-facing guide for the current system in `C:\dev\DriverApp`.

It explains:
- what the platform does
- who uses each part of it
- what each role can do
- how the business process works
- how to test it end to end

## Business Model

This platform is built for a driver fleet company.

The fleet company:
- receives delivery demand from restaurants
- dispatches its own drivers
- pays the driver one value
- charges the restaurant a different value

Important separation:
- `driver pay`: what the fleet company pays the driver
- `store charge`: what the fleet company charges the restaurant

Drivers do not see store charges.
Restaurants do not see internal driver assignment controls.

## Current Product Surfaces

- Admin portal
- Merchant portal
- Restaurant portal
- Driver mobile app
- Shared backend

## Role Definitions

### Platform Admin

Internal fleet-company operations and support user with cross-tenant scope.

Platform admin can:
- create tenants
- create tenant admin users
- switch the admin workspace between tenants
- see merchants, restaurants, drivers, and admin users across tenants
- create merchant groups, stores, and drivers inside any tenant
- set store-level driver pay rules
- set store-level store-charge rules
- set store-level tracking display rules
- set store-level currency and distance unit
- set driver max live deliveries
- set driver assignment scope by named stores and merchant groups

### Tenant Admin

Client-specific admin user inside one tenant only.

Tenant admin can:
- see only merchants, restaurants, drivers, and admin users inside the assigned tenant
- create merchant groups, stores, and drivers inside that tenant
- create merchant users
- create restaurant staff users
- set store-level driver pay rules
- set store-level store-charge rules
- set store-level tracking display rules
- set driver max live deliveries
- set driver assignment scope by named stores and merchant groups inside the same tenant

### Merchant

Merchant-group operator.

Merchant can:
- see all restaurants under that merchant only
- see merchant-wide reporting across owned stores
- update driver pay and store charges for owned stores
- update store tracking-display settings
- create store staff accounts for owned stores
- watch live cross-store order updates

### Restaurant Staff

Store-level user.

Restaurant staff can:
- log in to one store scope only
- create delivery orders
- watch assignment and delivery progress live
- see ETA and status information according to store settings
- view store-facing reporting

### Driver

Courier using the Flutter Android app.

Driver can:
- log in
- go online or offline
- receive orders if eligible by dispatch policy
- accept or reject
- mark arrived
- mark picked up
- mark delivered
- see completed deliveries and earnings

## Order And Dispatch Process

1. Restaurant creates an order.
2. Backend checks eligible drivers.
3. Backend filters and ranks drivers using:
- online status
- capacity
- dispatch scope
- location freshness and distance when fresh location is available
4. Backend prefers the best fresh eligible driver.
5. If no fresh eligible driver is available, a dedicated allow-listed driver can still receive the order as a fallback so tied-store work does not stall forever.
6. Driver receives the offer.
7. Driver accepts or rejects.
8. Order progresses through:
- pending
- accepted
- atRestaurant
- pickedUp
- delivered
9. Restaurant and merchant views update live.
10. Driver pay, store charge, and driver-facing offer distance and ETA are kept on the order as snapshots.

## Dispatch Rules

Per driver, admin can set:
- max live deliveries
- dispatch mode
- allowed stores
- allowed merchant groups

Dispatch modes:
- `open`: can receive eligible orders from anywhere
- `allowListOnly`: only from selected stores and or selected merchant groups
- `allowListWithFallback`: selected stores/groups first, fallback allowed after that

## Pricing Rules

Per store, admin and merchant can set two separate rule sets:

### Driver pay

This is what the fleet company pays the driver.

### Store charge

This is what the fleet company charges the restaurant.

Each rule supports:
- base amount
- included km
- additional per km

Examples:
- flat fee per delivery:
  - base amount = `12`
  - included km = `0`
  - additional per km = `0`
- base plus extra km:
  - base amount = `10`
  - included km = `3`
  - additional per km = `2`

## Store Market Settings

Per store, admin can also set:
- pricing currency, for example `AED`, `USD`, `KWD`
- distance unit, `kilometer` or `mile`

These settings control:
- how commercial values are shown in admin, merchant, restaurant, and driver trip screens
- whether pricing-rule distance thresholds are entered and described in kilometers or miles
- how driver-offer distance is shown on incoming orders

## Tracking Display Rules

Per store, admin and merchant can decide what restaurant staff see:
- show picked up as `In transit`
- show driver ETA to pickup
- show destination ETA after pickup

These settings are per store, not global.

## Driver Offer Distance Rules

Per store, admin and merchant can also decide what the courier sees when an offer appears in the driver app:
- `Store to customer only`
- `Include commute to store plus delivery`

That setting changes the driver-facing distance and ETA in the incoming offer and navigation screens. It does not change the store charge or driver pay calculation.

## Local Demo Start

### Backend

```powershell
cd C:\dev\DriverApp\backend
.\start-local-postgres.ps1
```

Optional local reset back to seed data:

```powershell
cd C:\dev\DriverApp\backend
.\reset-local-postgres.ps1
```

That reset command is for local demo or dev use only. It is not part of normal startup or production deployment.

### Portals

- Platform admin: `http://127.0.0.1:8080/platform-admin`
- Tenant admin: `http://127.0.0.1:8080/tenant-admin`
- Merchant: `http://127.0.0.1:8080/merchant`
- Restaurant: `http://127.0.0.1:8080/restaurant`

### Driver app

```powershell
cd C:\dev\DriverApp
C:\flutter\bin\flutter.bat run
```

## Demo Accounts

The local source of truth for demo tenants, users, stores, and drivers is [seed.json](/c:/dev/DriverApp/backend/data/seed.json). The current seed includes two tenants:
- `tnt_fleet_001` = `Falafel Delivery Operations`
- `tnt_fleet_002` = `Burger Logistics Client`

Commonly used demo accounts:
- Platform admin: `admin@demo.com` / `Password123`
- Platform ops admin: `ops@demo.com` / `Password123`
- Tenant admin: `falafel.admin@demo.com` / `Password123`
- Tenant admin: `burger.admin@demo.com` / `Password123`
- Merchant owner: `falafel.group@demo.com` / `Password123`
- Merchant manager: `falafel.ops@demo.com` / `Password123`
- Restaurant staff: `falafel.dispatch@demo.com` / `Password123`
- Restaurant owner: `falafel.owner@demo.com` / `Password123`
- Driver: `driver@demo.com` / `Password123`

## Role-Based Test Guide

### Admin Test

1. Open `/platform-admin` for platform admins, or `/tenant-admin` for tenant-scoped admins
2. Log in as admin
3. Confirm merchants, stores, drivers, and admin users load
4. Select a store and change:
- driver pay rule
- store charge rule
- tracking-display settings
- currency and distance unit
- driver offer display mode
5. Select a driver and change:
- max live deliveries
- assignment mode
- allowed stores
- allowed merchant groups
6. Save driver settings

Expected:
- settings save successfully
- store and driver summaries update clearly

### Merchant Test

1. Open `/merchant`
2. Log in as merchant
3. Confirm only owned stores are visible
4. Select a store and update:
- driver pay
- store charge
- tracking-display settings
- driver offer display mode
5. Create a store staff user

Expected:
- merchant sees only its own restaurants
- updates apply only to owned stores
- store currency and distance unit remain admin-controlled

### Restaurant Test

1. Open `/restaurant`
2. Log in as store staff
3. Create an order
4. Watch it move through assignment and delivery

Expected:
- live updates appear automatically
- tracking display follows store-specific settings

### Driver Test

1. Start Android app
2. Log in as driver
3. Grant location permission
4. Go online
5. Receive order
6. Accept order
7. Mark arrived, picked up, delivered

Expected:
- driver sees driver pay only
- restaurant and merchant portals update live
- driver earnings update after completion

## End-To-End Demo Flow

1. Admin logs in and shows:
- stores
- driver settings
- commercial rules
2. Admin updates one store's commercial terms
3. Merchant logs in and shows multi-store visibility
4. Restaurant logs in and creates an order
5. Driver goes online and receives the order
6. Driver accepts and completes it
7. Merchant and restaurant views update live
8. Driver earnings and reporting totals update

## Screenshots Checklist

- Admin dashboard
- Admin store commercial setup
- Admin driver assignment setup
- Merchant dashboard with multiple stores
- Merchant store settings
- Restaurant order creation
- Restaurant live order list
- Driver incoming order
- Driver delivery progression
- Merchant and restaurant views after acceptance
- Merchant and restaurant views after delivery

## Current Launch Scope

Included now:
- backend
- admin portal
- merchant portal
- restaurant portal
- Android driver app

Not included in current launch claim:
- iOS production release

## Companion Docs

- Status: [PROJECT_STATUS.md](/c:/dev/DriverApp/docs/PROJECT_STATUS.md)
- Setup: [SETUP.md](/c:/dev/DriverApp/docs/SETUP.md)
- Backend: [BACKEND.md](/c:/dev/DriverApp/docs/BACKEND.md)
- Deployment: [DEPLOYMENT.md](/c:/dev/DriverApp/docs/DEPLOYMENT.md)
- Environment: [PRODUCTION_ENV_CHECKLIST.md](/c:/dev/DriverApp/docs/PRODUCTION_ENV_CHECKLIST.md)
- Go-live: [GO_LIVE_CHECKLIST.md](/c:/dev/DriverApp/docs/GO_LIVE_CHECKLIST.md)
- Mobile release: [RELEASE.md](/c:/dev/DriverApp/docs/RELEASE.md)
