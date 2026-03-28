# Mobile Release Guide

## Current Release Scope

Current recommended release track:
- Android driver app

Current deferred track:
- iOS driver app

## Android Release Focus

Before release:
- verify backend URL configuration
- verify Firebase project configuration
- verify driver login
- verify online or offline flow
- verify incoming orders
- verify accept, pickup, and deliver flow
- verify earnings and completed deliveries updates

## Android Local Verification

```powershell
cd C:\dev\DriverApp
C:\flutter\bin\flutter.bat analyze
C:\flutter\bin\flutter.bat test
C:\flutter\bin\flutter.bat run
```

## iOS Note

Do not claim iOS production readiness yet.

See:
- [IOS_LATER.md](/c:/dev/DriverApp/docs/IOS_LATER.md)
- [IOS_BACKGROUND_VALIDATION.md](/c:/dev/DriverApp/docs/IOS_BACKGROUND_VALIDATION.md)
