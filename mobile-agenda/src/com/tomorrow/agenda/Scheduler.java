package com.tomorrow.agenda;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Calendar;

/** 精确闹钟调度:未来事件的"开始前 N 分钟"提醒 + 每日晚间汇总 + 午夜小组件刷新 */
public final class Scheduler {
    private Scheduler() {}

    static final int DIGEST_RC = 42001;
    static final int WIDGET_RC = 42002;
    static final String CHANNEL_REMIND = "remind";
    static final String CHANNEL_DIGEST = "digest";

    private static final int HORIZON_DAYS = 60;

    /** 全量重排:取消旧的 → 注册未来发生提醒 + 晚间汇总 + 午夜小组件刷新 */
    public static void scheduleAll(Context ctx) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;

        // 取消上一轮注册的闹钟
        JSONArray prev = Store.scheduledIds(ctx);
        for (int i = 0; i < prev.length(); i++) {
            String key = prev.optString(i, "");
            if (!key.isEmpty()) {
                String[] parts = key.split("#", 2);
                am.cancel(pi(ctx, parts[0], parts.length > 1 ? parts[1] : ""));
            }
        }

        String today = Occ.dayStr(Calendar.getInstance());
        JSONArray evs = Store.events(ctx);
        // 事件 id → 提醒标记索引,避免每个发生都重读全量 JSON
        java.util.HashMap<String, JSONObject> byId = new java.util.HashMap<>();
        for (int i = 0; i < evs.length(); i++) {
            JSONObject e = evs.optJSONObject(i);
            if (e != null) byId.put(e.optString("id"), e);
        }
        JSONArray occs = Occ.expand(evs,
                Occ.addDays(today, -1), Occ.addDays(today, HORIZON_DAYS));
        long now = System.currentTimeMillis();
        int defaultLead = Store.leadMinutes(ctx);

        JSONArray nowKeys = new JSONArray();
        for (int i = 0; i < occs.length(); i++) {
            JSONObject o = occs.optJSONObject(i);
            if (o == null || o.optBoolean("allDay")) continue;   // 全天事件只进晚间汇总
            String eventId = o.optString("eventId");
            String occStart = o.optString("start");
            JSONObject ev = byId.get(eventId);
            if (ev == null || isReminded(ev, occStart)) continue; // 该次已提醒过
            long start = Scheduler.parseLocal(occStart);
            if (start <= 0) continue;
            int lead = o.has("remindMinutes") ? o.optInt("remindMinutes", defaultLead) : defaultLead;
            if (lead < 0) continue;                              // 单条关闭提醒
            long trigger = start - lead * 60_000L;
            if (trigger <= now) continue;
            setExact(am, trigger, pi(ctx, eventId, occStart));
            nowKeys.put(eventId + "#" + occStart);
        }
        Store.saveScheduledIds(ctx, nowKeys);
        scheduleNextDigest(ctx, am);
        scheduleMidnightWidget(ctx, am);
        WidgetUpdater.updateAll(ctx);
    }

    /** 该次发生是否已提醒过(remindedMap 按发生时间记;兼容旧 remindedAt) */
    private static boolean isReminded(JSONObject e, String occStart) {
        JSONObject map = e.optJSONObject("remindedMap");
        if (map != null && map.optLong(occStart, 0) > 0) return true;
        return map == null && e.optLong("remindedAt", 0) > 0
                && !e.has("recur") && e.optString("start").equals(occStart);
    }

    /** 注册下一次晚间汇总(digestTime;若今天已过则排明天) */
    public static void scheduleNextDigest(Context ctx, AlarmManager am) {
        am.cancel(piDigest(ctx));
        if (!Store.digestEnabled(ctx)) return;
        String[] hm = Store.digestTime(ctx).split(":");
        Calendar cal = Calendar.getInstance();
        cal.set(Calendar.SECOND, 0);
        cal.set(Calendar.MILLISECOND, 0);
        cal.set(Calendar.HOUR_OF_DAY, Integer.parseInt(hm[0]));
        cal.set(Calendar.MINUTE, Integer.parseInt(hm[1]));
        if (cal.getTimeInMillis() <= System.currentTimeMillis()) {
            cal.add(Calendar.DAY_OF_YEAR, 1);
        }
        setExact(am, cal.getTimeInMillis(), piDigest(ctx));
    }

    /** 每天 00:05 刷新小组件(跨天后"今日日程"要重算) */
    public static void scheduleMidnightWidget(Context ctx, AlarmManager am) {
        am.cancel(piWidget(ctx));
        Calendar cal = Calendar.getInstance();
        cal.set(Calendar.HOUR_OF_DAY, 0);
        cal.set(Calendar.MINUTE, 5);
        cal.set(Calendar.SECOND, 0);
        cal.set(Calendar.MILLISECOND, 0);
        if (cal.getTimeInMillis() <= System.currentTimeMillis()) {
            cal.add(Calendar.DAY_OF_YEAR, 1);
        }
        setExact(am, cal.getTimeInMillis(), piWidget(ctx));
    }

    private static PendingIntent pi(Context c, String eventId, String occStart) {
        Intent in = new Intent(c, AlarmReceiver.class);
        in.putExtra("eventId", eventId);
        if (occStart != null && !occStart.isEmpty()) in.putExtra("occStart", occStart);
        int rc = ("r" + eventId + "#" + occStart).hashCode();
        return PendingIntent.getBroadcast(c, rc, in,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static PendingIntent piDigest(Context c) {
        Intent in = new Intent(c, AlarmReceiver.class);
        in.putExtra("kind", "digest");
        return PendingIntent.getBroadcast(c, DIGEST_RC, in,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static PendingIntent piWidget(Context c) {
        Intent in = new Intent(c, AlarmReceiver.class);
        in.putExtra("kind", "widget");
        return PendingIntent.getBroadcast(c, WIDGET_RC, in,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static void setExact(AlarmManager am, long triggerAt, PendingIntent p) {
        if (Build.VERSION.SDK_INT >= 31 && !am.canScheduleExactAlarms()) {
            // 未授权精确闹钟:退化为非精确(可能延迟几分钟),应用内会提示授权
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, p);
        } else {
            am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, p);
        }
    }

    /** "YYYY-MM-DD HH:mm" → epoch ms(失败返回 -1) */
    public static long parseLocal(String s) {
        try {
            String[] dt = s.trim().split(" ");
            String[] d = dt[0].split("-");
            String[] t = dt.length > 1 ? dt[1].split(":") : new String[]{"0", "0"};
            Calendar cal = Calendar.getInstance();
            cal.clear();
            cal.set(Integer.parseInt(d[0]), Integer.parseInt(d[1]) - 1, Integer.parseInt(d[2]),
                    Integer.parseInt(t[0]), Integer.parseInt(t[1]), 0);
            return cal.getTimeInMillis();
        } catch (Exception e) {
            return -1;
        }
    }
}
