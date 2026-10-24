package ae.purplebox.calllog

import android.Manifest
import android.content.pm.PackageManager
import android.provider.CallLog
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The phone's own call log, read straight from Android's CallLog provider.
 * Only calls after `sinceMs` come back, oldest first, so the sync can
 * remember where it got to. Nothing is filtered here — the CRM keeps the
 * calls to leads and customers and drops the rest.
 */
class CallLogModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("CallLog")

    AsyncFunction("hasPermission") {
      val context = appContext.reactContext ?: return@AsyncFunction false
      ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CALL_LOG) == PackageManager.PERMISSION_GRANTED
    }

    AsyncFunction("readSince") { sinceMs: Double, limit: Int ->
      val context = appContext.reactContext ?: return@AsyncFunction emptyList<Map<String, Any?>>()
      if (ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CALL_LOG) != PackageManager.PERMISSION_GRANTED) {
        return@AsyncFunction emptyList<Map<String, Any?>>()
      }
      val calls = mutableListOf<Map<String, Any?>>()
      context.contentResolver.query(
        CallLog.Calls.CONTENT_URI,
        arrayOf(CallLog.Calls._ID, CallLog.Calls.NUMBER, CallLog.Calls.TYPE, CallLog.Calls.DATE, CallLog.Calls.DURATION),
        "${CallLog.Calls.DATE} > ?",
        arrayOf(sinceMs.toLong().toString()),
        "${CallLog.Calls.DATE} ASC"
      )?.use { c ->
        while (c.moveToNext() && calls.size < limit) {
          val type = when (c.getInt(2)) {
            CallLog.Calls.OUTGOING_TYPE -> "outgoing"
            CallLog.Calls.INCOMING_TYPE -> "incoming"
            CallLog.Calls.MISSED_TYPE -> "missed"
            CallLog.Calls.REJECTED_TYPE, CallLog.Calls.BLOCKED_TYPE -> "rejected"
            else -> null
          } ?: continue
          calls.add(mapOf(
            "id" to c.getLong(0).toString(),
            "number" to (c.getString(1) ?: ""),
            "type" to type,
            "timestamp" to c.getLong(3).toDouble(),
            "duration" to c.getLong(4).toInt()
          ))
        }
      }
      calls
    }
  }
}
