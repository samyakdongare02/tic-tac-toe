package com.samyakdongare.tictactoe;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.webkit.WebViewAssetLoader;

/**
 * Thin native shell that plays the bundled Tic-Tac-Toe web game.
 * Assets are served over https://appassets.androidplatform.net/assets/ with
 * androidx WebViewAssetLoader, so the game runs fully offline from a secure
 * origin (which also lets the service worker activate inside the WebView).
 */
public class MainActivity extends Activity {

    private WebView webView;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        webView = new WebView(this);
        setContentView(webView);

        // Serve the bundled assets and keep navigation inside the app.
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view,
                    WebResourceRequest request) {
                return loader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view,
                    WebResourceRequest request) {
                Boolean handled = loader.shouldOverrideUrlLoading(request.getUrl());
                return handled != null ? handled : false;
            }
        });
        webView.setBackgroundColor(0xFF0F172A);   // no white flash while loading

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);

        webView.loadUrl("https://appassets.androidplatform.net/assets/index.html");
    }
}
