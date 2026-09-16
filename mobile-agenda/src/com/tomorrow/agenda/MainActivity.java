package com.tomorrow.agenda;

import android.Manifest;
import android.app.Activity;
import android.app.AlarmManager;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.media.MediaRecorder;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.view.View;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.regex.Pattern;

public class MainActivity extends Activity {
    private WebView web;
    private SpeechRecognizer speech;
    private MediaRecorder recorder;
    private File recFile;
    private boolean voiceWantsCloud = false;
    private final Handler main = new Handler(Looper.getMainLooper());
    private static final int REQ_NOTIF = 101;
    private static final int REQ_MIC = 102;
    private static final int REQ_PICK = 103;
    private String pickPurpose = "";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        AlarmReceiver.ensureChannels(this);

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        web.setBackgroundColor(Color.TRANSPARENT);
        web.addJavascriptInterface(new Bridge(), "AndroidBridge");
        // 页面加载完成前 evaluateJavascript 会被静默丢弃:缓存深链,等页面就绪再派发
        web.setWebViewClient(new android.webkit.WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                pageReady = true;
                dispatchPendingDeepLink();
            }
        });
        setContentView(web);
        web.loadUrl("file:///android_asset/index.html");

        WidgetUpdater.updateAll(this); // 装好就有内容,不等第一次事件变更

        // Android 13+ 通知运行时权限
        if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIF);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        // 打开应用时恢复/重排闹钟并刷新小组件(兼容系统回收与数据变化)
        Scheduler.scheduleAll(this);
        maybeDispatchDeepLink();
    }

    private boolean pageReady = false;
    private String pendingDeepLink;

    /** 通知点击深链:带上 openDay 就把界面带到那一天;页面未就绪时先缓存 */
    private void maybeDispatchDeepLink() {
        String day = getIntent() == null ? null : getIntent().getStringExtra("openDay");
        if (day == null || !day.matches("\\d{4}-\\d{2}-\\d{2}")) return;
        getIntent().removeExtra("openDay");
        if (pageReady) {
            sendToJs("window.onDeepLink && window.onDeepLink(" + JSONObject.quote(day) + ")");
        } else {
            pendingDeepLink = day;
        }
    }

    private void dispatchPendingDeepLink() {
        if (pendingDeepLink == null) return;
        String day = pendingDeepLink;
        pendingDeepLink = null;
        sendToJs("window.onDeepLink && window.onDeepLink(" + JSONObject.quote(day) + ")");
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        if (requestCode == REQ_MIC) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                if (voiceWantsCloud) startCloudVoiceInternal();
                else startVoiceInternal();
            } else {
                // 拒绝麦克风:直接走文字兜底,不许浮层卡在"正在听"
                voiceErrorToJs("麦克风权限未开启。可先用文字添加,或到系统设置开启权限", "unavailable");
            }
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_PICK && resultCode == RESULT_OK && data != null && data.getData() != null) {
            final String purpose = pickPurpose;
            final android.net.Uri uri = data.getData();
            new Thread(() -> {
                try {
                    if ("ics".equals(purpose)) {
                        String text = Util.readTextFile(this, uri);
                        sendToJs("window.onIcsFile && window.onIcsFile(" + JSONObject.quote(text) + ")");
                    } else if ("backup".equals(purpose)) {
                        String text = Util.readTextFile(this, uri);
                        sendToJs("window.onBackupFile && window.onBackupFile(" + JSONObject.quote(text) + ")");
                    } else {
                        String path = Util.savePickedImage(this, uri);
                        sendToJs("window.onImagePicked && window.onImagePicked("
                                + JSONObject.quote(path) + "," + JSONObject.quote(purpose) + ")");
                    }
                } catch (Exception e) {
                    sendToJs("window.onImagePickError && window.onImagePickError("
                            + JSONObject.quote(String.valueOf(e.getMessage())) + ")");
                }
            }).start();
        }
    }

    private void sendToJs(String script) {
        main.post(() -> web.evaluateJavascript(script, null));
    }

    /** JS 桥:所有方法运行在 WebView 的桥线程(非主线程,可直接联网) */
    private class Bridge {

        @JavascriptInterface
        public String getSettings() {
            return Store.settings(MainActivity.this).toString();
        }

        @JavascriptInterface
        public String saveSettings(String json) {
            try {
                JSONObject patch = new JSONObject(json);
                JSONObject cur = Store.settings(MainActivity.this);
                JSONObject merged = merge(cur, patch);
                Store.saveSettings(MainActivity.this, merged);
                Scheduler.scheduleAll(MainActivity.this);
                return merged.toString();
            } catch (Exception e) {
                return Store.settings(MainActivity.this).toString();
            }
        }

        @JavascriptInterface
        public String getEvents() {
            return Store.events(MainActivity.this).toString();
        }

        /** 追加事件(JS 侧确认后的结果),返回全量列表 */
        @JavascriptInterface
        public String addEvents(String arrJson) {
            try {
                JSONArray add = new JSONArray(arrJson);
                JSONArray evs = Store.events(MainActivity.this);
                long now = System.currentTimeMillis();
                for (int i = 0; i < add.length(); i++) {
                    JSONObject e = add.optJSONObject(i);
                    if (e == null || e.optString("title").isEmpty()) continue;
                    if (e.optString("start").isEmpty() && e.optJSONObject("recur") == null) continue;
                    e.put("id", "e" + now + i);
                    e.put("createdAt", now);
                    evs.put(e);
                }
                Store.saveEvents(MainActivity.this, evs);
                Scheduler.scheduleAll(MainActivity.this);
                return evs.toString();
            } catch (Exception e) {
                return Store.events(MainActivity.this).toString();
            }
        }

        /** 按 id 更新单条事件,返回全量列表 */
        @JavascriptInterface
        public String updateEvent(String json) {
            try {
                JSONObject patch = new JSONObject(json);
                String id = patch.optString("id");
                JSONArray evs = Store.events(MainActivity.this);
                for (int i = 0; i < evs.length(); i++) {
                    JSONObject e = evs.optJSONObject(i);
                    if (e != null && id.equals(e.optString("id"))) {
                        java.util.Iterator<String> it = patch.keys();
                        while (it.hasNext()) {
                            String k = it.next();
                            if ("id".equals(k) || "createdAt".equals(k)) continue;
                            if ("end".equals(k) && patch.optString(k).isEmpty()) {
                                e.remove("end"); // 清空结束时间
                                continue;
                            }
                            e.put(k, patch.opt(k));
                        }
                        e.remove("remindedMap");
                        e.remove("remindedAt");
                        break;
                    }
                }
                Store.saveEvents(MainActivity.this, evs);
                Scheduler.scheduleAll(MainActivity.this);
                return evs.toString();
            } catch (Exception e) {
                return Store.events(MainActivity.this).toString();
            }
        }

        @JavascriptInterface
        public String deleteEvent(String id) {
            JSONArray evs = Store.events(MainActivity.this);
            JSONArray next = new JSONArray();
            for (int i = 0; i < evs.length(); i++) {
                JSONObject e = evs.optJSONObject(i);
                if (e != null && !id.equals(e.optString("id"))) next.put(e);
            }
            Store.saveEvents(MainActivity.this, next);
            Scheduler.scheduleAll(MainActivity.this);
            return next.toString();
        }

        /** 文本 → 大模型解析为结构化日程(阻塞调用,桥线程执行) */
        @JavascriptInterface
        public String parseText(String text) {
            try {
                JSONObject llm = llmConfig();
                if (llm == null) {
                    return "{\"error\":\"请先在设置里配置大模型 API\"}";
                }
                String content = Util.chat(llm.optString("baseUrl"), llm.optString("apiKey"),
                        llm.optString("model", "deepseek-chat"), buildParseMessages(text));
                return new JSONObject().put("events", normalizeEvents(extractJson(content))).toString();
            } catch (Exception e) {
                try {
                    return new JSONObject().put("error", e.getMessage() == null ? "解析失败" : e.getMessage()).toString();
                } catch (Exception ignored) {
                    return "{\"error\":\"解析失败\"}";
                }
            }
        }

        // ===== 语音 =====
        /** preferCloud=true 跳过系统识别直接云端转写;token 透传给所有回调,JS 侧丢弃过期会话的结果 */
        @JavascriptInterface
        public void startVoice(boolean preferCloud, String token) {
            voiceToken = token == null ? "" : token;
            voiceWantsCloud = preferCloud;
            if (checkSelfPermission(Manifest.permission.RECORD_AUDIO)
                    != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQ_MIC);
                return;
            }
            if (preferCloud && hasAsrConfig()) {
                startCloudVoiceInternal();
                return;
            }
            if (!SpeechRecognizer.isRecognitionAvailable(MainActivity.this)) {
                if (hasAsrConfig()) {
                    startCloudVoiceInternal();
                } else {
                    voiceErrorToJs("这台手机没有内置语音识别", "unavailable");
                }
                return;
            }
            startVoiceInternal();
        }

        /** 停止录音并上传转写(阻塞,桥线程);token 与 JS 会话对齐(桥按参数个数匹配) */
        @JavascriptInterface
        public void stopVoice(String token) {
            MediaRecorder rec;
            File file;
            synchronized (MainActivity.this) {
                rec = recorder;
                file = recFile;
                recorder = null;
                recFile = null;
            }
            if (rec == null || file == null || !file.exists()) {
                voiceErrorToJs("没有录音", "unavailable");
                return;
            }
            try {
                rec.stop();
            } catch (Exception ignored) {
            }
            rec.release();
            if (file.length() < 1200) {
                file.delete();
                voiceErrorToJs("没录到内容,再试一次", null);
                return;
            }
            try {
                JSONObject asr = Store.settings(MainActivity.this).optJSONObject("asr");
                if (asr == null || asr.optString("baseUrl").isEmpty()) {
                    throw new Exception("未配置语音转写接口");
                }
                String text = Util.transcribe(asr.optString("baseUrl"), asr.optString("apiKey"),
                        asr.optString("model", "FunAudioLLM/SenseVoiceSmall"), file);
                file.delete();
                if (text == null || text.trim().isEmpty()) {
                    voiceErrorToJs("没听清,再试一次", null);
                    return;
                }
                voiceResultToJs(text.trim());
            } catch (Exception e) {
                file.delete();
                voiceErrorToJs("转写失败:" + e.getMessage(), null);
            }
        }

        /** 统一取消:停掉系统识别 + 丢弃录音(JS 取消按钮调用) */
        @JavascriptInterface
        public void cancelVoice() {
            main.post(() -> {
                if (speech != null) {
                    try { speech.stopListening(); } catch (Exception ignored) { }
                }
            });
            cancelVoiceInternal();
        }

        private synchronized void cancelVoiceInternal() {
            voiceToken = "";
            MediaRecorder rec;
            File file;
            synchronized (MainActivity.this) {
                rec = recorder;
                file = recFile;
                recorder = null;
                recFile = null;
            }
            if (rec != null) {
                try { rec.stop(); } catch (Exception ignored) { }
                rec.release();
            }
            if (file != null && file.exists()) file.delete();
        }

        // ===== 图片 =====
        @JavascriptInterface
        public void pickImage(String purpose) {
            pickPurpose = purpose == null ? "" : purpose;
            Intent in = new Intent(Intent.ACTION_GET_CONTENT);
            in.addCategory(Intent.CATEGORY_OPENABLE);
            in.setType("image/*");
            try {
                startActivityForResult(Intent.createChooser(in, "选择图片"), REQ_PICK);
            } catch (Exception e) {
                sendToJs("window.onImagePickError && window.onImagePickError("
                        + JSONObject.quote("找不到相册应用") + ")");
            }
        }

        /** 选择 .ics 日历文件(课程表导入),内容经 onIcsFile 回调 */
        @JavascriptInterface
        public void pickIcs() {
            pickPurpose = "ics";
            Intent in = new Intent(Intent.ACTION_GET_CONTENT);
            in.addCategory(Intent.CATEGORY_OPENABLE);
            in.setType("*/*");
            try {
                startActivityForResult(Intent.createChooser(in, "选择 .ics 日历文件"), REQ_PICK);
            } catch (Exception e) {
                sendToJs("window.onImagePickError && window.onImagePickError("
                        + JSONObject.quote("找不到文件选择器") + ")");
            }
        }

        @JavascriptInterface
        public String readImageBase64(String path) {
            try {
                return Util.fileToDataUrl(new File(path));
            } catch (Exception e) {
                return "";
            }
        }

        // ===== 其它 =====
        /** LLM 连通测试(阻塞,桥线程):发一条 1 token 请求 */
        @JavascriptInterface
        public String testLlm() {
            try {
                JSONObject llm = llmConfig();
                if (llm == null) return "请先填接口地址和 API Key";
                JSONArray msgs = new JSONArray();
                msgs.put(new JSONObject().put("role", "user").put("content", "回复ok"));
                long t0 = System.currentTimeMillis();
                Util.chat(llm.optString("baseUrl"), llm.optString("apiKey"),
                        llm.optString("model", "deepseek-chat"), msgs);
                return "ok:" + (System.currentTimeMillis() - t0) + "ms";
            } catch (Exception e) {
                return String.valueOf(e.getMessage());
            }
        }

        /** 导出备份到 Download/明日日程/,返回绝对路径或错误 */
        @JavascriptInterface
        public String exportData() {
            try {
                JSONObject all = new JSONObject();
                all.put("events", Store.events(MainActivity.this));
                all.put("settings", Store.settings(MainActivity.this));
                all.put("exportedAt", System.currentTimeMillis());
                all.put("version", 2);
                String name = "backup_" + new java.text.SimpleDateFormat(
                        "yyyyMMdd-HHmmss", java.util.Locale.US).format(new java.util.Date()) + ".json";
                byte[] bytes = all.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8);
                if (Build.VERSION.SDK_INT >= 29) {
                    // Scoped storage:写入 MediaStore Downloads(免权限)
                    android.content.ContentValues cv = new android.content.ContentValues();
                    cv.put(android.provider.MediaStore.Downloads.DISPLAY_NAME, name);
                    cv.put(android.provider.MediaStore.Downloads.MIME_TYPE, "application/json");
                    Uri uri = getContentResolver().insert(
                            android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
                    if (uri == null) return "导出失败:系统拒绝了写入请求";
                    try (java.io.OutputStream os = getContentResolver().openOutputStream(uri)) {
                        os.write(bytes);
                    }
                    return "下载/明日日程/" + name;
                }
                // Android 8/9:写应用专属外部目录(免权限、必然可写;文件管理器 Android/data 下可见)
                File dir = new File(getExternalFilesDir(android.os.Environment.DIRECTORY_DOWNLOADS),
                        "明日日程");
                if (!dir.exists()) dir.mkdirs();
                File out = new File(dir, name);
                try (java.io.FileOutputStream fos = new java.io.FileOutputStream(out)) {
                    fos.write(bytes);
                }
                return out.getAbsolutePath();
            } catch (Exception e) {
                return "导出失败:" + e.getMessage();
            }
        }

        /** 读回备份文件文本(JSON),入库由 JS 侧解析后走 importAll */
        @JavascriptInterface
        public String pickBackup() {
            pickPurpose = "backup";
            Intent in = new Intent(Intent.ACTION_GET_CONTENT);
            in.addCategory(Intent.CATEGORY_OPENABLE);
            in.setType("application/json");
            in.setType("*/*");
            try {
                startActivityForResult(Intent.createChooser(in, "选择备份文件"), REQ_PICK);
            } catch (Exception e) {
                sendToJs("window.onImagePickError && window.onImagePickError("
                        + JSONObject.quote("找不到文件选择器") + ")");
            }
            return "";
        }

        /** 整体导入(覆盖):events + settings,返回事件数 */
        @JavascriptInterface
        public int importAll(String json) {
            try {
                JSONObject all = new JSONObject(json);
                JSONArray evs = all.optJSONArray("events");
                if (evs == null) throw new Exception("备份里没有日程数据");
                Store.saveEvents(MainActivity.this, evs);
                JSONObject st = all.optJSONObject("settings");
                if (st != null) Store.saveSettings(MainActivity.this, st);
                Scheduler.scheduleAll(MainActivity.this);
                return evs.length();
            } catch (Exception e) {
                return -1;
            }
        }

        /** 清空全部日程(保留设置),返回删除条数 */
        @JavascriptInterface
        public int clearEvents() {
            JSONArray evs = Store.events(MainActivity.this);
            int n = evs.length();
            Store.saveEvents(MainActivity.this, new JSONArray());
            Scheduler.scheduleAll(MainActivity.this);
            return n;
        }

        @JavascriptInterface
        public void testNotify() {
            Intent i = new Intent(MainActivity.this, AlarmReceiver.class);
            i.putExtra("kind", "digest");
            i.putExtra("test", true);
            sendBroadcast(i);
        }

        @JavascriptInterface
        public boolean canExactAlarm() {
            if (Build.VERSION.SDK_INT >= 31) {
                AlarmManager am = (AlarmManager) getSystemService(ALARM_SERVICE);
                return am != null && am.canScheduleExactAlarms();
            }
            return true;
        }

        @JavascriptInterface
        public boolean canNotify() {
            if (Build.VERSION.SDK_INT >= 33) {
                return checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                        == PackageManager.PERMISSION_GRANTED;
            }
            return true;
        }

        @JavascriptInterface
        public void openNotifSettings() {
            try {
                Intent in = new Intent(android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                        .putExtra(android.provider.Settings.EXTRA_APP_PACKAGE, getPackageName());
                startActivity(in);
            } catch (Exception ignored) {
            }
        }

        @JavascriptInterface
        public void openExactAlarmSettings() {
            if (Build.VERSION.SDK_INT >= 31) {
                try {
                    startActivity(new Intent(android.provider.Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
                            Uri.parse("package:" + getPackageName())));
                } catch (Exception ignored) {
                }
            }
        }

        /** 跟随应用主题:状态栏/导航栏颜色 */
        @JavascriptInterface
        public void applyUiTheme(String theme) {
            main.post(() -> {
                try {
                    Window w = getWindow();
                    boolean night = "night".equals(theme)
                            || ("auto".equals(theme)
                            && (getResources().getConfiguration().uiMode
                            & android.content.res.Configuration.UI_MODE_NIGHT_MASK)
                            == android.content.res.Configuration.UI_MODE_NIGHT_YES);
                    w.setStatusBarColor(night ? 0xFF0E1013 : 0xFFFFFFFF);
                    w.setNavigationBarColor(night ? 0xFF0E1013 : 0xFFFFFFFF);
                    View decor = w.getDecorView();
                    int flags = decor.getSystemUiVisibility();
                    if (night) {
                        flags &= ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                        flags &= ~View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
                    } else {
                        flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                        flags |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
                    }
                    decor.setSystemUiVisibility(flags);
                } catch (Exception ignored) {
                }
            });
        }
    }

    /** 语音回调统一带会话 token,过期会话的结果由 JS 丢弃 */
    private volatile String voiceToken = "";

    private void voiceStateToJs(String state) {
        sendToJs("window.onVoiceState && window.onVoiceState("
                + JSONObject.quote(voiceToken) + "," + JSONObject.quote(state) + ")");
    }

    private void voiceResultToJs(String text) {
        sendToJs("window.onVoiceResult && window.onVoiceResult("
                + JSONObject.quote(voiceToken) + "," + JSONObject.quote(text) + ")");
        voiceToken = "";
    }

    private void voiceErrorToJs(String msg, String code) {
        String codePart = code == null ? "" : "," + JSONObject.quote(code);
        sendToJs("window.onVoiceError && window.onVoiceError("
                + JSONObject.quote(voiceToken) + "," + JSONObject.quote(msg) + codePart + ")");
        voiceToken = "";
    }

    private boolean hasAsrConfig() {
        JSONObject asr = Store.settings(this).optJSONObject("asr");
        return asr != null && !asr.optString("baseUrl").isEmpty() && !asr.optString("apiKey").isEmpty();
    }

    private JSONObject llmConfig() {
        JSONObject llm = Store.settings(this).optJSONObject("llm");
        if (llm == null) return null;
        if (llm.optString("baseUrl").isEmpty() || llm.optString("apiKey").isEmpty()) return null;
        return llm;
    }

    // ===== 系统语音识别(第一优先;不可用自动转云端) =====
    private void startVoiceInternal() {
        main.post(() -> {
            if (!SpeechRecognizer.isRecognitionAvailable(this)) {
                if (hasAsrConfig()) {
                    startCloudVoiceInternal();
                } else {
                    voiceErrorToJs("这台手机没有内置语音识别", "unavailable");
                }
                return;
            }
            if (speech == null) speech = SpeechRecognizer.createSpeechRecognizer(this);
            Intent in = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            in.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            in.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "zh-CN");
            in.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
            speech.setRecognitionListener(new RecognitionListener() {
                @Override public void onReadyForSpeech(Bundle params) {
                    voiceStateToJs("listening");
                }
                @Override public void onBeginningOfSpeech() {}
                @Override public void onRmsChanged(float rmsdB) {}
                @Override public void onBufferReceived(byte[] buffer) {}
                @Override public void onEndOfSpeech() {
                    voiceStateToJs("processing");
                }
                @Override public void onError(int error) {
                    // 系统识别失败 → 有云端配置就自动降级,否则交回 JS(计数后降级)
                    if (hasAsrConfig() && error != SpeechRecognizer.ERROR_NO_MATCH
                            && error != SpeechRecognizer.ERROR_SPEECH_TIMEOUT) {
                        startCloudVoiceInternal();
                        return;
                    }
                    String msg = error == SpeechRecognizer.ERROR_NO_MATCH ? "没听清,再试一次"
                            : error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT ? "没检测到说话"
                            : "语音识别出错(" + error + ")";
                    voiceErrorToJs(msg, null);
                }
                @Override public void onResults(Bundle results) {
                    ArrayList<String> list = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                    String text = list == null || list.isEmpty() ? "" : list.get(0);
                    voiceResultToJs(text);
                }
                @Override public void onPartialResults(Bundle partialResults) {}
                @Override public void onEvent(int eventType, Bundle params) {}
            });
            speech.startListening(in);
        });
    }

    // ===== 云端转写录音(第二优先) =====
    private synchronized void startCloudVoiceInternal() {
        MediaRecorder r = null;
        try {
            if (recorder != null) return;
            r = Build.VERSION.SDK_INT >= 31 ? new MediaRecorder() : new MediaRecorder();
            r.setAudioSource(MediaRecorder.AudioSource.MIC);
            r.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
            r.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
            r.setAudioSamplingRate(44100);
            r.setAudioEncodingBitRate(96000);
            recFile = new File(getFilesDir(), "voice_" + System.currentTimeMillis() + ".m4a");
            r.setOutputFile(recFile.getAbsolutePath());
            r.prepare();
            r.start();
            recorder = r;
            voiceStateToJs("recording");
        } catch (Exception e) {
            if (r != null) r.release(); // 失败必须释放,否则麦克风被占
            recorder = null;
            if (recFile != null && recFile.exists()) recFile.delete();
            recFile = null;
            voiceErrorToJs("录音启动失败:" + e.getMessage(), "unavailable");
        }
    }

    // ===== LLM 解析提示词 =====
    private JSONArray buildParseMessages(String text) {
        Calendar c = Calendar.getInstance();
        String[] wd = {"日", "一", "二", "三", "四", "五", "六"};
        String now = String.format("%04d-%02d-%02d %02d:%02d(周%s)",
                c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH),
                c.get(Calendar.HOUR_OF_DAY), c.get(Calendar.MINUTE), wd[c.get(Calendar.DAY_OF_WEEK) - 1]);
        String system = "你是日程提取助手。把用户输入解析为结构化日程 JSON。\n"
                + "当前时间:" + now + "。\n"
                + "只输出一个 JSON 对象 {\"events\":[...]},不要任何其他文字或代码块标记。\n"
                + "每个事件字段:title(必填,≤20字)、start(必填,\"YYYY-MM-DD HH:mm\" 24小时制)、"
                + "end(可选,明确提到才给)、allDay(完全没时间时为 true 且 start 取当天 00:00)、"
                + "location(可选)、notes(可选)。\n"
                + "时间规则:今天/明天/后天/下周X/周X 按当前日期推算;晚上8点=20:00;"
                + "只有'早上/中午/下午/晚上'依次取 08:00/12:00/14:00/20:00;"
                + "未说日期但说了钟点,今天的已过则取明天;一句话多件事拆成多个事件。";
        JSONArray msgs = new JSONArray();
        try {
            msgs.put(new JSONObject().put("role", "system").put("content", system));
            msgs.put(new JSONObject().put("role", "user").put("content", text));
        } catch (Exception ignored) {
        }
        return msgs;
    }

    private static final Pattern DT_RE = Pattern.compile("^\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}$");

    private JSONArray normalizeEvents(JSONObject raw) {
        JSONArray out = new JSONArray();
        JSONArray list = raw == null ? new JSONArray() : raw.optJSONArray("events");
        if (list == null) return out;
        Calendar c = Calendar.getInstance();
        String fallback = String.format("%04d-%02d-%02d 00:00",
                c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH));
        for (int i = 0; i < list.length(); i++) {
            JSONObject e = list.optJSONObject(i);
            if (e == null) continue;
            String title = e.optString("title", "").trim();
            if (title.isEmpty()) continue;
            String start = e.optString("start", "").trim();
            boolean allDay = e.optBoolean("allDay") || !DT_RE.matcher(start).matches();
            JSONObject n = new JSONObject();
            try {
                n.put("title", title.length() > 60 ? title.substring(0, 60) : title);
                n.put("start", DT_RE.matcher(start).matches() ? start : fallback);
                n.put("allDay", allDay);
                if (!allDay && DT_RE.matcher(e.optString("end", "")).matches()
                        && e.optString("end").compareTo(n.getString("start")) > 0) {
                    n.put("end", e.optString("end"));
                }
                if (!e.optString("location", "").isEmpty()) n.put("location", e.optString("location"));
                if (!e.optString("notes", "").isEmpty()) n.put("notes", e.optString("notes"));
                out.put(n);
            } catch (Exception ignored) {
            }
        }
        return out;
    }

    private JSONObject extractJson(String text) throws Exception {
        String cleaned = text == null ? "" : text.replaceAll("```(?:json)?", "").trim();
        int st = cleaned.indexOf('{');
        int en = cleaned.lastIndexOf('}');
        if (st < 0 || en <= st) throw new Exception("模型输出中没有 JSON");
        return new JSONObject(cleaned.substring(st, en + 1));
    }

    /** 浅合并(一层深) */
    private JSONObject merge(JSONObject base, JSONObject patch) throws org.json.JSONException {
        JSONObject out = new JSONObject();
        java.util.Iterator<String> it = base.keys();
        while (it.hasNext()) {
            String k = it.next();
            out.put(k, base.opt(k));
        }
        it = patch.keys();
        while (it.hasNext()) {
            String k = it.next();
            Object pv = patch.opt(k);
            Object bv = out.opt(k);
            if (pv instanceof JSONObject && bv instanceof JSONObject) {
                out.put(k, merge((JSONObject) bv, (JSONObject) pv));
            } else {
                out.put(k, pv);
            }
        }
        return out;
    }

    @Override
    protected void onDestroy() {
        if (speech != null) {
            speech.destroy();
            speech = null;
        }
        synchronized (this) {
            if (recorder != null) {
                try { recorder.stop(); } catch (Exception ignored) { }
                recorder.release();
                recorder = null;
            }
            if (recFile != null && recFile.exists()) recFile.delete();
        }
        super.onDestroy();
    }
}
