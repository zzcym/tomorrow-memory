package com.tomorrow.agenda;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Calendar;

/** 事件 → 具体日期发生(occurrence)的展开;与 assets/core.js 保持同一套规则 */
public final class Occ {
    private Occ() {}

    public static String dayStr(Calendar c) {
        return String.format("%04d-%02d-%02d", c.get(Calendar.YEAR),
                c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH));
    }

    public static String addDays(String day, int n) {
        Calendar c = Calendar.getInstance();
        String[] p = day.split("-");
        c.clear();
        c.set(Integer.parseInt(p[0]), Integer.parseInt(p[1]) - 1, Integer.parseInt(p[2]), 12, 0, 0);
        c.add(Calendar.DAY_OF_MONTH, n);
        return dayStr(c);
    }

    /** 1=周一 … 7=周日 */
    public static int dowOf(String day) {
        Calendar c = Calendar.getInstance();
        String[] p = day.split("-");
        c.clear();
        c.set(Integer.parseInt(p[0]), Integer.parseInt(p[1]) - 1, Integer.parseInt(p[2]), 12, 0, 0);
        int w = c.get(Calendar.DAY_OF_WEEK);
        return w == Calendar.SUNDAY ? 7 : w - 1;
    }

    public static String mondayOf(String day) {
        return addDays(day, 1 - dowOf(day));
    }

    private static final String DT_RE = "^\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}$";

    private static String normHm(String s) {
        if (s == null) return "00:00";
        java.util.regex.Matcher m = java.util.regex.Pattern
                .compile("^(\\d{1,2}):(\\d{2})").matcher(s.trim());
        if (!m.find()) return "00:00";
        return String.format("%02d:%02d",
                Math.min(23, Integer.parseInt(m.group(1))), Math.min(59, Integer.parseInt(m.group(2))));
    }

    /** 展开 [fromDay, toDay] 内的所有发生;返回字段:eventId/day/start/end/allDay/title/location/notes/remindMinutes */
    public static JSONArray expand(JSONArray events, String fromDay, String toDay) {
        JSONArray out = new JSONArray();
        if (events == null) return out;
        for (int i = 0; i < events.length(); i++) {
            JSONObject e = events.optJSONObject(i);
            if (e == null) continue;
            JSONObject r = e.optJSONObject("recur");
            if (r == null || !"weekly".equals(r.optString("freq"))) {
                String start = e.optString("start", "");
                if (!start.matches(DT_RE) && !start.matches("^\\d{4}-\\d{2}-\\d{2}.*")) continue;
                String day = start.substring(0, 10);
                if (day.compareTo(fromDay) >= 0 && day.compareTo(toDay) <= 0) {
                    out.put(occ(e, day, 0));
                }
                // 跨天事件:为后续每一天生成全天延续(与 core.js 同规则;恰在 00:00 结束=占满前一天)
                String end = e.optString("end", "");
                if (end.matches(DT_RE)) {
                    String endDay = end.substring(0, 10);
                    if (endDay.compareTo(day) > 0) {
                        String last = end.endsWith(" 00:00") ? Occ.addDays(endDay, -1) : endDay;
                        for (String d = Occ.addDays(day, 1); d.compareTo(last) <= 0; d = Occ.addDays(d, 1)) {
                            if (d.compareTo(fromDay) < 0 || d.compareTo(toDay) > 0) continue;
                            out.put(contOcc(e, d));
                        }
                    }
                }
                continue;
            }
            String semStart = r.optString("semesterStart", "");
            if (!semStart.matches("^\\d{4}-\\d{2}-\\d{2}$")) semStart = mondayOf(dayStr(Calendar.getInstance()));
            JSONArray wkArr = r.optJSONArray("weeks");
            int w1 = 1, w2 = 25;
            if (wkArr != null && wkArr.length() >= 2) {
                w1 = Math.max(1, wkArr.optInt(0, 1));
                w2 = Math.min(40, wkArr.optInt(1, 25));
            }
            String parity = r.optString("parity", "all");
            int weekday = r.optInt("weekday", 1);
            JSONArray exW = r.optJSONArray("exWeeks");
            java.util.HashSet<Integer> exSet = new java.util.HashSet<>();
            if (exW != null) for (int x = 0; x < exW.length(); x++) exSet.add(exW.optInt(x));
            for (int wk = w1; wk <= w2; wk++) {
                if ("odd".equals(parity) && wk % 2 == 0) continue;
                if ("even".equals(parity) && wk % 2 == 1) continue;
                if (exSet.contains(wk)) continue; // 停课周(ics EXDATE)
                String day = addDays(semStart, (wk - 1) * 7 + (weekday - 1));
                if (day.compareTo(fromDay) < 0 || day.compareTo(toDay) > 0) continue;
                out.put(occ(e, day, wk));
            }
        }
        // 排序:全天在前,其余按开始时间
        JSONArray sorted = new JSONArray();
        java.util.TreeMap<String, JSONObject> map = new java.util.TreeMap<>();
        for (int i = 0; i < out.length(); i++) {
            JSONObject o = out.optJSONObject(i);
            if (o == null) continue;
            String key = (o.optBoolean("allDay") ? "0" : "1") + o.optString("start") + o.optString("eventId") + i;
            map.put(key, o);
        }
        for (JSONObject o : map.values()) sorted.put(o);
        return sorted;
    }

    private static JSONObject contOcc(JSONObject e, String day) {
        JSONObject o = new JSONObject();
        try {
            o.put("eventId", e.optString("id"));
            o.put("day", day);
            o.put("weekNo", 0);
            o.put("cont", true);
            o.put("start", day + " 00:00");
            o.put("allDay", true);
            o.put("title", e.optString("title"));
            o.put("location", e.optString("location", ""));
            o.put("notes", e.optString("notes", ""));
        } catch (Exception ignored) {
        }
        return o;
    }

    private static JSONObject occ(JSONObject e, String day, int weekNo) {
        JSONObject r = e.optJSONObject("recur");
        JSONObject o = new JSONObject();
        try {
            o.put("eventId", e.optString("id"));
            o.put("day", day);
            o.put("weekNo", weekNo);
            if (r != null && "weekly".equals(r.optString("freq"))) {
                o.put("start", day + " " + normHm(r.optString("start")));
                if (!r.optString("end", "").isEmpty()) o.put("end", day + " " + normHm(r.optString("end")));
                o.put("allDay", false);
            } else {
                String start = e.optString("start", "");
                o.put("start", start);
                if (e.optString("end", "").matches(DT_RE)) o.put("end", e.optString("end"));
                o.put("allDay", e.optBoolean("allDay") || !start.matches(DT_RE));
            }
            o.put("title", e.optString("title"));
            o.put("location", e.optString("location", ""));
            o.put("notes", e.optString("notes", ""));
            if (e.has("remindMinutes") && !e.isNull("remindMinutes")) {
                o.put("remindMinutes", e.optInt("remindMinutes"));
            }
        } catch (Exception ignored) {
        }
        return o;
    }
}
