# Business Operations Guide

## Purpose

This is the business-facing guide for the current delivery platform in `C:\dev\DriverApp`.

It explains:

- what the platform does
- who uses each part of it
- what features exist for each user type
- how to start the system locally
- how to test each role end to end

This guide is intended for product, operations, business review, and acceptance testing.

## Current System Parts

The platform currently has four operational surfaces:

- Driver mobile app
- Restaurant portal
- Merchant portal
- Admin portal

It also has one shared backend that handles:

- authentication
- order creation
- dispatching
- location updates
- earnings and restaurant billing snapshots
- realtime updates

## Current User Roles

### Admin

Platform-wide operations user.

Can:

- see all merchants
- see all restaurants
- see all drivers
- create and manage admin users
- create and manage merchant users
- create and manage restaurant staff users
- update driver dispatch policy
- update driver capacity
- update restaurant tracking settings

### Merchant

Franchise or multi-store business user.

Can:

- see all restaurants under that merchant
- see merchant-wide orders and reporting
- create and manage store staff users for owned restaurants
- monitor live status updates for all owned restaurants

### Restaurant Staff

Store-level operator.

Can:

- log in to one restaurant scope only
- create delivery orders
- view live order updates
- see driver assignment and ETA information
- use password reset if configured

### Driver

Delivery driver using the Flutter Android app.

Can:

- log in
- go online or offline
- receive incoming orders
- accept or reject orders
- mark arrived
- mark picked up
- mark delivered
- view earnings and completed deliveries

## Core Business Features

### Dispatch

- nearest eligible driver is selected using fresh location data
- offline drivers are excluded
- stale-location drivers are excluded
- at-capacity drivers are excluded
- drivers can be:
  - open pool
  - tied to selected restaurants
  - tied to selected merchants
  - allow-listed with fallback behavior

### Order Lifecycle

- restaurant creates order
- backend assigns driver
- driver receives order offer
- driver accepts or rejects
- order moves through:
  - pending
  - accepted
  - atRestaurant
  - pickedUp
  - delivered

### Realtime Updates

- restaurant portal updates live through SSE
- merchant portal updates live through SSE
- driver app updates through backend APIs and push-driven flow

### Pricing And Earnings

- driver payout is stored per order
- restaurant charge is stored per order
- different restaurants can have different rates
- historical orders keep their own rate snapshots even if rates change later

### Security And Access

- passwords are hashed
- browser portals use `HttpOnly` cookie sessions
- Flutter app uses secure device storage for auth
- password reset flow exists
- session refresh and rotation exist
- audit logs exist
- rate limiting exists

## Local Start Instructions

### 1. Start the backend

Open terminal 1:

```powershell
cd C:\dev\DriverApp\backend
.\start-local.ps1
```

Expected:

- backend runs on `http://127.0.0.1:8080`

### 2. Open the portals

Open these in a browser:

- Admin: `http://127.0.0.1:8080/admin`
- Merchant: `http://127.0.0.1:8080/merchant`
- Restaurant: `http://127.0.0.1:8080/restaurant`

### 3. Start the Android driver app

Open terminal 2:

```powershell
cd C:\dev\DriverApp
C:\flutter\bin\flutter.bat run
```

Important:

- start an Android emulator first, or connect an Android device
- current go-live assumption is Android only

## Demo Accounts

- Admin: `admin@demo.com` / `Password123`
- Merchant: `falafel.group@demo.com` / `Password123`
- Restaurant staff: `falafel.dispatch@demo.com` / `Password123`
- Driver: `driver@demo.com` / `Password123`

## Role-Based Test Guide

## Admin Testing

### Login

1. Open `/admin`
2. Log in as `admin@demo.com`
3. Confirm dashboard loads

Expected:

- merchants list loads
- restaurants list loads
- drivers list loads
- admin users list loads

### Create a merchant user

1. Select a merchant
2. Enter merchant user details
3. Create the user

Expected:

- new merchant user appears under that merchant

### Create restaurant staff

1. Select a restaurant
2. Enter staff details
3. Create the user

Expected:

- new restaurant staff user is created successfully

### Change driver capacity

Use the admin API or admin controls if exposed in the current UI.

Expected:

- driver capacity changes
- driver can be skipped once capacity is full

### Change restaurant tracking settings

Use the admin API or admin controls if exposed in the current UI.

Expected:

- merchant and restaurant views reflect configured tracking behavior

## Merchant Testing

### Login

1. Open `/merchant`
2. Log in as `falafel.group@demo.com`

Expected:

- merchant profile loads
- only owned restaurants are visible
- merchant-wide report loads
- live connection starts

### Verify multi-store visibility

Check that the merchant sees all restaurants belonging to that merchant and no restaurants from another merchant.

Expected:

- cross-store visibility only within merchant scope

### Create a store staff user

1. Select one restaurant
2. Enter staff details
3. Create staff user

Expected:

- staff user is listed for that restaurant
- user can log in immediately via the restaurant portal

## Restaurant Testing

### Login

1. Open `/restaurant`
2. Log in as `falafel.dispatch@demo.com`

Expected:

- restaurant profile loads
- order list loads
- live connection starts

### Create an order

1. Fill customer name
2. Fill address
3. Fill delivery area
4. Submit order

Expected:

- order appears in restaurant order list
- driver assignment happens automatically if an eligible online driver is available

### Track the order

After a driver accepts and progresses the order:

Expected:

- restaurant view updates automatically
- ETA fields show according to configuration
- `pickedUp` may display as `In transit` if enabled

## Driver Testing

### Login

1. Start Android app
2. Log in as `driver@demo.com`

Expected:

- home dashboard loads
- FCM token can be seen in profile if needed

### Enable availability

1. Grant location permission
2. Toggle `Online`

Expected:

- backend receives location updates
- driver becomes eligible for dispatch if policy allows

### Receive and accept order

Create an order from the restaurant portal while the driver is online.

Expected:

- incoming order appears on the device
- driver can accept or reject

### Complete the order

1. Accept
2. Mark arrived
3. Mark picked up
4. Mark delivered

Expected:

- restaurant portal updates live
- merchant portal updates live
- driver earnings update
- completed deliveries count updates

## End-To-End Test Scenario

Use this as the main business demo:

1. Start backend
2. Open admin, merchant, and restaurant portals
3. Start Android driver app
4. Log in as driver and go online
5. Log in as restaurant staff and create an order
6. Confirm the driver receives the order
7. Accept the order on the driver app
8. Confirm restaurant and merchant portals update live
9. Progress the driver through arrived, pickup, and delivered
10. Confirm:
- restaurant sees status changes
- merchant sees status changes
- driver earnings update
- reporting totals update

## What Is Included In The Current Android-Only Release Scope

Good for current business rollout:

- backend
- admin portal
- merchant portal
- restaurant portal
- Android driver app

Not included in current release claim:

- iOS production launch

## What Still Requires Deployment-Time Setup

These are not code gaps. They are production environment tasks:

- production Postgres
- production Firebase Admin secret
- production allowed web origins
- production metrics protection
- optional SMTP for email-based password reset
- optional Redis only if multi-instance shared rate limiting is needed later

## Companion Technical Docs

- Current status: [PROJECT_STATUS.md](/c:/dev/DriverApp/docs/PROJECT_STATUS.md)
- Local setup: [SETUP.md](/c:/dev/DriverApp/docs/SETUP.md)
- Backend details: [BACKEND.md](/c:/dev/DriverApp/docs/BACKEND.md)
- Deployment: [DEPLOYMENT.md](/c:/dev/DriverApp/docs/DEPLOYMENT.md)
- Environment checklist: [PRODUCTION_ENV_CHECKLIST.md](/c:/dev/DriverApp/docs/PRODUCTION_ENV_CHECKLIST.md)
- Go-live checklist: [GO_LIVE_CHECKLIST.md](/c:/dev/DriverApp/docs/GO_LIVE_CHECKLIST.md)
