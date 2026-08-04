# iOS builds in CI

`ios-build.yml` builds and signs the iOS app on a GitHub-hosted Apple-silicon
runner, because the Intel Mac on this project cannot.

## Why it exists

Xcode 16.4 is the last version Apple ever shipped for Intel (x86_64) Macs. Its
device support stops at iOS 16.4. The test iPhone runs iOS 26.5, so that Mac
cannot install a build on it — not a configuration problem, the toolchain simply
has no device support package for that OS. GitHub's `macos-15` runners are Apple
silicon with current Xcode, so they can.

Verified with Apple's own release feed:

```
x86_64:        … 16.3, 16.4 (16F6)     ← newest that exists for Intel
appleSilicon:  … 26.6, 27.0 Beta 4
```

## Prerequisite: a paid Apple Developer Program membership

**This workflow cannot run without one.** It signs via an App Store Connect API
key, and those keys only exist for paid memberships ($99/yr) — a free personal
team has no App Store Connect access at all.

A free team can still build and run on a *simulator*, and can install on a
physical device directly from Xcode on a compatible Mac. What it cannot do is
distribute — no TestFlight, no CI signing.

If you don't want to pay: install the PWA instead. Safari → Share → Add to Home
Screen gives a home-screen icon, full-screen chrome and offline support. You lose
the native camera/geolocation bridging and local notifications; the web fallbacks
still work.

## Secrets to configure

Settings → Secrets and variables → Actions → New repository secret.

| Secret | Where it comes from |
|---|---|
| `APPSTORE_KEY_ID` | App Store Connect → Users and Access → Integrations → App Store Connect API. The 10-character Key ID. |
| `APPSTORE_ISSUER_ID` | Same page, shown above the key list. A UUID. |
| `APPSTORE_PRIVATE_KEY` | The `AuthKey_XXXXXXXXXX.p8` file downloaded when the key is created. Paste the **entire** contents including the `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` lines. |

Give the key the **App Manager** role — lower roles can't create signing assets,
and the archive step fails with a provisioning error that doesn't name the cause.

Apple lets you download the `.p8` **once**. Store it somewhere safe; if it's
lost, revoke the key and make a new one.

## Running it

Actions → **iOS build** → Run workflow.

- Leave `upload_to_testflight` **off** for a dry run. You get a signed `.ipa` as a
  build artifact, downloadable from the run page, and nothing is published.
- Turn it **on** to push the build to TestFlight. It appears under TestFlight in
  App Store Connect after Apple finishes processing (usually 5–15 minutes), and
  you install it on the iPhone through the TestFlight app.

It is manual-only on purpose: macOS runner minutes bill at **10× the Linux rate**,
so a push trigger would be expensive. A full run is roughly 10–15 minutes.

## Notes

- The build number comes from `github.run_number`, overriding the `1` hardcoded in
  the project. TestFlight rejects a build number it has already accepted, so this
  has to increment on every upload.
- `npm run sync` regenerates `mobile/www` from the PWA at the repo root and copies
  it into the native project. Skipping it would ship a stale copy of the web app.
- Signing uses `-allowProvisioningUpdates`, so Xcode creates and downloads the
  certificate and profile itself. There are no `.p12` or `.mobileprovision` blobs
  to store.
- The first TestFlight upload for a bundle ID needs an app record to already exist
  in App Store Connect. Create it once, matching `com.mahalaxmi.garagesaathi`.
- Team ID `6MBZV2AKF7` is committed in the project and passed explicitly. It's an
  identifier, not a credential.
