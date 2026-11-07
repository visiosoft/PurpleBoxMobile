package ae.purplebox.talkwidget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews

/**
 * The PurpleBox AI widget on the home screen. Nothing runs in it: each part is
 * a link into the app's AI page — Talk starts a spoken conversation at once
 * (purplebox://ai?talk=1), Type opens it with the cursor in the box
 * (purplebox://ai?type=1). Answers, details and PDFs then come up in the app.
 */
class TalkWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    for (id in ids) manager.updateAppWidget(id, views(context))
  }

  companion object {
    fun views(context: Context): RemoteViews {
      val v = RemoteViews(context.packageName, R.layout.talk_widget)
      v.setOnClickPendingIntent(R.id.talk_widget_talk, open(context, "purplebox://ai?talk=1", 1))
      v.setOnClickPendingIntent(R.id.talk_widget_type, open(context, "purplebox://ai?type=1", 2))
      v.setOnClickPendingIntent(R.id.talk_widget_root, open(context, "purplebox://ai", 3))
      return v
    }

    private fun open(context: Context, uri: String, code: Int): PendingIntent {
      val intent = Intent(Intent.ACTION_VIEW, Uri.parse(uri))
        .setPackage(context.packageName)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      return PendingIntent.getActivity(context, code, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }
  }
}
