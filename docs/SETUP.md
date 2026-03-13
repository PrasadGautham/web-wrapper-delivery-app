# Driver App Setup Guide

## 1. Install Flutter

1. Download the latest stable Flutter SDK from the official site.
2. Extract it to a permanent folder.
3. Add Flutter to your system `PATH`.
4. Run `flutter doctor`.
5. Install the missing dependencies shown by `flutter doctor`.

Official guide: https://docs.flutter.dev/get-started/install

## 2. Create platform folders if needed

If the project only contains Dart source files, run:

```bash
flutter create .
```

This generates Android, iOS, web, macOS, Windows, and Linux runner folders.

## 3. Install packages

```bash
flutter pub get
```

## 3.1 Windows developer mode

If you are running Flutter on Windows, enable Developer Mode before building. Plugin-based projects use symlinks.

```powershell
start ms-settings:developers
```

Then enable `Developer Mode` in Windows Settings.

## 4. Run on Android

1. Install Android Studio.
2. Open Android Studio and install the Android SDK.
3. Create or start an Android emulator.
4. From the project folder run:

```bash
flutter run -d android
```

## 5. Run on iOS

1. Use macOS with Xcode installed.
2. Open Xcode once and accept all license prompts.
3. Install CocoaPods if needed.
4. Start an iOS simulator.
5. Run:

```bash
flutter run -d ios
```

## 6. Configure Firebase

### FlutterFire CLI

1. Install:

```bash
dart pub global activate flutterfire_cli
```

2. Log in:

```bash
firebase login
```

3. Configure:

```bash
flutterfire configure
```

4. Replace the placeholder file logic in [lib/services/firebase/firebase_bootstrap_options.dart](/c:/dev/DriverApp/lib/services/firebase/firebase_bootstrap_options.dart) with the generated `firebase_options.dart`.

### Android Firebase steps

1. Download `google-services.json` from Firebase.
2. Place it in `android/app/`.
3. Add the Google services Gradle plugin if `flutterfire configure` did not already add it.
4. Put your custom notification sound in:

```text
android/app/src/main/res/raw/order_alert.mp3
```

### iOS Firebase steps

1. Download `GoogleService-Info.plist`.
2. Add it to `ios/Runner/` via Xcode.
3. Enable Push Notifications capability.
4. Enable Background Modes > Remote notifications.
5. Put your custom sound file in the iOS Runner target bundle.

## 7. Google Maps setup

The current driver app uses external Google Maps deep links for navigation and does not embed Google Maps SDK views.

That means:

- no Maps API key is required right now
- no Google Maps billing setup is required for the current mobile app

If you later build restaurant-side live tracking dashboards or embedded maps, that is when Maps billing and API-key restrictions should be added.

## 8. Notification handling

The app already includes:

- Firebase Messaging bootstrap hooks
- Foreground notification display using `flutter_local_notifications`
- Background handler placeholder
- Notification tap routing hook

Manual setup still required:

- Firebase project configuration
- Platform push permissions
- Sound asset placement
- APNs configuration for iOS

## 9. App configuration

Main config file: [app_config.dart](/c:/dev/DriverApp/lib/core/config/app_config.dart)

This file controls:

- App name
- Mock API delay
- Incoming order countdown duration
- Default locale
- Dummy map coordinates

## 10. Replace mock APIs with real backend

1. Create a real API client in `lib/services/api/`.
2. Keep repository interfaces in `lib/domain/repositories/`.
3. Replace repository implementations in `lib/data/repositories/`.
4. Preserve domain entities and use cases.
5. Update dependency injection providers to point to the real implementations.

Recommended backend mapping:

- `/login` -> token + driver profile
- `/orders/available` -> assigned order offers
- `/orders/accept` -> order acceptance response
- `/orders/reject` -> rejection acknowledgement
- `/orders/pickup` -> order status update
- `/orders/deliver` -> completion response
- `/driver/earnings` -> earnings summary and timeline

## 11. Architecture summary

- `domain/` contains business entities, repository contracts, and use cases.
- `data/` contains models, mock data, and repository implementations.
- `services/` contains infrastructure integrations like mock API, Firebase, and location logic.
- `features/` contains screen-specific controllers and views.
- `presentation/` contains reusable widgets.
- `routes/` owns navigation and auth redirects.

## 12. Production hardening checklist

Before App Store / Play Store submission:

1. Replace all mock repositories with real APIs.
2. Configure Firebase for all environments.
3. Add crash reporting and analytics.
4. Add real route polylines and turn-by-turn navigation integration.
5. Add full test coverage.
6. Replace placeholder language strings with professional translations.
7. Complete privacy policy and permission copy.
