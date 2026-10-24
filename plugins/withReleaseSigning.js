/**
 * Signs Android release builds with the PurpleBox upload key instead of the
 * debug keystore the Expo template ships with.
 *
 * android/ is generated (CNG, gitignored), so the signing block can't be
 * edited by hand — it has to be re-applied on every `expo prebuild`. The
 * key itself never enters the repo. Gradle reads it at build time from,
 * in order:
 *   1. PB_UPLOAD_STORE_FILE / PB_UPLOAD_STORE_PASSWORD / PB_UPLOAD_KEY_ALIAS /
 *      PB_UPLOAD_KEY_PASSWORD env vars (CI), or
 *   2. credentials.json in the project root — the same file EAS uses for
 *      `credentialsSource: "local"`, so local Gradle builds and EAS builds
 *      sign with one key.
 * With neither present, release falls back to the debug key and says so;
 * such a build installs fine but Google Play will reject it.
 */
const { withAppBuildGradle } = require('expo/config-plugins')

const MARKER = '// @generated purplebox-release-signing'

const SIGNING_LOADER = `${MARKER}
def pbSigning = null
if (System.getenv('PB_UPLOAD_STORE_FILE')) {
    pbSigning = [
        storeFile    : System.getenv('PB_UPLOAD_STORE_FILE'),
        storePassword: System.getenv('PB_UPLOAD_STORE_PASSWORD'),
        keyAlias     : System.getenv('PB_UPLOAD_KEY_ALIAS'),
        keyPassword  : System.getenv('PB_UPLOAD_KEY_PASSWORD'),
    ]
} else {
    def pbCredentialsFile = new File(projectRoot, 'credentials.json')
    if (pbCredentialsFile.exists()) {
        def ks = new groovy.json.JsonSlurper().parse(pbCredentialsFile)?.android?.keystore
        if (ks) {
            pbSigning = [
                storeFile    : new File(projectRoot, ks.keystorePath).absolutePath,
                storePassword: ks.keystorePassword,
                keyAlias     : ks.keyAlias,
                keyPassword  : ks.keyPassword,
            ]
        }
    }
}
if (pbSigning == null) {
    logger.warn('PurpleBox: no upload key found (credentials.json or PB_UPLOAD_* env) — release will be signed with the DEBUG key and cannot go to Google Play.')
}
`

const RELEASE_SIGNING_CONFIG = `
        release {
            if (pbSigning) {
                storeFile file(pbSigning.storeFile)
                storePassword pbSigning.storePassword
                keyAlias pbSigning.keyAlias
                keyPassword pbSigning.keyPassword
            }
        }`

function applySigning(gradle) {
  if (gradle.includes(MARKER)) return gradle

  let out = gradle.replace(/\nandroid \{/, `\n${SIGNING_LOADER}\nandroid {`)

  // Add a `release` entry right after the template's `debug` signing config.
  out = out.replace(
    /(signingConfigs \{\s*debug \{[^}]*\})/,
    `$1${RELEASE_SIGNING_CONFIG}`,
  )

  // The template's release buildType points at signingConfigs.debug.
  out = out.replace(
    /(release \{\s*(?:\/\/[^\n]*\n\s*)*)signingConfig signingConfigs\.debug/,
    '$1signingConfig pbSigning ? signingConfigs.release : signingConfigs.debug',
  )

  if (!out.includes('signingConfig pbSigning ?') || !out.includes(RELEASE_SIGNING_CONFIG)) {
    throw new Error('withReleaseSigning: android/app/build.gradle no longer matches the expected Expo template')
  }
  return out
}

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (mod) => {
    mod.modResults.contents = applySigning(mod.modResults.contents)
    return mod
  })
}
