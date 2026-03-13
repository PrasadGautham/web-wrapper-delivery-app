# iOS Later Checklist

This file is the exact handoff checklist for finishing iOS support when you have access to a Mac with Xcode.

## Current expected identifiers

- Firebase project: `web-wrapper-delivery-driver`
- iOS bundle ID: `com.fooddelivery.driverapp`
- iOS Firebase app ID: `1:599453892493:ios:478b105fdfb749c5e5c7c4`
- Firebase config file path:
  [GoogleService-Info.plist](/c:/dev/DriverApp/ios/Runner/GoogleService-Info.plist)
- Flutter Firebase options file:
  [firebase_options.dart](/c:/dev/DriverApp/lib/firebase_options.dart)

## What is already done

- Firebase iOS app was created in Firebase Console.
- `GoogleService-Info.plist` is present in the repo.
- Flutter-side Firebase config was corrected to use:
  - bundle ID `com.fooddelivery.driverapp`
  - iOS app ID `1:599453892493:ios:478b105fdfb749c5e5c7c4`

## What you need on macOS

1. Install Xcode.
2. Open:
   [Runner.xcworkspace](/c:/dev/DriverApp/ios/Runner.xcworkspace)
3. Select the `Runner` target.

## Xcode project configuration

1. In `Signing & Capabilities`:
   - choose your Apple Team
   - set Bundle Identifier to:

```text
com.fooddelivery.driverapp
```

2. Confirm the bundle ID exactly matches:
   - Firebase iOS app
   - `GoogleService-Info.plist`
   - `lib/firebase_options.dart`

3. Add `GoogleService-Info.plist` to the `Runner` target if Xcode does not already include it.

## Required capabilities

Add these capabilities to `Runner`:

- `Push Notifications`
- `Background Modes`

Under `Background Modes`, enable:

- `Remote notifications`

If you later add continuous background driver tracking on iPhone, you may also need:

- `Location updates`

## APNs setup

Firebase Cloud Messaging on iOS requires APNs.

1. Go to Apple Developer account.
2. Create an APNs Authentication Key.
3. Download the `.p8` file.
4. In Firebase Console:
   - Project Settings
   - Cloud Messaging
   - upload the APNs key
5. Use the correct:
   - Key ID
   - Team ID
   - Apple Team

## CocoaPods and build steps

From the `ios/` folder on macOS:

```bash
pod install
```

Then from project root:

```bash
flutter clean
flutter pub get
flutter run -d ios
```

If Apple-platform generated Flutter files still reference the old OneDrive location, regenerate them from `C:\dev\DriverApp` on the Mac before building. Check:

- [Generated.xcconfig](/c:/dev/DriverApp/ios/Flutter/Generated.xcconfig)
- [flutter_export_environment.sh](/c:/dev/DriverApp/ios/Flutter/flutter_export_environment.sh)

## Physical device testing

Test FCM on a real iPhone, not just the simulator.

Checklist:

- app launches
- Firebase initializes successfully
- notification permission prompt appears
- permission can be granted
- FCM token is generated
- notification tap opens the app correctly

## If FlutterFire config is rerun later

If you run `flutterfire configure` again in the future:

- confirm it still uses Firebase project `web-wrapper-delivery-driver`
- confirm iOS bundle ID remains `com.fooddelivery.driverapp`
- confirm it does not revert to `com.example.driverApp`

After rerunning, verify:

- [firebase_options.dart](/c:/dev/DriverApp/lib/firebase_options.dart)
- [firebase.json](/c:/dev/DriverApp/firebase.json)

## Do not change unless intentional

Do not casually change:

- bundle ID
- Firebase iOS app registration
- APNs key pairing

These must all stay aligned for iOS push notifications to work.
