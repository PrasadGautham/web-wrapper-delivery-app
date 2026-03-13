# Project Status

Last verified: March 13, 2026
Working project path: `C:\dev\DriverApp`
Legacy copy path: `C:\Users\prasa\OneDrive\Documents\Driver App` (do not keep building from this copy)

## Canonical Working Folder
Use only `C:\dev\DriverApp` going forward.

Reason:
- The OneDrive copy caused Gradle and Flutter build failures by locking generated files under `build/`.
- The project was copied out of OneDrive to avoid those file-lock issues.

## Current Platform Status

### Android
Completed:
- Flutter app builds in debug mode.
- Firebase is configured for Android.
- `google-services.json` is present in `android/app/`.
- Firebase Messaging is wired in the Flutter app.
- Notification permission flow is implemented.
- FCM token retrieval is implemented and exposed in the app profile screen.
- External Google Maps deep links are used instead of embedded in-app maps.
- Package ID is `com.fooddelivery.driverapp`.
- Branding assets, launcher icon setup, and splash setup are included.
- Release signing support is prepared via `android/key.properties`.

Pending:
- Real backend integration.
- Real custom notification sound asset if desired.
- Production keystore creation.
- Signed release `.aab` build for Play Store.

### iOS
Completed:
- Firebase Apple app exists in the Firebase project.
- `ios/Runner/GoogleService-Info.plist` is present.
- Flutter Firebase config includes the correct iOS identifiers.
- `ios/Runner.xcodeproj/project.pbxproj` is aligned to bundle ID `com.fooddelivery.driverapp`.
- Future iOS handoff checklist exists in `docs/IOS_LATER.md`.

Pending:
- Xcode target setup on macOS.
- Add plist to the Runner target in Xcode.
- Enable Push Notifications capability in Xcode.
- Enable Background Modes > Remote notifications in Xcode.
- APNs auth key upload in Firebase Console.
- Real device testing on iPhone.
- App Store release configuration.
- Regenerate Apple-platform Flutter generated files on macOS if they still show the old OneDrive project path in `ios/Flutter/Generated.xcconfig`, `ios/Flutter/flutter_export_environment.sh`, or `macos/Flutter/ephemeral/*`.

## Verified Firebase Identifiers
Firebase project ID:
- `web-wrapper-delivery-driver`

Android:
- Package ID: `com.fooddelivery.driverapp`
- Android app ID in `firebase_options.dart`: `1:599453892493:android:f2fcf5b80ed4ee77e5c7c4`

iOS:
- Bundle ID: `com.fooddelivery.driverapp`
- iOS app ID in `firebase_options.dart`: `1:599453892493:ios:478b105fdfb749c5e5c7c4`
- `GoogleService-Info.plist` BUNDLE_ID: `com.fooddelivery.driverapp`
- `GoogleService-Info.plist` GOOGLE_APP_ID: `1:599453892493:ios:478b105fdfb749c5e5c7c4`

These values are aligned and were manually verified.

## Firebase Runtime Files
Key files:
- `lib/firebase_options.dart`
- `ios/Runner/GoogleService-Info.plist`
- `android/app/google-services.json`
- `firebase.json`
- `lib/services/firebase/fcm_service.dart`

## Maps Decision
The app does not currently embed Google Maps SDK.

Current behavior:
- The driver app opens Google Maps externally using route deep links.
- No Google Maps API key is required for the current app flow.
- No Google Maps billing setup is required for the current app flow.

Reason:
- This avoids unnecessary Maps Platform setup and billing during the current phase.
- Restaurant-side driver tracking will be implemented later through the backend/admin side.

## Driver Tracking Architecture For Later
Planned approach:
1. Driver app sends periodic location updates to the backend while on an active order.
2. Backend stores latest driver coordinates for the order.
3. Restaurant/admin dashboard reads those coordinates.
4. Backend computes distance and ETA or delegates routing to a provider later if needed.
5. Dashboard shows the driver approaching the restaurant/customer.

## Testing Status
Verified previously on Android emulator:
- App launches.
- Firebase initializes successfully.
- Notification permission is granted.
- A live FCM token was generated.

Example captured token from earlier debug session:
- `eGdJl_ZyTkK-AXGR3Ai0wD:APA91bFLCaLKc59W-30Uxfv0-XbCsx3QlTV_wJF00cpS40oQv_aqikz84rIhBPlna_G9hatHI1kXWRvFCT1pocpsxt3EiIo_aweaFC1CCVfhJrp6ePLAZ8A`

Note:
- FCM tokens can rotate. Always use the latest token shown in the app profile screen or logs.

## Recommended Next Commands
From `C:\dev\DriverApp`:

```powershell
C:\flutter\bin\flutter.bat devices
C:\flutter\bin\flutter.bat run -d emulator-5554
```

If the emulator is not running:

```powershell
C:\flutter\bin\flutter.bat emulators --launch Pixel_7
```

## Android Test Flow
1. Launch the app on the emulator.
2. Log in with the demo credentials configured in the mock auth flow.
3. Open Profile and confirm an FCM token appears.
4. Return to the dashboard.
5. Stay online and wait for an incoming mock order.
6. Accept the order.
7. Open the Google Maps external route.
8. Mark arrived, pick up, and delivered.
9. Verify dashboard and earnings update.
10. Send a Firebase Console test push to the latest FCM token.

## Release Prep Files
- `android/key.properties.example`
- `docs/RELEASE.md`
- `docs/SETUP.md`
- `docs/IOS_LATER.md`
- `README.md`

## Important Notes
- Do not commit `android/key.properties`.
- Do not commit release keystore files unless you explicitly intend to manage secrets that way.
- Keep building from `C:\dev\DriverApp`, not the OneDrive copy.
- If `flutterfire configure` is rerun later, verify that the iOS bundle ID remains `com.fooddelivery.driverapp` and does not regress to an old placeholder value.
- `flutter analyze` was re-run on March 13, 2026 from `C:\dev\DriverApp` and passed with no issues.
