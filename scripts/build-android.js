#!/usr/bin/env node
/**
 * Local production build for Android, no EAS account needed.
 *
 *   npm run android:apk   -> dist/android/PurpleBox-<version>-<code>.apk  (sideload / direct install)
 *   npm run android:aab   -> dist/android/PurpleBox-<version>-<code>.aab  (upload to Google Play)
 *
 * Needs JDK 17+ and the Android SDK (ANDROID_HOME) with the NDK the
 * generated project asks for — Android Studio installs both. Signing comes
 * from credentials.json (see plugins/withReleaseSigning.js).
 */
const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const kind = process.argv[2] === 'aab' ? 'aab' : 'apk'
const run = (cmd, cwd = root) => execSync(cmd, { cwd, stdio: 'inherit', env: process.env })

if (!fs.existsSync(path.join(root, 'credentials.json')) && !process.env.PB_UPLOAD_STORE_FILE) {
  console.error('credentials.json not found — a release build would be signed with the debug key. Aborting.')
  process.exit(1)
}

const { expo } = require(path.join(root, 'app.json'))
const version = expo.version
const versionCode = expo.android.versionCode

run('npx expo prebuild --platform android --clean --no-install')

const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew'
const task = kind === 'aab' ? 'bundleRelease' : 'assembleRelease'
run(`${gradlew} ${task} --no-daemon`, path.join(root, 'android'))

const built = kind === 'aab'
  ? path.join(root, 'android/app/build/outputs/bundle/release/app-release.aab')
  : path.join(root, 'android/app/build/outputs/apk/release/app-release.apk')
const outDir = path.join(root, 'dist/android')
fs.mkdirSync(outDir, { recursive: true })
const out = path.join(outDir, `PurpleBox-${version}-${versionCode}.${kind}`)
fs.copyFileSync(built, out)
console.log(`\n✔ ${path.relative(root, out)}`)
