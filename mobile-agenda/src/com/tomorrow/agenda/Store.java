package com.tomorrow.agenda;

import android.content.Context;
import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;

/** 事件与设置的本地 JSON 持久化(原子写入) */
public final class Store {
    private Store() {}

    private static File file(Context c, String name) {
        return new File(c.getFilesDir(), name);
    }

    private static String read(File f) {
        try (FileInputStream in = new FileInputStream(f)) {
            byte[] buf = new byte[(int) f.length()];
            int n = in.read(buf);
            return new String(buf, 0, Math.max(0, n), StandardCharsets.UTF_8);
        } catch (Exception e) {
            return "";
        }
    }

    private static void write(File f, String content) {
        try {
            File tmp = new File(f.getParentFile(), f.getName() + ".tmp");
            try (FileOutputStream out = new FileOutputStream(tmp)) {
                out.write(content.getBytes(StandardCharsets.UTF_8));
            }
            if (!tmp.renameTo(f)) {
                FileOutputStream out = new FileOutputStream(f);
                out.write(content.getBytes(StandardCharsets.UTF_8));
                out.close();
                tmp.delete();
            }
        } catch (Exception ignored) {
        }
    }

    public static synchronized JSONArray events(Context c) {
        try {
            return new JSONArray(read(file(c, "events.json")));
        } catch (Exception e) {
            return new JSONArray();
        }
    }

    public static synchronized void saveEvents(Context c, JSONArray arr) {
        write(file(c, "events.json"), arr.toString());
    }

    /** 设置(缺失字段由调用方给默认值) */
    public static synchronized JSONObject settings(Context c) {
        try {
            return new JSONObject(read(file(c, "settings.json")));
        } catch (Exception e) {
            return new JSONObject();
        }
    }

    public static synchronized void saveSettings(Context c, JSONObject obj) {
        write(file(c, "settings.json"), obj.toString());
    }

    /** 已注册闹钟的事件 id 列表(用于重排前取消) */
    public static synchronized JSONArray scheduledIds(Context c) {
        try {
            return new JSONObject(read(file(c, "meta.json"))).optJSONArray("scheduledIds") == null
                    ? new JSONArray()
                    : new JSONObject(read(file(c, "meta.json"))).getJSONArray("scheduledIds");
        } catch (Exception e) {
            return new JSONArray();
        }
    }

    public static synchronized void saveScheduledIds(Context c, JSONArray ids) {
        try {
            JSONObject meta = new JSONObject();
            meta.put("scheduledIds", ids);
            write(file(c, "meta.json"), meta.toString());
        } catch (Exception ignored) {
        }
    }

    /** 提前提醒分钟(全局默认 60) */
    public static int leadMinutes(Context c) {
        JSONObject r = settings(c).optJSONObject("reminder");
        int v = r == null ? 60 : r.optInt("defaultLeadMinutes", 60);
        return v > 0 ? v : 60;
    }

    public static String digestTime(Context c) {
        JSONObject r = settings(c).optJSONObject("reminder");
        String t = r == null ? "21:30" : r.optString("digestTime", "21:30");
        return t.matches("\\d{2}:\\d{2}") ? t : "21:30";
    }

    public static boolean digestEnabled(Context c) {
        JSONObject r = settings(c).optJSONObject("reminder");
        return r == null || r.optBoolean("digestEnabled", true);
    }
}
