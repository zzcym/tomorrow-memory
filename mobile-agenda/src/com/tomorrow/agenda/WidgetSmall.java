package com.tomorrow.agenda;

import android.appwidget.AppWidgetProvider;

/** 小组件 2×2:日期 + 下一条日程 */
public class WidgetSmall extends AppWidgetProvider {
    @Override
    public void onUpdate(android.content.Context context, android.appwidget.AppWidgetManager mgr, int[] ids) {
        WidgetUpdater.updateAll(context);
    }
}
