// Store builds (eas.json `production`, STORE_BUILD=1) ship without call-log
// sync: Google Play restricts READ_CALL_LOG, so the permission is stripped
// from the merged manifest (the call-log module declares it too) and the app
// is told not to use the feature. Sideloaded APKs keep it.
const STORE_BUILD = process.env.STORE_BUILD === '1'
const CALL_LOG = 'android.permission.READ_CALL_LOG'

module.exports = ({ config }) => {
  if (!STORE_BUILD) return { ...config, extra: { ...config.extra, callSync: true } }
  return {
    ...config,
    android: {
      ...config.android,
      permissions: config.android.permissions.filter((p) => p !== CALL_LOG),
      blockedPermissions: [...(config.android.blockedPermissions ?? []), CALL_LOG],
    },
    extra: { ...config.extra, callSync: false },
  }
}
