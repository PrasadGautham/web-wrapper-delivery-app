# Driver App

A production-oriented Flutter starter for a food delivery driver application. The project ships with clean architecture, Riverpod state management, modular features, mock backend services, external Google Maps deep-link navigation, Firebase Cloud Messaging wiring, localization, secure token storage, and documentation for replacing mocks with a real backend later.

## What is included

- Email/password login with secure token persistence
- Driver dashboard with online/offline toggle and live metrics
- Incoming order flow with countdown, accept/reject, auto-reject on timeout
- Restaurant and customer navigation screens with external Google Maps links and ETA
- Pickup and delivery completion flow
- Earnings dashboard with summary cards and chart
- Push notification architecture using Firebase Messaging and local notifications
- English and Arabic localization
- Mock services that behave like backend APIs
- Clear project structure designed for scale
- Firebase token visibility in profile for Android testing
- Branding assets for app icon and splash automation

## Folder structure

```text
lib/
  core/
    config/
    constants/
    localization/
    theme/
    utils/
  data/
    mock/
    models/
    repositories/
  domain/
    entities/
    repositories/
    usecases/
  features/
    authentication/
    dashboard/
    earnings/
    navigation/
    orders/
    profile/
  presentation/
    widgets/
  routes/
  services/
    api/
    firebase/
    location/
```

## Prerequisites

1. Install Flutter stable from the official guide: https://docs.flutter.dev/get-started/install
2. Run `flutter doctor` and resolve all required platform dependencies.
3. Install Android Studio for Android builds and Xcode for iOS builds.
4. Make sure a physical device or emulator/simulator is available.

## First-time setup

1. Open this folder in your editor.
2. If the platform folders do not exist yet, run:

```bash
flutter create .
```

3. Install packages:

```bash
flutter pub get
```

If you are on Windows, enable Developer Mode before running the app. Flutter plugins use symlinks during builds.

```powershell
start ms-settings:developers
```

4. Add a notification sound file if you want a real custom sound:

```text
assets/audio/order_alert.mp3
```

5. Run the app:

```bash
flutter run
```

## Branding commands

After updating branding assets, run:

```bash
dart run flutter_launcher_icons
dart run flutter_native_splash:create
```

## Firebase Cloud Messaging setup

This project is wired for Firebase but stays runnable without Firebase configuration.

1. Create a Firebase project in the Firebase console.
2. Add Android and iOS apps to Firebase.
3. Install the FlutterFire CLI and generate `firebase_options.dart`.
4. Replace the placeholder bootstrap options in [firebase_bootstrap_options.dart](/c:/dev/DriverApp/lib/services/firebase/firebase_bootstrap_options.dart).
5. Enable Cloud Messaging in Firebase.
6. Follow platform-specific setup in [SETUP.md](/c:/dev/DriverApp/docs/SETUP.md).

## Mock credentials

- Email: `driver@demo.com`
- Password: `Password123`

## Mock backend behavior

- Orders are generated from seeded data.
- A new incoming order is emitted while the driver is online and idle.
- Accepting an order moves the driver through restaurant pickup and customer delivery states.
- If the countdown expires, the order is auto-rejected and the next order can be assigned.

## Maps and tracking

The current app does not embed the Google Maps SDK. It opens route navigation in Google Maps using deep links, so no Google Maps billing or API key is required for the current mobile app.

Restaurant-side live driver tracking should be added later in the backend/dashboard layer, where you can store live driver locations, compute ETA to the restaurant, and expose tracking to restaurant operators.

## Replace mock APIs with a real backend

1. Keep the domain layer unchanged.
2. Replace implementations in `lib/data/repositories/`.
3. Replace `MockApiClient` with a real HTTP client.
4. Map backend DTOs into the existing domain entities.
5. Keep the presentation and use-case layers unchanged.

Detailed instructions are in [SETUP.md](/c:/dev/DriverApp/docs/SETUP.md).
Release/signing instructions are in [RELEASE.md](/c:/dev/DriverApp/docs/RELEASE.md).
