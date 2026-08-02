# Garage Saathi — iOS & Android packaging

The phone apps are the **same** app as the PWA. `mobile/` is a Capacitor shell; the web
code stays in the repo root, which is also what GitHub Pages serves. Nothing under
`mobile/` is loaded by the hosted PWA, and nothing in the root was rewritten to suit the
native build — `app.js`, `db.js` and `sync.js` are copied in byte-for-byte, so the 34/34
server-enforcement tests and the 5-role regression still describe the shipped code.

    repo root  ──copy──►  mobile/www/  ──cap sync──►  mobile/android/  &  mobile/ios/
    (the PWA)             (build output)              (native projects)

## Build

Prerequisites: Node 22+, JDK 21, Xcode, Android SDK. On this machine JDK 21 is at
`/usr/local/opt/openjdk@21` and is **not** the default `java` (that's a JDK 13), so the
Gradle commands below set `JAVA_HOME` explicitly.

```bash
cd mobile
npm install
node make-assets.mjs      # icon.png 1024², splash.png 2732² (#0f1720)
npx @capacitor/assets generate --iconBackgroundColor '#0f1720' --splashBackgroundColor '#0f1720'
npm run sync              # build www/ + copy into both native projects
```

**Android APK** (sideloadable, debug-signed):

```bash
cd mobile/android && JAVA_HOME=/usr/local/opt/openjdk@21 ./gradlew assembleDebug
```

Output: `mobile/android/app/build/outputs/apk/debug/app-debug.apk` (~10 MB,
`com.mahalaxmi.garagesaathi`, minSdk 24, targetSdk 36).

**iOS**:

```bash
cd mobile/ios && xcodebuild -project App/App.xcodeproj -scheme App \
  -configuration Debug -sdk iphonesimulator \
  -destination 'platform=iOS Simulator,name=iPhone 15 Pro' \
  -derivedDataPath build CODE_SIGNING_ALLOWED=NO build
```

## What the native shell changes, and why

### `sync.js` — backend URL on native (the one real trap)
The packaged app serves itself from `https://localhost` (Android) or
`capacitor://localhost` (iOS). The existing `_isLocalHost()` check reads that as "this is
a dev machine" and would have pointed **every phone at port 8766 on itself**. `baseUrl()`
now consults `_isNative()` first and defaults to the Render backend. On the web the guard
is inert — verified both ways:

| context | `Sync.info().url` |
| --- | --- |
| native (`Capacitor.isNativePlatform()`) | `https://garage-saathi-sync.onrender.com` |
| browser on `127.0.0.1` | `http://127.0.0.1:8766` |

A device-level override (`localStorage.syncUrl`) still wins in both cases.

### `mobile/native-bridge-shim.js` — native-only, never shipped to Pages
- **Geolocation.** WKWebView and Android WebView refuse `navigator.geolocation` unless the
  host app brokers the permission. The shim replaces the API with one that resolves
  through the Capacitor plugin and returns the same `{coords:{latitude,longitude}}` shape,
  so the three existing call sites (garage setup, attendance in, attendance out) are
  untouched.
- **Camera.** `getUserMedia` is wrapped to request the OS camera grant on first use rather
  than at launch, so the app doesn't open with a permission dialog the user has no context
  for.
- **Back button.** Android's hardware back goes to `history.back()` and only exits the app
  when there's nothing left to pop.
- **Status bar / splash** theming to `#0f1720`.

### `mobile/build-www.mjs`
- Vendors Leaflet and face-api locally, so the **map and face detection work offline** in
  the packaged app (the PWA loads both from CDNs).
- Disables service-worker registration on native — the assets are already on disk, and a
  stale SW cache would silently pin an old `app.js` across updates.

## Permissions
`AndroidManifest.xml`: `INTERNET`, `CAMERA`, `ACCESS_FINE_LOCATION`,
`ACCESS_COARSE_LOCATION`, `POST_NOTIFICATIONS`; camera and GPS declared
`required="false"` so the garage's older tablets can still install.
`Info.plist`: `NSCameraUsageDescription`, `NSLocationWhenInUseUsageDescription`,
`NSPhotoLibraryUsageDescription`, `NSPhotoLibraryAddUsageDescription`.

## Not done, and what it would take

- **Remote push on native.** The PWA's VAPID web push does not work inside a native shell
  (iOS has no web push in WKWebView). Real push needs `@capacitor/push-notifications` plus
  a Firebase project for Android and an APNs key for iOS — both require the owner's
  accounts. `@capacitor/local-notifications` is installed and works today for on-device
  reminders.
- **Store submission.** Out of scope by decision: it needs the owner's Apple Developer and
  Play Console accounts, payment, and signing certificates. Both projects are otherwise
  release-ready; what remains is a signing config and the upload.
