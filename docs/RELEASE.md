# Mobile Release Guide

## Purpose

This file covers release preparation for the Flutter driver mobile app.

It is intentionally mobile-focused.

For backend deployment and go-live steps, use:

- [DEPLOYMENT.md](/c:/dev/DriverApp/docs/DEPLOYMENT.md)
- [GO_LIVE_CHECKLIST.md](/c:/dev/DriverApp/docs/GO_LIVE_CHECKLIST.md)

## 1. Current Mobile App State

Current driver app behavior:

- authenticates against the backend
- stores auth token securely
- registers FCM token with backend
- sends live driver location to backend
- receives backend-driven order offers
- opens Google Maps externally for navigation

## 2. Android Release Preparation

Checklist:

- confirm application ID remains `com.fooddelivery.driverapp`
- confirm release keystore exists and is backed up
- confirm `android/key.properties` is set locally and not committed
- confirm Firebase Android app matches the same package name
- confirm push works on a real Android device
- confirm background location and online-driver tracking behave correctly on a real Android device

Build commands:

```powershell
cd C:\dev\DriverApp
C:\flutter\bin\flutter.bat build appbundle --release
```

Optional APK:

```powershell
C:\flutter\bin\flutter.bat build apk --release
```

## 3. Android Signing Files

Reference example:

- [key.properties.example](/c:/dev/DriverApp/android/key.properties.example)

Do not commit:

- `android/key.properties`
- keystore files

## 4. iOS Release Preparation

iOS is not finished from this Windows machine.

Before any iOS release, complete:

- [IOS_LATER.md](/c:/dev/DriverApp/docs/IOS_LATER.md)
- [IOS_BACKGROUND_VALIDATION.md](/c:/dev/DriverApp/docs/IOS_BACKGROUND_VALIDATION.md)

Required minimum before iOS production claim:

- Xcode signing and capabilities validated
- APNs and Firebase iOS push validated
- real iPhone background location validated
- release signing and provisioning configured

## 5. Production Mobile Config Expectations

Before release builds, make sure the mobile app is not pointing to local URLs.

Current backend base URL logic is in:

- [app_config.dart](/c:/dev/DriverApp/lib/core/config/app_config.dart)

For real release builds, move to a production-safe config strategy such as:

- `--dart-define`
- environment or flavor-based config
- CI-driven release config injection

Production rule:

- release builds must use HTTPS backend URLs only

## 6. Mobile QA Checklist

### Functional

- login
- session restore
- logout
- password reset
- online/offline toggle
- incoming order alert
- accept order
- arrive
- pickup
- deliver
- earnings update

### Push and permissions

- notification permission behavior
- location permission behavior
- FCM token generation
- backend device-token registration

### Real-device checks

Android:

- real push delivery
- background location behavior
- emulator-only assumptions removed

iOS:

- real push delivery
- background location behavior
- capability and entitlement validation

## 7. Store Release Preparation

Prepare separately:

- app icon and splash review
- screenshots
- privacy policy
- support contact
- store listing text
- permission rationale copy
- data safety and privacy disclosures

## 8. Final Release Rule

Do not treat the mobile app as fully production-ready until:

- Android real-device validation is complete
- iOS validation is complete if iOS is being launched
- backend production environment is ready
- the full system passes [GO_LIVE_CHECKLIST.md](/c:/dev/DriverApp/docs/GO_LIVE_CHECKLIST.md)
