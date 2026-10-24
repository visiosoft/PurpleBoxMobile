# Android production release

## The upload key

Release builds are signed with the **PurpleBox upload key**:

| | |
|---|---|
| Keystore | `credentials/android/purplebox-upload.jks` (PKCS12, RSA 4096, valid to 2056) |
| Alias | `purplebox-upload` |
| Passwords | in `credentials.json` |
| SHA-1 | `70:31:46:D2:F5:50:8D:B2:E3:3F:01:9A:C7:34:0C:56:9E:BE:ED:5D` |
| SHA-256 | `E2:78:85:A7:B6:4B:D9:7E:19:A8:A0:34:5E:08:26:C4:34:9E:79:B1:D3:2C:7B:1C:EB:BA:A5:73:67:61:0D:7F` |

`credentials.json` and `credentials/` are gitignored and never go in the repo.
Keep a copy of both in the company password manager. With Play App Signing
(the default for new apps), Google holds the real app-signing key and this is
only the *upload* key. If it's lost, Play support can reset it, but that
takes days. Without Play (sideloaded APKs), a lost key means users must
uninstall to get updates.

`credentials.json` is the file EAS reads for `credentialsSource: "local"`. The
`plugins/withReleaseSigning.js` config plugin makes plain Gradle builds read
the same file, so EAS and local builds always sign with one key.

## Build on your machine

Prerequisites (one time): Node 22, JDK 17, and Android Studio with
**SDK Platform 36, Build-Tools 36.0.0 and NDK 27.1.12297006** (SDK Manager →
SDK Tools → "Show Package Details"). Set `ANDROID_HOME` to the SDK folder.

Put `credentials.json` and `credentials/android/purplebox-upload.jks` in the
project root, then:

```bash
npm ci
npm run android:apk   # dist/android/PurpleBox-<version>-<versionCode>.apk: install directly on phones
npm run android:aab   # dist/android/PurpleBox-<version>-<versionCode>.aab: upload this to Google Play
```

The script refuses to run without the key, so it can't produce a
debug-signed "release". To check what signed an APK:

```bash
$ANDROID_HOME/build-tools/36.0.0/apksigner verify --print-certs dist/android/*.apk
```

The SHA-256 must match the table above.

## Build with EAS instead

```bash
eas build -p android --profile production --local       # AAB on your machine
eas build -p android --profile production-apk --local   # APK on your machine
eas build -p android --profile production               # AAB on Expo's servers
```

All three use `credentials.json` (`credentialsSource: "local"` in `eas.json`).

## Build on GitHub Actions (no Android Studio needed)

`.github/workflows/android-release.yml` builds both the APK and the AAB.
Add these repository secrets once (Settings → Secrets and variables → Actions):

| Secret | Value |
|---|---|
| `PB_UPLOAD_KEYSTORE_BASE64` | output of `base64 -w0 credentials/android/purplebox-upload.jks` (macOS: `base64 -i … `) |
| `PB_UPLOAD_STORE_PASSWORD` | `keystorePassword` from `credentials.json` |
| `PB_UPLOAD_KEY_ALIAS` | `purplebox-upload` |
| `PB_UPLOAD_KEY_PASSWORD` | `keyPassword` from `credentials.json` |

Then go to Actions → **Android release build** → Run workflow, and download
`purplebox-android-release` from the run.

## Every new release

1. Bump `expo.version` (for example `1.0.1`) and `expo.android.versionCode`
   (+1, must always increase) in `app.json`.
   EAS cloud builds with `autoIncrement` manage the versionCode remotely
   instead.
2. Build the AAB, then upload it in Play Console → Test and release → Production
   (or a testing track first).

## Before the first Play upload

- **Push notifications:** Android push needs Firebase. Create a Firebase
  project for `ae.purplebox.mobile`, download `google-services.json`, add
  `"googleServicesFile": "./google-services.json"` under `expo.android` in
  `app.json`, and upload the FCM V1 service-account key to EAS
  (`eas credentials`). Until then the app works, but new-lead push
  notifications won't arrive on Android.
- Store listing, graphics, data safety, content rating and the privacy
  policy are in `store/google-play/`.
- Google Play only accepts **AAB** for new apps. The APK is for direct
  installs and testing.
- Personal (not organisation) Play developer accounts created after
  November 2023 must run a closed test with 12+ testers for 14 days before
  production. Organisation accounts are exempt. For a staff-only app,
  consider publishing privately through **Managed Google Play** instead.
