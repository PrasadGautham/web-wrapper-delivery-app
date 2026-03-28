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

### Admin

Internal platform operations and support user.

Admin can:
- see all merchants
- see all restaurants
- see all drivers
- see all admin users
- create merchant users
- create restaurant staff users
- set store-level driver pay rules
- set store-level store-charge rules
- set store-level tracking display rules
- set driver max live deliveries
- set driver assignment scope by named stores and restaurant groups

### Merchant

Franchise or restaurant-group operator.

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
3. Backend excludes:
- offline drivers
- stale-location drivers
- at-capacity drivers
- drivers outside allow-list scope when policy requires it
4. Backend chooses the nearest eligible driver.
5. Driver receives the offer.
6. Driver accepts or rejects.
7. Order progresses through:
- pending
- accepted
- atRestaurant
- pickedUp
- delivered
8. Restaurant and merchant views update live.
9. Driver pay and store charge are kept on the order as snapshots.

## Dispatch Rules

Per driver, admin can set:
- max live deliveries
- dispatch mode
- allowed stores
- allowed restaurant groups

Dispatch modes:
- `open`: can receive eligible orders from anywhere
- `allowListOnly`: only from selected stores and or selected restaurant groups
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

## Tracking Display Rules

Per store, admin and merchant can decide what restaurant staff see:
- show picked up as `In transit`
- show driver ETA to pickup
- show destination ETA after pickup

These settings are per store, not global.

## Local Demo Start

### Backend

```powershell
cd C:\dev\DriverApp\backend
.\start-local-file-store.ps1
```

### Portals

- Admin: `http://127.0.0.1:8080/admin`
- Merchant: `http://127.0.0.1:8080/merchant`
- Restaurant: `http://127.0.0.1:8080/restaurant`

### Driver app

```powershell
cd C:\dev\DriverApp
C:\flutter\bin\flutter.bat run
```

## Demo Accounts

- Admin: `admin@demo.com` / `Password123`
- Merchant: `falafel.group@demo.com` / `Password123`
- Restaurant staff: `falafel.dispatch@demo.com` / `Password123`
- Driver: `driver@demo.com` / `Password123`

## Role-Based Test Guide

### Admin Test

1. Open `/admin`
2. Log in as admin
3. Confirm merchants, stores, drivers, and admin users load
4. Select a store and change:
- driver pay rule
- store charge rule
- tracking-display settings
5. Select a driver and change:
- max live deliveries
- assignment mode
- allowed stores
- allowed restaurant groups
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
5. Create a store staff user

Expected:
- merchant sees only its own restaurants
- updates apply only to owned stores

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

