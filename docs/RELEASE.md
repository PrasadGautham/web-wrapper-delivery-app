# Android Release Guide

## 1. Package and app identity

Current Android application ID:

```text
com.fooddelivery.driverapp
```

Current user-facing app name:

```text
Driver App
```

Update these only if you are sure the Firebase Android app, Play Console entry, and signing setup will match.

## 2. Signing key setup

Create a release keystore:

```bash
keytool -genkey -v -keystore android/app/driver-app-release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias driverapp
```

Create `android/key.properties` from the example file.

## 3. key.properties format

Use [key.properties.example](/c:/dev/DriverApp/android/key.properties.example):

```properties
storePassword=your-store-password
keyPassword=your-key-password
keyAlias=driverapp
storeFile=driver-app-release.jks
```

Do not commit real secrets or keystores.

## 4. Build release APK / App Bundle

Preferred Play Store artifact:

```bash
flutter build appbundle --release
```

Optional APK:

```bash
flutter build apk --release
```

## 5. Play Store checklist

- Unique application ID confirmed
- Release keystore created and backed up
- Firebase Android app uses the same package name
- Notification icon and sound assets added
- Privacy policy written
- App screenshots created
- App icon and splash verified
- Permission rationale text reviewed
- Real backend integrated or mock features hidden
- Crash reporting and analytics enabled
- QA completed on physical Android device

## 6. Production configuration checklist

- Replace mock repositories with real API repositories
- Send FCM token to backend after login
- Store backend auth tokens securely
- Add environment config for dev/staging/prod
- Decide later whether restaurant-side tracking will use embedded maps or deep links only
- Configure Firebase App Check if needed
- Add ProGuard/R8 review for release

## 7. Store listing preparation

Prepare:

- App name
- Short description
- Full description
- Feature graphic
- Launcher icon
- 5-8 screenshots
- Support email
- Privacy policy URL
- Content rating answers
- Data safety form
