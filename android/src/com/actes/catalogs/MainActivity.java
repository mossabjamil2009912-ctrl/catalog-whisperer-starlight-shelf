package com.actes.catalogs;

import android.app.Activity;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.webkit.*;
import android.widget.*;
import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.regex.*;
import org.json.*;

public class MainActivity extends Activity {
  static final String LIVE = "https://catalog-whisperer-starligight-shelf.lovable.app";
  static final String API = "https://c--8d99b5de-10fc-4687-9935-3222ae7b5790-prod.lovable.cloud";
  static final String KEY = "sb_publishable_5xMt8cw1tjyiyMVBYRu2TQ_0eH5qOpS";
  static final Pattern FILE = Pattern.compile("/catalogs/([0-9a-fA-F-]{36})\\.(pdf|jpg)");
  WebView web; TextView bar; File dir; boolean local = false; volatile boolean syncing = false;

  @Override protected void onCreate(Bundle b) {
    super.onCreate(b);
    dir = new File(getFilesDir(), "c"); dir.mkdirs();
    FrameLayout root = new FrameLayout(this);
    web = new WebView(this);
    bar = new TextView(this);
    bar.setBackgroundColor(Color.parseColor("#E61E3A5F")); bar.setTextColor(Color.WHITE);
    bar.setPadding(24, 14, 24, 14); bar.setGravity(Gravity.CENTER); bar.setTextSize(13); bar.setVisibility(View.GONE);
    root.addView(web, new FrameLayout.LayoutParams(-1, -1));
    root.addView(bar, new FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM));
    setContentView(root);
    WebSettings s = web.getSettings();
    s.setJavaScriptEnabled(true); s.setDomStorageEnabled(true); s.setDatabaseEnabled(true);
    s.setMediaPlaybackRequiresUserGesture(false); s.setAllowFileAccess(false);
    web.addJavascriptInterface(new Bridge(), "Android");
    web.setWebChromeClient(new WebChromeClient() {
      @Override public void onPermissionRequest(PermissionRequest r) { r.grant(r.getResources()); }
    });
    web.setWebViewClient(new WebViewClient() {
      @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
        String host = r.getUrl().getHost(); String path = r.getUrl().getPath();
        if (path != null) {
          Matcher m = FILE.matcher(path);
          if (m.find()) {
            File f = new File(dir, m.group(1) + "." + m.group(2));
            if (f.length() > 0) return serve(f, m.group(2).equals("pdf") ? "application/pdf" : "image/jpeg");
          }
        }
        if ("app.local".equals(host)) {
          String p = path == null || path.equals("/") ? "/index.html" : path;
          if (p.equals("/data.json")) { File f = new File(getFilesDir(), "data.json"); if (f.exists()) return serve(f, "application/json"); }
          try {
            String mime = p.endsWith(".html") ? "text/html" : p.endsWith(".mjs") || p.endsWith(".js") ? "text/javascript" : p.endsWith(".json") ? "application/json" : "application/octet-stream";
            return new WebResourceResponse(mime, "utf-8", getAssets().open("web" + p));
          } catch (IOException e) { return new WebResourceResponse("text/plain", "utf-8", 404, "nf", null, new ByteArrayInputStream(new byte[0])); }
        }
        return null;
      }
      @Override public void onReceivedError(WebView v, WebResourceRequest r, WebResourceError e) {
        if (r.isForMainFrame() && !local) goLocal();
      }
      @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
        String h = r.getUrl().getHost();
        if (h != null && (h.endsWith("lovable.app") || h.equals("app.local") || h.endsWith("lovable.cloud"))) return false;
        try { startActivity(new android.content.Intent(android.content.Intent.ACTION_VIEW, r.getUrl())); } catch (Exception ex) {}
        return true;
      }
    });
    if (online()) { web.loadUrl(LIVE); sync(false); } else goLocal();
  }

  WebResourceResponse serve(File f, String mime) {
    try {
      java.util.Map<String, String> h = new java.util.HashMap<>();
      h.put("Access-Control-Allow-Origin", "*"); h.put("Content-Length", String.valueOf(f.length())); h.put("Cache-Control", "no-cache");
      return new WebResourceResponse(mime, null, 200, "OK", h, new BufferedInputStream(new FileInputStream(f)));
    } catch (IOException e) { return null; }
  }

  void goLocal() { local = true; web.loadUrl("https://app.local/index.html"); }

  boolean online() {
    ConnectivityManager cm = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
    NetworkInfo n = cm == null ? null : cm.getActiveNetworkInfo();
    return n != null && n.isConnected();
  }

  void show(final String t) { runOnUiThread(new Runnable() { public void run() {
    if (t == null) bar.setVisibility(View.GONE); else { bar.setText(t); bar.setVisibility(View.VISIBLE); } } }); }

  // Downloads each catalog once; later runs fetch only new or changed ones.
  void sync(final boolean manual) {
    if (syncing) return; syncing = true;
    new Thread(new Runnable() { public void run() {
      try {
        String cats = get(API + "/rest/v1/catalogs?select=id,title,description,keywords,category_id,file_path,cover_path,page_count,language,created_at&order=created_at.desc");
        String groups = get(API + "/rest/v1/categories?select=*");
        JSONArray arr = new JSONArray(cats);
        SharedPreferences sp = getSharedPreferences("files", MODE_PRIVATE);
        int todo = 0;
        for (int i = 0; i < arr.length(); i++) { if (!have(sp, arr.getJSONObject(i))) todo++; }
        int done = 0;
        for (int i = 0; i < arr.length(); i++) {
          JSONObject c = arr.getJSONObject(i); String id = c.getString("id");
          File jpg = new File(dir, id + ".jpg");
          if (jpg.length() == 0) { try { download(LIVE + "/catalogs/" + id + ".jpg", jpg); } catch (Exception e) {} }
          if (have(sp, c)) continue;
          show("جاري تجهيز الكاتلوجات للعمل بدون إنترنت… " + (done + 1) + " / " + todo);
          try { download(LIVE + "/api/public/file/" + id, new File(dir, id + ".pdf")); sp.edit().putString(id, c.getString("file_path")).apply(); } catch (Exception e) {}
          done++;
        }
        JSONObject data = new JSONObject(); data.put("catalogs", arr); data.put("categories", new JSONArray(groups));
        write(new File(getFilesDir(), "data.json"), data.toString().getBytes("UTF-8"));
        show(todo == 0 ? (manual ? "كل الكاتلوجات محدّثة ✓" : null) : "اكتمل التجهيز ✓ تعمل الآن بدون إنترنت");
        if (todo > 0 || manual) { Thread.sleep(3000); show(null); }
      } catch (Exception e) { show(null); }
      syncing = false;
    } }).start();
  }

  boolean have(SharedPreferences sp, JSONObject c) throws JSONException {
    File f = new File(dir, c.getString("id") + ".pdf");
    return f.length() > 1000 && c.getString("file_path").equals(sp.getString(c.getString("id"), null));
  }

  String get(String u) throws IOException {
    HttpURLConnection c = (HttpURLConnection) new URL(u).openConnection();
    c.setRequestProperty("apikey", KEY); c.setConnectTimeout(15000); c.setReadTimeout(30000);
    InputStream in = c.getInputStream(); ByteArrayOutputStream o = new ByteArrayOutputStream();
    byte[] buf = new byte[16384]; int n; while ((n = in.read(buf)) > 0) o.write(buf, 0, n); in.close();
    return o.toString("UTF-8");
  }

  // Resumable: keeps a .part file and continues with a Range request.
  void download(String u, File dest) throws IOException {
    File part = new File(dest.getPath() + ".part");
    for (int hop = 0; hop < 6; hop++) {
      HttpURLConnection c = (HttpURLConnection) new URL(u).openConnection();
      c.setInstanceFollowRedirects(false); c.setConnectTimeout(15000); c.setReadTimeout(60000);
      long have = part.length(); if (have > 0) c.setRequestProperty("Range", "bytes=" + have + "-");
      int code = c.getResponseCode();
      if (code >= 300 && code < 400) { u = new URL(new URL(u), c.getHeaderField("Location")).toString(); c.disconnect(); continue; }
      if (code == 416) { part.delete(); continue; }
      if (code != 200 && code != 206) throw new IOException("http " + code);
      InputStream in = c.getInputStream(); OutputStream o = new FileOutputStream(part, code == 206);
      byte[] buf = new byte[65536]; int n; while ((n = in.read(buf)) > 0) o.write(buf, 0, n);
      o.close(); in.close();
      if (!part.renameTo(dest)) throw new IOException("rename");
      return;
    }
    throw new IOException("redirects");
  }

  void write(File f, byte[] b) throws IOException { FileOutputStream o = new FileOutputStream(f); o.write(b); o.close(); }

  class Bridge {
    @JavascriptInterface public boolean has(String id) { return new File(dir, id + ".pdf").length() > 0; }
    @JavascriptInterface public void update() { sync(true); }
    @JavascriptInterface public void goOnline() { runOnUiThread(new Runnable() { public void run() { if (online()) { local = false; web.loadUrl(LIVE); } } }); }
    @JavascriptInterface public boolean isOnline() { return online(); }
  }

  @Override public void onBackPressed() { if (web.canGoBack()) web.goBack(); else super.onBackPressed(); }
}
