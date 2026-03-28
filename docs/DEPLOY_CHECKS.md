# Deployment Checks

## Purpose

This document separates:
- checks to run before a normal deployment
- checks to run before a release candidate
- checks to run before first production launch

This avoids treating every deployment like a first-time go-live event.

## 1. Normal Deployment Checks

Run these before normal backend or app deployments when code has changed.

### Backend

```powershell
cd C:\dev\DriverApp\backend
npm run check
npm test
npm run test:e2e:web
```

### Flutter

```powershell
cd C:\dev\DriverApp
C:\flutter\bin\flutter.bat analyze
C:\flutter\bin\flutter.bat test
```

### Minimum expectation

- all commands pass
- no unexpected test skips
- no unexpected warnings that indicate runtime breakage

## 2. Release Candidate Checks

Run these before a release candidate, staging signoff, or any materially important release.

### Code verification

Run everything in **Normal Deployment Checks**.

### Hosted environment validation

Also verify:
- admin login on hosted environment
- merchant login on hosted environment
- restaurant login on hosted environment
- restaurant creates order successfully
- merchant sees live order update
- driver release build can log in against hosted backend
- driver can go online and receive an order
- driver can accept, pick up, and deliver

### Android build validation

- build release app with hosted backend URL
- verify Firebase configuration
- verify release-signed build installs correctly

Hosted backend example:

```powershell
cd C:\dev\DriverApp
C:\flutter\bin\flutter.bat run --dart-define=BACKEND_API_BASE_URL=https://your-host/api
```

## 3. First Production Launch Checks

Run these before the first live production launch or a major environment cutover.

### Infrastructure and env

Confirm:
- `DATABASE_URL`
- `ALLOWED_WEB_ORIGINS`
- `WEB_SESSION_COOKIE_SECURE=true`
- `WEB_SESSION_COOKIE_SAME_SITE` is correct for the deployment model
- `FIREBASE_SERVICE_ACCOUNT_PATH`
- metrics protection settings if used
- alert webhook settings if used

### Real-device Android validation

Confirm on real hardware:
- login works
- notification permission flow works
- location permission flow works
- online toggle works
- incoming order arrives reliably
- accept, pickup, and delivery work
- earnings update after delivery
- background behavior is acceptable under battery optimization

### Operational walkthrough

Confirm with business flow:
1. restaurant creates order
2. eligible driver receives it
3. driver accepts
4. restaurant and merchant views update live
5. driver completes delivery
6. earnings and reporting update correctly

## 4. What Does Not Need Full Revalidation Every Time

Usually not required before every small deployment unless related code or infrastructure changed:
- first-time Firebase project setup
- first-time hosted cookie validation
- first-time real-device Android release walkthrough
- first-time production env audit

Those are usually:
- initial launch checks
- environment-change checks
- release-candidate checks

## Related Docs

- [SETUP.md](/c:/dev/DriverApp/docs/SETUP.md)
- [DEPLOYMENT.md](/c:/dev/DriverApp/docs/DEPLOYMENT.md)
- [PRODUCTION_ENV_CHECKLIST.md](/c:/dev/DriverApp/docs/PRODUCTION_ENV_CHECKLIST.md)
- [GO_LIVE_CHECKLIST.md](/c:/dev/DriverApp/docs/GO_LIVE_CHECKLIST.md)
- [FINAL_GO_LIVE_GAPS.md](/c:/dev/DriverApp/docs/FINAL_GO_LIVE_GAPS.md)
