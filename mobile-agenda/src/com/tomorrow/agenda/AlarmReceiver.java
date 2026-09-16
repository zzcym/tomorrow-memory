package com.tomorrow.agenda;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Locale;

/** 闹钟触发:单次日程提醒 / 每日晚间汇总 / 午夜小组件刷新 */
public class AlarmReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context ctx, Intent intent) {
        ensureChannels(ctx);
        String kind = intent.getStringExtra("kind");
        boolean test = intent.getBooleanExtra("test", false);
        if ("digest".equals(kind)) {
            handleDigest(ctx, test);
        } else if ("widget".equals(kind)) {
            WidgetUpdater.updateAll(ctx);
            AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
            if (am != null) Scheduler.scheduleMidnightWidget(ctx, am);
        } else {
            handleReminder(ctx, intent.getStringExtra("eventId"), intent.getStringExtra("occStart"));
        }
    }

    private void handleReminder(Context ctx, String eventId, String occStart) {
        JSONArray evs = Store.events(ctx);
        for (int i = 0; i < evs.length(); i++) {
            JSONObject e = evs.optJSONObject(i);
            if (e == null || !eventId.equals(e.optString("id"))) continue;
            String start = occStart == null || occStart.isEmpty() ? e.optString("start") : occStart;
            // 已提醒判断(remindedMap 按发生时间;兼容旧 remindedAt)
            JSONObject map = e.optJSONObject("remindedMap");
            if (map != null && map.optLong(start, 0) > 0) return;
            if (map == null && e.optLong("remindedAt", 0) > 0
                    && !e.has("recur") && e.optString("start").equals(start)) return;

            notify(ctx, Scheduler.CHANNEL_REMIND, "⏰ 日程提醒:" + e.optString("title"),
                    reminderBody(e, start, Store.leadMinutes(ctx)), 0,
                    start.length() >= 10 ? start.substring(0, 10) : null,
                    ("open" + eventId + start).hashCode());
            try {
                if (map == null) map = new JSONObject();
                map.put(start, System.currentTimeMillis());
                e.put("remindedMap", map);
                Store.saveEvents(ctx, evs);
            } catch (Exception ignored) {
            }
            WidgetUpdater.updateAll(ctx); // "下一条/进行中"随提醒即时变化
            return;
        }
    }

    private void handleDigest(Context ctx, boolean test) {
        if (test) {
            notify(ctx, Scheduler.CHANNEL_DIGEST, "测试通知 ✓",
                    "提醒通道正常。正式的日程提醒和每晚汇总会准时出现在这里。", 1, null, 991);
            return; // 测试不打乱汇总排程
        }
        Calendar tomorrow = Calendar.getInstance();
        tomorrow.add(Calendar.DAY_OF_YEAR, 1);
        String day = Occ.dayStr(tomorrow);
        JSONArray occs = Occ.expand(Store.events(ctx), day, day);

        String title = "📅 明日日程 | " + (tomorrow.get(Calendar.MONTH) + 1) + "月"
                + tomorrow.get(Calendar.DAY_OF_MONTH) + "日 周"
                + weekdayCN(tomorrow.get(Calendar.DAY_OF_WEEK));
        StringBuilder body = new StringBuilder();
        if (occs.length() == 0) {
            body.append("明天暂无日程安排,好好休息");
        } else {
            body.append("共 ").append(occs.length()).append(" 项\n");
            for (int i = 0; i < occs.length(); i++) {
                JSONObject o = occs.optJSONObject(i);
                if (o == null) continue;
                if (o.optBoolean("allDay")) {
                    body.append("📌 全天 · ").append(o.optString("title"));
                } else {
                    String start = o.optString("start", "");
                    body.append("🕘 ").append(start.length() >= 16 ? start.substring(11) : start);
                    body.append(" ").append(o.optString("title"));
                }
                if (!o.optString("location", "").isEmpty()) body.append(" · ").append(o.optString("location"));
                body.append('\n');
            }
        }
        notify(ctx, Scheduler.CHANNEL_DIGEST, title, body.toString(), 1, null, 99);
        // 排下一天的汇总
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am != null) Scheduler.scheduleNextDigest(ctx, am);
    }

    private static String reminderBody(JSONObject e, String occStart, int defaultLead) {
        StringBuilder b = new StringBuilder();
        int lead = e.has("remindMinutes") && !e.isNull("remindMinutes")
                ? e.optInt("remindMinutes", defaultLead) : defaultLead;
        b.append(lead > 0 ? lead + " 分钟后开始" : "现在开始");
        String start = occStart != null && occStart.length() >= 16 ? occStart : e.optString("start", "");
        if (start.length() >= 16) b.append("\n时间 ").append(start.substring(11));
        String end = e.optString("end", "");
        if (end.length() >= 16) b.append(" - ").append(end.substring(11));
        if (!e.optString("location", "").isEmpty()) b.append("\n📍 ").append(e.optString("location"));
        if (!e.optString("notes", "").isEmpty()) b.append("\n📝 ").append(e.optString("notes"));
        return b.toString();
    }

    static String weekdayCN(int dayOfWeek) {
        switch (dayOfWeek) {
            case Calendar.MONDAY: return "一";
            case Calendar.TUESDAY: return "二";
            case Calendar.WEDNESDAY: return "三";
            case Calendar.THURSDAY: return "四";
            case Calendar.FRIDAY: return "五";
            case Calendar.SATURDAY: return "六";
            default: return "日";
        }
    }

    static void ensureChannels(Context ctx) {
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null || Build.VERSION.SDK_INT < 26) return;
        nm.createNotificationChannel(new NotificationChannel(Scheduler.CHANNEL_REMIND,
                "日程提醒", NotificationManager.IMPORTANCE_HIGH));
        nm.createNotificationChannel(new NotificationChannel(Scheduler.CHANNEL_DIGEST,
                "每日汇总", NotificationManager.IMPORTANCE_DEFAULT));
    }

    /** 发通知(kind 0=提醒,1=汇总;openRc 区分 PendingIntent,避免 extras 相互覆盖;openDay 深链到具体某天) */
    private void notify(Context ctx, String channel, String title, String body, int kind, String openDay, int openRc) {
        Intent open = new Intent(ctx, MainActivity.class);
        if (openDay != null) open.putExtra("openDay", openDay);
        PendingIntent pi = PendingIntent.getActivity(ctx, openRc, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b = new Notification.Builder(ctx, channel)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(title)
                .setContentText(body.length() > 80 ? body.substring(0, 80) + "…" : body)
                .setAutoCancel(true)
                .setContentIntent(pi);
        if (kind == 1) {
            b.setStyle(new Notification.BigTextStyle().bigText(body));
        }
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.notify((int) System.currentTimeMillis() % 1_000_000, b.build());
    }
}
