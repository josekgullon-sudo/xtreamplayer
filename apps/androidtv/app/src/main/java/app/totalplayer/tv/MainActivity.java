package app.totalplayer.tv;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * La aplicación de televisión, dentro de un WebView.
 *
 * Dentro va /tv, la misma que funciona en el navegador de cualquier tele. No
 * se reescribe la interfaz en nativo a propósito: lo que se arregla en la web
 * queda arreglado en el televisor sin publicar una versión ni esperar a que
 * nadie actualice, que en las tiendas de televisores son semanas.
 *
 * Lo nativo es lo que no puede no serlo: pantalla completa de verdad, que la
 * tele no se apague mientras se ve algo, y el botón ATRÁS del mando.
 */
public class MainActivity extends Activity {

    /** Dónde vive la aplicación. Se cambia aquí al montarla para otra marca. */
    private static final String INICIO = "https://xtreamplayer-production.up.railway.app/tv";

    private WebView web;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle estadoAnterior) {
        super.onCreate(estadoAnterior);

        /*
         * La tele no debe apagarse viendo una película: nadie toca el mando
         * durante dos horas y el sistema, sin esto, la manda a reposo.
         */
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        pantallaCompleta();

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#201f28"));
        setContentView(web);

        WebSettings ajustes = web.getSettings();
        ajustes.setJavaScriptEnabled(true);
        ajustes.setDomStorageEnabled(true);           // la sesión y la MAC viven aquí
        ajustes.setMediaPlaybackRequiresUserGesture(false);
        ajustes.setLoadWithOverviewMode(true);
        ajustes.setUseWideViewPort(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            ajustes.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        }

        // Vídeo a pantalla completa: sin esto, se ve en un recuadro
        web.setWebChromeClient(new WebChromeClient());

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView vista, WebResourceRequest peticion) {
                // Todo se abre dentro: en una tele no hay «otra pestaña»
                return false;
            }

            @Override
            public void onReceivedError(WebView vista, WebResourceRequest peticion, WebResourceError error) {
                /*
                 * Una tele enciende antes de tener wifi. En vez de dejar el
                 * error del sistema —una página blanca con letra pequeña—,
                 * se reintenta: la propia /tv sabe arrancar con lo de la
                 * última vez en cuanto carga.
                 */
                if (peticion.isForMainFrame()) {
                    vista.postDelayed(new Runnable() {
                        @Override
                        public void run() {
                            vista.loadUrl(INICIO);
                        }
                    }, 3000);
                }
            }
        });

        web.loadUrl(INICIO);
    }

    /** Sin barras del sistema: la parrilla necesita la pantalla entera. */
    private void pantallaCompleta() {
        View raiz = getWindow().getDecorView();
        raiz.setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
    }

    @Override
    public void onWindowFocusChanged(boolean conFoco) {
        super.onWindowFocusChanged(conFoco);
        if (conFoco) pantallaCompleta();
    }

    /**
     * ATRÁS del mando: lo gestiona la aplicación web, que sabe si hay que
     * cerrar un vídeo, salir de una carpeta o volver a la portada. Solo
     * cuando ya está en la portada se sale de la aplicación.
     */
    @Override
    public boolean onKeyDown(int codigo, KeyEvent evento) {
        if (codigo == KeyEvent.KEYCODE_BACK && web != null && web.canGoBack()) {
            web.goBack();
            return true;
        }
        return super.onKeyDown(codigo, evento);
    }

    @Override
    protected void onDestroy() {
        if (web != null) web.destroy();
        super.onDestroy();
    }
}
