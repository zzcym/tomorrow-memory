package com.tomorrow.memory;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;

/** 明日记忆 · WebView 壳(查词/背词/单词本/登录,数据全部在 tmword.xyz 云端) */
public class MainActivity extends Activity {
    private WebView web;
    private final android.os.Handler main = new android.os.Handler(android.os.Looper.getMainLooper());
    private String launchFocus = "";
    private android.webkit.ValueCallback<Uri[]> fileUploadCallback;
    private static final int REQ_FILE_CHOOSER = 2001;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // 小组件点击进入:直接聚焦搜索框
        if ("search".equals(getIntent() != null ? getIntent().getStringExtra("focus") : null)) {
            launchFocus = "search";
        }
        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        web.setBackgroundColor(0xFFFFFFFF);
        // 头像上传:WebView <input type=file> → 系统文件选择器
        web.setWebChromeClient(new android.webkit.WebChromeClient() {
            @Override
            public boolean onJsPrompt(WebView view, String url, String message, String defaultValue, android.webkit.JsPromptResult result) {
                android.widget.EditText input = new android.widget.EditText(view.getContext());
                input.setText(defaultValue == null ? "" : defaultValue);
                new android.app.AlertDialog.Builder(view.getContext())
                        .setTitle(message)
                        .setView(input)
                        .setPositiveButton("确定", (d, w) -> result.confirm(input.getText().toString()))
                        .setNegativeButton("取消", (d, w) -> result.cancel())
                        .setOnCancelListener((d) -> result.cancel())
                        .show();
                return true;
            }

            @Override
            public boolean onJsAlert(WebView view, String url, String message, android.webkit.JsResult result) {
                new android.app.AlertDialog.Builder(view.getContext())
                        .setMessage(message)
                        .setPositiveButton("确定", (d, w) -> result.confirm())
                        .show();
                return true;
            }

            @Override
            public boolean onJsConfirm(WebView view, String url, String message, android.webkit.JsResult result) {
                new android.app.AlertDialog.Builder(view.getContext())
                        .setMessage(message)
                        .setPositiveButton("确定", (d, w) -> result.confirm())
                        .setNegativeButton("取消", (d, w) -> result.cancel())
                        .show();
                return true;
            }

            @Override
            public boolean onShowFileChooser(WebView view, android.webkit.ValueCallback<Uri[]> callback,
                                             android.webkit.WebChromeClient.FileChooserParams params) {
                if (fileUploadCallback != null) {
                    fileUploadCallback.onReceiveValue(null);
                }
                fileUploadCallback = callback;
                try {
                    Intent in = new Intent(Intent.ACTION_GET_CONTENT);
                    in.addCategory(Intent.CATEGORY_OPENABLE);
                    in.setType("image/*");
                    startActivityForResult(Intent.createChooser(in, "选择头像图片"), REQ_FILE_CHOOSER);
                } catch (Exception e) {
                    fileUploadCallback = null;
                    return false;
                }
                return true;
            }
        });
        web.addJavascriptInterface(new Bridge(), "AndroidBridge");
        // 页面就绪后把 SharedPreferences 里的 token 回灌 WebView(localStorage 可能被系统清理)
        web.setWebViewClient(new android.webkit.WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                String token = getSharedPreferences("tm", MODE_PRIVATE).getString("token", "");
                if (!token.isEmpty()) {
                    String quoted = org.json.JSONObject.quote(token);
                    view.evaluateJavascript(
                            "try{if(!localStorage.getItem('tm.token'))localStorage.setItem('tm.token'," + quoted + ");}catch(e){}",
                            null);
                }
            }
        });
        setContentView(web);
        web.loadUrl("file:///android_asset/index.html");
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_FILE_CHOOSER && fileUploadCallback != null) {
            Uri[] results = (resultCode == RESULT_OK && data != null && data.getData() != null)
                    ? new Uri[]{ data.getData() } : null;
            fileUploadCallback.onReceiveValue(results);
            fileUploadCallback = null;
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    @Override
    protected void onResume() {
        super.onResume();
        // 页面可见时触发 visibilitychange(前端刷新徽标与同步)
        main.post(() -> web.evaluateJavascript(
                "document.dispatchEvent(new Event('visibilitychange'))", null));
    }

    /** 系统返回键:菜单开→关菜单;非首页→回首页;其余交给系统(退出) */
    @Override
    public void onBackPressed() {
        main.post(() -> web.evaluateJavascript(
                "window.onAndroidBack ? String(window.onAndroidBack()) : 'exit'",
                (v) -> {
                    if (v != null && v.contains("exit")) {
                        finish();
                    }
                }));
    }

    private void sendToJs(String script) {
        main.post(() -> web.evaluateJavascript(script, null));
    }

    /** JS 桥 */
    private class Bridge {
        /** token 双写:WebView localStorage 之外再存一份 SharedPreferences */
        @JavascriptInterface
        public void saveToken(String token) {
            SharedPreferences sp = getSharedPreferences("tm", MODE_PRIVATE);
            sp.edit().putString("token", token == null ? "" : token).apply();
        }

        @JavascriptInterface
        public String readToken() {
            return getSharedPreferences("tm", MODE_PRIVATE).getString("token", "");
        }

        /** 小组件深链:取走即清空 */
        @JavascriptInterface
        public String consumeLaunchFocus() {
            String f = launchFocus;
            launchFocus = "";
            return f;
        }
    }
}
