package ae.purplebox.talkwidget

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Lets the app offer the widget itself: Android 8+ launchers can be asked to
 * pin it to the home screen (the person still confirms in the launcher's own
 * dialog). Elsewhere it is added the usual way, from the widgets list.
 */
class TalkWidgetModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("TalkWidget")

    Function("canPin") {
      val context = appContext.reactContext ?: return@Function false
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
        AppWidgetManager.getInstance(context).isRequestPinAppWidgetSupported
    }

    Function("pin") {
      val context = appContext.reactContext ?: return@Function false
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return@Function false
      val manager = AppWidgetManager.getInstance(context)
      if (!manager.isRequestPinAppWidgetSupported) return@Function false
      manager.requestPinAppWidget(ComponentName(context, TalkWidgetProvider::class.java), null, null)
    }
  }
}
