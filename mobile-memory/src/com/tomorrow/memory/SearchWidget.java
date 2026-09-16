package com.tomorrow.memory;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;

/** 桌面小组件:一个搜索框样式,点按拉起 App 并聚焦搜索输入框 */
public class SearchWidget extends AppWidgetProvider {

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        RemoteViews rv = new RemoteViews(ctx.getPackageName(), R.layout.widget_search);
        Intent in = new Intent(ctx, MainActivity.class);
        in.putExtra("focus", "search");
        in.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        rv.setOnClickPendingIntent(R.id.wRoot, PendingIntent.getActivity(
                ctx, 1001, in,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        mgr.updateAppWidget(ids, rv);
    }

    /** 桌面添加时立即渲染一次 */
    @Override
    public void onEnabled(Context ctx) {
        int[] ids = AppWidgetManager.getInstance(ctx)
                .getAppWidgetIds(new ComponentName(ctx, SearchWidget.class));
        if (ids.length > 0) onUpdate(ctx, AppWidgetManager.getInstance(ctx), ids);
    }
}
