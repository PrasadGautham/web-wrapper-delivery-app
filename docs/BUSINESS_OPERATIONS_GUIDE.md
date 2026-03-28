# Business Operations Guide

## Purpose

This is the business-facing guide for the current delivery platform in `C:\dev\DriverApp`.

It explains:

- what the platform does
- who uses each part of it
- what features exist for each user type
- how to start the system locally
- how to test each role end to end
- how to present the product to a business stakeholder

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

## Who The Admin Portal Is For

The admin side is for platform operations, business support, and internal superusers.

It is not meant for drivers or restaurant staff.

Typical admin users are:

- support team
- operations manager
- implementation team
- platform owner

It can also be used during onboarding of new merchants and restaurants.

## Current User Roles

### Admin

Platform-wide operations user.

Current admin UI can:

- log in and maintain session
- see all merchants
- see all restaurants
- see all drivers
- see all admin users
- create merchant users
- create restaurant staff users
- update restaurant commercial terms
- update restaurant tracking settings
- update driver capacity
- update driver dispatch policy
- review driver payout rules and merchant billing rules per restaurant
- review current driver capacity and dispatch mode values

### Merchant

Franchise or multi-store business user.

Current merchant UI can:

- see all restaurants under that merchant
- see merchant-wide orders and reporting
- update commercial terms for owned restaurants
- update tracking settings for owned restaurants
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

### Pricing, Billing, And Driver Earnings

- each order stores a snapped driver payout amount
- each order stores a snapped merchant billing amount
- different restaurants can use different commercial rules
- historical orders keep their own payout and billing snapshots even if rules change later

### Current Commercial Ownership

Current source of commercial values:

- commercial terms are stored on each restaurant configuration in the backend
- each restaurant has two rule sets:
  - `driverPayoutRule`: what the driver earns
  - `merchantBillingRule`: what your company bills the store
- each rule supports:
  - base amount
  - included distance in km
  - additional amount per km after the included distance

How the rules behave:

- a flat delivery fee is represented by setting additional per km to `0`
- a distance-based fee is represented by setting base amount, included km, and additional per km
- the driver app only receives the snapped driver payout for the order
- the driver app does not receive the merchant billing amount

Current edit paths:

- admin can update restaurant commercial terms from the admin portal
- merchant can update commercial terms for owned restaurants from the merchant portal
- commercial changes affect future dispatches and future orders
- existing orders keep their snapped values

### Security And Access

- passwords are hashed
- browser portals use `HttpOnly` cookie sessions
- Flutter app uses secure device storage for auth
- password reset flow exists
- session refresh and rotation exist
- audit logs exist
- rate limiting exists

## Current Configuration Controls

These are the important settings that can be controlled today.

### Per driver

Admin can change:

- dispatch policy
- max active orders or capacity

### Per restaurant

Admin can change:

- tracking settings
- driver payout rule
- merchant billing rule

Merchant can change for owned restaurants:

- tracking settings
- driver payout rule
- merchant billing rule

### Per merchant

Supported by current product:

- multiple merchant users
- multiple restaurants under one merchant
- merchant-wide order and report visibility

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

### Review merchant and restaurant setup

Expected:

- each restaurant shows merchant association
- each restaurant shows driver payout and merchant billing summaries
- driver list shows current capacity and dispatch information

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

### Update restaurant commercial terms

1. Select a restaurant in the settings section
2. Change driver rate and store charge
3. Save commercial terms

Expected:

- updated values appear in the restaurant cards
- merchant view shows the new values for that restaurant

### Update restaurant tracking settings

1. Select a restaurant in the settings section
2. change one or more tracking toggles
3. Save tracking

Expected:

- merchant and restaurant views reflect the changed tracking behavior

### Update driver dispatch controls

1. Select a driver
2. Change capacity and or dispatch policy
3. Save

Expected:

- driver settings update successfully
- dispatch behavior uses the new driver settings

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

### Update store commercial terms

1. Select a store
2. Change the driver payout rule or merchant billing rule
3. Save commercial terms

Expected:

- updated values appear in the merchant store view
- backend uses the new commercial terms for future orders

### Update store tracking settings

1. Select a store
2. Change tracking toggles
3. Save tracking

Expected:

- merchant order display and restaurant display follow the new tracking settings

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
4. Log in as admin and show:
- merchants
- restaurants
- commercial terms
- drivers, capacity, and dispatch policy controls
5. Update one restaurant commercial term from admin
6. Log in as merchant and show:
- multi-store visibility
- store commercial-term and tracking controls
- create staff user
7. Log in as restaurant staff and create an order
8. Confirm the driver receives the order
9. Accept the order on the driver app
10. Confirm restaurant and merchant portals update live
11. Progress the driver through arrived, pickup, and delivered
12. Confirm:
- restaurant sees status changes
- merchant sees status changes
- driver earnings update
- reporting totals update

## Presentation Demo Script

Use this short scripted flow during a stakeholder presentation.

### Demo objective

Show that the platform supports:

- platform administration
- merchant or franchise visibility
- store-level operations
- live driver dispatch and completion

### Suggested speaking flow

1. Start with admin.
Explain that admin is for platform operations and onboarding, not for restaurant staff.
Show all merchants, restaurants, drivers, commercial-term controls, and driver dispatch controls.

2. Move to merchant.
Explain that a merchant can see all restaurants under one brand or franchise group.
Show multi-store visibility, store commercial-term controls, tracking settings, and store staff creation.

3. Move to restaurant.
Explain that restaurant staff is store-scoped and can create delivery orders.
Create a real sample order.

4. Move to driver.
Show the Android driver app online.
Receive the order, accept it, and move through the delivery steps.

5. Return to restaurant and merchant.
Show that both views update live and that the driver earnings and reporting move correctly.

## Suggested Screenshots Checklist

Capture these for business review or documentation:

- Admin login screen
- Admin dashboard with merchants, restaurants, and drivers visible
- Admin settings section showing commercial terms, tracking, and driver dispatch controls
- Merchant dashboard showing multiple restaurants
- Merchant store settings section
- Merchant staff creation section
- Restaurant dashboard before order creation
- Restaurant order created and waiting for driver
- Driver incoming order screen
- Driver accepted order screen
- Restaurant view after acceptance
- Merchant view after acceptance
- Driver delivered confirmation or updated earnings view
- Restaurant view after delivery
- Merchant report view after delivery

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



