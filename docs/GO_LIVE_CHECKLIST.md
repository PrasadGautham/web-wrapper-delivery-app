# Go-Live Checklist

## Goal

Use this checklist before calling the platform ready for business use.

It covers all three surfaces together:

- backend
- backend-served web portals
- Flutter driver mobile app

Current intended release scope can be:

- Android only

If that is the decision, iOS checks remain pending and should be tracked separately instead of blocking the Android rollout.

## 1. Backend Go-Live Checklist

### Configuration

- production env file is prepared from [PRODUCTION_ENV_CHECKLIST.md](/c:/dev/DriverApp/docs/PRODUCTION_ENV_CHECKLIST.md)
- `DATABASE_URL` points to production Postgres
- `FIREBASE_SERVICE_ACCOUNT_PATH` points to a production Firebase Admin secret file
- `ALLOWED_WEB_ORIGINS` is set correctly
- `METRICS_API_KEY` is set if metrics are reachable outside a private network
- `ALLOW_ADMIN_API_KEY_FALLBACK=false`
- `ALLOW_INSECURE_PASSWORD_RESET_TOKEN_RESPONSE=false`

### Validation

- `npm run prisma:generate`
- `npm run prisma:migrate:deploy`
- `npm run check`
- `npm test`
- `npm run test:e2e:web`
- `npm run smoke:deploy`
- if an isolated Postgres test DB exists: `npm run test:postgres`

### Runtime checks

- `/api/health` returns healthy data
- `/api/metrics` is reachable only as intended
- password reset works through SMTP if enabled
- Firebase Admin initialization works without warnings
- dispatch cycle runs without repeating failures
- CSP reports can be received if reporting is enabled

## 2. Admin Portal Go-Live Checklist

URL:

- `/admin`

Checks:

- admin login works with session auth
- admin session refresh works
- admin logout works
- creating merchant users works
- creating restaurant staff users works
- merchant and restaurant data appear correctly
- unauthorized access returns `401`
- no platform-wide controls are exposed to non-admin sessions

Business checks:

- create at least one merchant user for each real merchant or franchise group
- create at least one backup admin user
- document who owns admin credentials operationally

## 3. Merchant Portal Go-Live Checklist

URL:

- `/merchant`

Checks:

- merchant login works
- merchant only sees restaurants for its own merchant
- merchant realtime updates work through SSE
- merchant can create store staff for owned restaurants only
- merchant cannot see restaurants from another merchant
- merchant-wide report totals match the underlying restaurant data

Business checks:

- verify one merchant user can manage multiple restaurants in the same franchise group
- verify multiple merchant users on the same merchant behave correctly
- verify disabled merchant users lose access immediately after session expiry or logout

## 4. Restaurant Portal Go-Live Checklist

URL:

- `/restaurant`

Checks:

- restaurant owner login works
- restaurant staff login works
- each staff user is limited to one restaurant scope
- order creation works
- realtime updates work through SSE
- ETA fields display correctly according to tracking settings
- `pickedUp` displays as `In transit` only when enabled
- password reset works for restaurant users if SMTP is configured

Business checks:

- create multiple staff users for one store and verify they can all log in
- verify one store cannot access another store’s data
- verify merchant-created staff users can log in immediately

## 5. Flutter Driver App Go-Live Checklist

Checks:

- login works
- session restore works
- logout clears the secure token
- password reset flow works
- FCM token is registered to backend
- live location updates reach backend
- driver can go online and offline
- incoming order appears for the nearest eligible driver
- accept, arrive, pickup, and deliver flows work end to end
- earnings update after completion
- order sound or alert behavior is correct

Android real-device checks:

- location permission granted and behavior verified
- foreground and background tracking verified
- push offer received on a real device
- notification or vibration behavior verified
- release build opens successfully

iOS real-device checks:

- session flow verified
- background location validated on macOS/Xcode
- push delivery validated
- release signing validated

If the business is launching Android only:

- document iOS as not in current release scope
- complete all Android checks before release
- keep iOS validation as a separate later milestone

## 6. Dispatch And Operations Checklist

Use at least two drivers and two stores while testing.

Checks:

- nearest eligible driver gets the order first
- stale-location driver is skipped
- offline driver is skipped
- at-capacity driver is skipped
- driver allow-list and store tie rules behave correctly
- merchant-level fallback behavior behaves correctly
- reject and timeout trigger reassignment correctly
- one restaurant’s rates do not overwrite another’s rates
- driver payout and restaurant charge are preserved per order

## 7. Security Checklist

- passwords are hashed in storage
- web portals use HttpOnly cookie sessions
- Flutter uses secure device storage
- insecure password reset debug mode is off
- admin API key fallback is off unless intentionally required
- secrets are outside git
- metrics endpoint is protected if exposed
- CORS is allowlisted
- browser portals load with security headers and CSP

## 8. Monitoring Checklist

- decide where `/api/metrics` is scraped from
- set alerting for backend 5xx spikes
- set alerting for dispatch-cycle failure spikes
- set alerting for auth failure spikes
- define an owner for production alerts
- verify webhook alert destination if enabled
- verify CSP reporting destination if CSP reporting is enabled

## 9. Rollout Plan

Recommended rollout:

1. Deploy backend to staging.
2. Run staging database migrations.
3. Test admin, merchant, restaurant, and driver flows end to end.
4. Test with real Android devices.
5. If iOS is in scope, test iPhone from macOS/Xcode.
6. Create production merchants, stores, and staff accounts.
7. Deploy production backend.
8. Release Android build to internal users first.
9. Observe metrics and audit logs for the first live week.

## 10. Honest Readiness Decision

You can reasonably call the system business-usable when all of these are true:

- backend checks and tests are green
- Postgres production config is in place
- admin, merchant, and restaurant scopes all behave correctly
- Android driver flow is verified on real devices
- iOS path is either validated or intentionally not launched yet
- production secrets are configured correctly
- monitoring owner is defined

If those are not complete, treat the system as pilot or controlled rollout, not fully released production.
