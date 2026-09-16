package com.tomorrow.agenda;

import android.appwidget.AppWidgetProvider;

/** 小组件 4×2:今日日程 3 条 */
public class WidgetMedium extends AppWidgetProvider {
    @Override
    public void onUpdate(android.content.Context context, android.appwidget.AppWidgetManager mgr, int[] ids) {
        WidgetUpdater.updateAll(context);
    }
}
