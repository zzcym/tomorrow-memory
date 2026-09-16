package com.tomorrow.agenda;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/** HTTP / 图片 / 录音上传工具(全部手写,无第三方库) */
public final class Util {
    private Util() {}

    // ===== 通用 POST(JSON body) =====
    public static String postJson(String url, String apiKey, String body) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        conn.setRequestMethod("POST");
        conn.setConnectTimeout(15000);
        conn.setReadTimeout(90000);
        conn.setRequestProperty("Content-Type", "application/json");
        if (apiKey != null && !apiKey.isEmpty()) {
            conn.setRequestProperty("Authorization", "Bearer " + apiKey);
        }
        conn.setDoOutput(true);
        try (OutputStream os = conn.getOutputStream()) {
            os.write(body.getBytes(StandardCharsets.UTF_8));
        }
        int code = conn.getResponseCode();
        String resp = readStream(code >= 400 ? conn.getErrorStream() : conn.getInputStream());
        if (code >= 400) {
            throw new Exception("API " + code + ": " + resp.substring(0, Math.min(200, resp.length())));
        }
        return resp;
    }

    private static String readStream(InputStream is) throws Exception {
        StringBuilder sb = new StringBuilder();
        try (java.io.BufferedReader r = new java.io.BufferedReader(
                new java.io.InputStreamReader(is, StandardCharsets.UTF_8))) {
            String line;
            while ((line = r.readLine()) != null) sb.append(line);
        }
        return sb.toString();
    }

    // ===== OpenAI 兼容 /chat/completions =====
    public static String chat(String baseUrl, String apiKey, String model, JSONArray messages) throws Exception {
        JSONObject body = new JSONObject();
        body.put("model", model);
        body.put("messages", messages);
        body.put("temperature", 0.2);
        String resp = postJson(trimSlash(baseUrl) + "/chat/completions", apiKey, body.toString());
        return new JSONObject(resp)
                .getJSONArray("choices").getJSONObject(0)
                .getJSONObject("message").getString("content");
    }

    // ===== OpenAI 兼容 /audio/transcriptions(multipart) =====
    public static String transcribe(String baseUrl, String apiKey, String model, File audio) throws Exception {
        String boundary = "----agenda" + System.currentTimeMillis();
        HttpURLConnection conn = (HttpURLConnection) new URL(trimSlash(baseUrl) + "/audio/transcriptions").openConnection();
        conn.setRequestMethod("POST");
        conn.setConnectTimeout(15000);
        conn.setReadTimeout(90000);
        conn.setRequestProperty("Content-Type", "multipart/form-data; boundary=" + boundary);
        if (apiKey != null && !apiKey.isEmpty()) {
            conn.setRequestProperty("Authorization", "Bearer " + apiKey);
        }
        conn.setDoOutput(true);
        try (OutputStream os = conn.getOutputStream()) {
            java.io.Writer w = new java.io.OutputStreamWriter(os, StandardCharsets.UTF_8);
            w.write("--" + boundary + "\r\n");
            w.write("Content-Disposition: form-data; name=\"model\"\r\n\r\n");
            w.write(model + "\r\n");
            w.write("--" + boundary + "\r\n");
            w.write("Content-Disposition: form-data; name=\"file\"; filename=\"voice.m4a\"\r\n");
            w.write("Content-Type: audio/mp4\r\n\r\n");
            w.flush();
            try (FileInputStream in = new FileInputStream(audio)) {
                byte[] buf = new byte[8192];
                int n;
                while ((n = in.read(buf)) > 0) os.write(buf, 0, n);
            }
            w.write("\r\n--" + boundary + "--\r\n");
            w.flush();
        }
        int code = conn.getResponseCode();
        String resp = readStream(code >= 400 ? conn.getErrorStream() : conn.getInputStream());
        if (code >= 400) {
            throw new Exception("转写 API " + code + ": " + resp.substring(0, Math.min(200, resp.length())));
        }
        return new JSONObject(resp).optString("text", "");
    }

    // ===== 图片:压缩保存 → base64 dataURL =====
    /** 把相册里选中的图片降采样后另存为 JPEG,返回文件路径;只保留最近 3 张,防堆积 */
    public static String savePickedImage(Context ctx, Uri uri) throws Exception {
        BitmapFactory.Options opts = new BitmapFactory.Options();
        opts.inJustDecodeBounds = true;
        try (InputStream in = ctx.getContentResolver().openInputStream(uri)) {
            BitmapFactory.decodeStream(in, null, opts);
        }
        int sample = 1;
        while (Math.max(opts.outWidth, opts.outHeight) / sample > 1600) sample *= 2;
        BitmapFactory.Options o2 = new BitmapFactory.Options();
        o2.inSampleSize = sample;
        Bitmap bmp;
        try (InputStream in = ctx.getContentResolver().openInputStream(uri)) {
            bmp = BitmapFactory.decodeStream(in, null, o2);
        }
        if (bmp == null) throw new Exception("图片读取失败");
        File out = new File(ctx.getFilesDir(), "pick_" + System.currentTimeMillis() + ".jpg");
        try (FileOutputStream fos = new FileOutputStream(out)) {
            bmp.compress(Bitmap.CompressFormat.JPEG, 82, fos);
        }
        if (!bmp.isRecycled()) bmp.recycle();
        // 清理旧的选图缓存
        File[] picks = ctx.getFilesDir().listFiles((d, name) -> name.startsWith("pick_") && name.endsWith(".jpg"));
        if (picks != null && picks.length > 3) {
            java.util.Arrays.sort(picks, (a, b) -> Long.compare(b.lastModified(), a.lastModified()));
            for (int i = 3; i < picks.length; i++) picks[i].delete();
        }
        return out.getAbsolutePath();
    }

    public static String fileToDataUrl(File f) throws Exception {
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        try (FileInputStream in = new FileInputStream(f)) {
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) bos.write(buf, 0, n);
        }
        return "data:image/jpeg;base64,"
                + android.util.Base64.encodeToString(bos.toByteArray(), android.util.Base64.NO_WRAP);
    }

    /** 读取用户选中的文本文件(.ics 等),上限 1MB */
    public static String readTextFile(Context ctx, Uri uri) throws Exception {
        try (InputStream in = ctx.getContentResolver().openInputStream(uri)) {
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n, total = 0;
            while ((n = in.read(buf)) > 0) {
                total += n;
                if (total > 1024 * 1024) throw new Exception("文件超过 1MB,请确认是课程表导出文件");
                bos.write(buf, 0, n);
            }
            return new String(bos.toByteArray(), StandardCharsets.UTF_8);
        }
    }

    public static String trimSlash(String s) {
        return s == null ? "" : s.replaceAll("/+$", "");
    }
}
