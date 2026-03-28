# iOS Background Location Validation

## Status

This step cannot be executed from the current Windows environment.

It must be validated on:

- macOS
- Xcode
- a real iPhone preferred

## What To Validate

1. Background location permission flow
2. App receives location updates while driver is online
3. App continues receiving updates when backgrounded
4. App continues long enough for realistic delivery flow
5. Driver location reaches backend with fresh timestamps
6. Dispatch still excludes stale drivers correctly
7. Foreground order flow still works after background/foreground transitions

## Xcode Capabilities

Enable and verify in the Runner target:

- Background Modes
- Location updates
- Remote notifications

## Info.plist Expectations

Verify these keys are present and accurate:

- `NSLocationWhenInUseUsageDescription`
- `NSLocationAlwaysAndWhenInUseUsageDescription`
- any notification permission descriptions your final app flow requires

The wording should explain continuous driver tracking while online or delivering.

## Real Device Test Plan

1. Build and run the app on iPhone.
2. Log in as a driver.
3. Grant location permission.
4. Put the driver online.
5. Confirm backend receives `POST /api/driver/location` updates.
6. Send the app to background.
7. Confirm updates continue for several minutes.
8. Create an order from the restaurant portal.
9. Accept and progress the order.
10. Confirm location remains fresh during pickup and transit.
11. Confirm restaurant ETA still updates correctly.
12. Kill and relaunch the app, then verify recovery behavior.

## Backend Checks During Validation

- `GET /api/admin/drivers`
  Confirm `locationFreshness` is `fresh`
- `GET /api/restaurants/me/orders`
  Confirm ETA and status updates reflect current driver movement
- audit logs should include repeated `driver.location.updated`

## Failure Conditions

Treat iOS background location as not validated if any of these occur:

- updates stop immediately after backgrounding
- updates become stale during active delivery
- app only tracks when foregrounded
- permission flow is confusing or inconsistent
- location resumes only after manual foreground reopen

## Recommended Next Step On macOS

Run this checklist before any public iOS release. Until that is done, Android can be considered the operationally stronger platform for live rollout.
