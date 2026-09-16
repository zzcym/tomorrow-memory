package com.tomorrow.agenda;

import android.appwidget.AppWidgetProvider;

/** 小组件 4×4:今日日程 8 条 */
public class WidgetLarge extends AppWidgetProvider {
    @Override
    public void onUpdate(android.content.Context context, android.appwidget.AppWidgetManager mgr, int[] ids) {
        WidgetUpdater.updateAll(context);
    }
}
