package com.tomorrow.agenda;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Locale;

/** 生成并推送 3 种尺寸的小组件内容(今日日程) */
public final class WidgetUpdater {
    private WidgetUpdater() {}

    private static final int ROWS_MEDIUM = 3;
    private static final int ROWS_LARGE = 8;

    public static void updateAll(Context ctx) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        if (mgr == null) return;
        push(ctx, mgr, new ComponentName(ctx, WidgetSmall.class), R.layout.widget_small, 0);
        push(ctx, mgr, new ComponentName(ctx, WidgetMedium.class), R.layout.widget_medium, ROWS_MEDIUM);
        push(ctx, mgr, new ComponentName(ctx, WidgetLarge.class), R.layout.widget_large, ROWS_LARGE);
    }

    private static void push(Context ctx, AppWidgetManager mgr, ComponentName cn, int layoutId, int maxRows) {
        int[] ids = mgr.getAppWidgetIds(cn);
        if (ids == null || ids.length == 0) return;
        RemoteViews rv = build(ctx, layoutId, maxRows);
        for (int id : ids) mgr.updateAppWidget(id, rv);
    }

    /** 事件结束时刻;全天视为永不结束,缺 end 的视为开始后 1 小时 */
    private static long endTimeOf(JSONObject o) {
        if (o.optBoolean("allDay")) return Long.MAX_VALUE;
        String end = o.optString("end", "");
        if (!end.isEmpty()) return Scheduler.parseLocal(end);
        return Scheduler.parseLocal(o.optString("start")) + 3600_000L;
    }

    private static RemoteViews build(Context ctx, int layoutId, int maxRows) {
        Calendar cal = Calendar.getInstance();
        String today = Occ.dayStr(cal);
        String dateLabel = new SimpleDateFormat("M月d日 周", Locale.CHINA).format(cal.getTime())
                + AlarmReceiver.weekdayCN(cal.get(Calendar.DAY_OF_WEEK));

        JSONArray occs = Occ.expand(Store.events(ctx), today, today);
        long now = System.currentTimeMillis();
        // 找到"下一条"(还没结束的最近一条;全天事件永远算未结束)
        int nextIdx = -1;
        for (int i = 0; i < occs.length(); i++) {
            JSONObject o = occs.optJSONObject(i);
            if (o == null) continue;
            if (endTimeOf(o) >= now) { nextIdx = i; break; }
        }

        RemoteViews rv = new RemoteViews(ctx.getPackageName(), layoutId);
        rv.setTextViewText(R.id.wDate, dateLabel);
        rv.setTextViewText(R.id.wCount, occs.length() == 0 ? "" : "今日 " + occs.length() + " 项");

        if (maxRows == 0) {
            // 小组件:下一条事件卡片
            if (nextIdx < 0) {
                rv.setTextViewText(R.id.wNextTime, occs.length() == 0 ? "今天没有安排" : "今天日程已结束");
                rv.setTextViewText(R.id.wNextTitle, occs.length() == 0 ? "点按添加 →" : "");
                rv.setTextViewText(R.id.wNextLoc, "");
            } else {
                JSONObject o = occs.optJSONObject(nextIdx);
                String start = o.optString("start", "");
                String hm = start.length() >= 16 ? start.substring(11) : "";
                boolean running = o.optBoolean("allDay") || Scheduler.parseLocal(start) <= now;
                rv.setTextViewText(R.id.wNextTime, o.optBoolean("allDay") ? "全天" : (running ? "进行中" : hm));
                rv.setTextViewText(R.id.wNextTitle, o.optString("title"));
                rv.setTextViewText(R.id.wNextLoc, o.optString("location", ""));
            }
        } else {
            rv.removeAllViews(R.id.wRows);
            if (occs.length() == 0) {
                rv.setViewVisibility(R.id.wEmpty, android.view.View.VISIBLE);
                rv.setViewVisibility(R.id.wRows, android.view.View.GONE);
                rv.setTextViewText(R.id.wEmpty, "今天没有安排,点按添加");
            } else {
                rv.setViewVisibility(R.id.wEmpty, android.view.View.GONE);
                rv.setViewVisibility(R.id.wRows, android.view.View.VISIBLE);
                int shown = 0;
                for (int i = 0; i < occs.length() && shown < maxRows; i++) {
                    JSONObject o = occs.optJSONObject(i);
                    if (o == null) continue;
                    RemoteViews row = new RemoteViews(ctx.getPackageName(), R.layout.widget_row);
                    String start = o.optString("start", "");
                    boolean running = !o.optBoolean("allDay")
                            && Scheduler.parseLocal(start) <= now && endTimeOf(o) >= now;
                    if (o.optBoolean("allDay")) {
                        row.setTextViewText(R.id.wrTime, "全天");
                    } else {
                        String end = o.optString("end", "");
                        row.setTextViewText(R.id.wrTime, running ? "进行中"
                                : (start.length() >= 16 ? start.substring(11) : "") + (end.length() >= 16 ? "-" + end.substring(11) : ""));
                    }
                    row.setTextViewText(R.id.wrTitle, o.optString("title"));
                    String loc = o.optString("location", "");
                    row.setViewVisibility(R.id.wrLoc, loc.isEmpty() ? android.view.View.GONE : android.view.View.VISIBLE);
                    if (!loc.isEmpty()) row.setTextViewText(R.id.wrLoc, loc);
                    int color = i == nextIdx
                            ? ctx.getColor(R.color.widget_accent) : ctx.getColor(R.color.widget_text_primary);
                    row.setTextColor(R.id.wrTime, color);
                    row.setTextColor(R.id.wrTitle, color);
                    rv.addView(R.id.wRows, row);
                    shown++;
                }
                if (occs.length() > shown) {
                    RemoteViews more = new RemoteViews(ctx.getPackageName(), R.layout.widget_row);
                    more.setTextViewText(R.id.wrTime, "");
                    more.setTextViewText(R.id.wrTitle, "还有 " + (occs.length() - shown) + " 项…");
                    more.setViewVisibility(R.id.wrLoc, android.view.View.GONE);
                    rv.addView(R.id.wRows, more);
                }
            }
        }

        // 点整块 → 打开应用
        Intent open = new Intent(ctx, MainActivity.class);
        rv.setOnClickPendingIntent(R.id.wRoot, PendingIntent.getActivity(ctx, 77, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        return rv;
    }
}
