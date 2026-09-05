package app.totalplayer.movil;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.DownloadManager;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import app.totalplayer.comun.Descargas;
import android.widget.FrameLayout;

/**
 * TOTALplayer para móviles y tabletas Android.
 *
 * Dentro va el reproductor de siempre. La app existe porque en IPTV el cliente
 * espera un APK que le pasa su proveedor —«añade esto a la pantalla de inicio»
 * no lo hace casi nadie—, no porque haga falta reescribir nada en nativo.
 *
 * Lo que sí es nativo aquí y no está en la de televisión, porque en un
 * teléfono es donde se nota:
 *
 * - El vídeo a pantalla completa. Un WebView, por defecto, se queda con el
 *   vídeo dentro de su recuadro: al darle a pantalla completa no pasa nada.
 *   Eso se arregla con onShowCustomView, y es la mitad del trabajo de esta
 *   clase.
 * - Girar el teléfono sin recargar la página, que si no se pierde el minuto
 *   por el que iba la película.
 * - El botón atrás del sistema, que deshace un paso dentro de la web antes de
 *   cerrar la aplicación.
 * - Las descargas —una factura en PDF, por ejemplo— que un WebView ignora
 *   calladamente si nadie las recoge.
 */
public class MainActivity extends Activity {

    /** Dónde vive. Se cambia con apps/poner-dominio.sh al montarla para otra marca. */
    /*
     * `?app=1` como en las de televisor.
     *
     * Sin él, quien entra con el usuario que le dio su proveedor veía el
     * cartel de «tu tele se ve desde la aplicación» DENTRO de la aplicación
     * que el cartel le pedía instalar: la página no tenía manera de saber
     * que ya estaba en un envoltorio. La marca del agente —más abajo— dice
     * lo mismo y cubre a los que ya tienen el APK instalado.
     */
    private static final String INICIO = "https://totalplayer.app/player?app=1";

    /** Una tele o un móvil pueden abrir la app antes de tener red */
    private static final int ESPERA_REINTENTO = 3000;

    private WebView web;
    private View vistaEnPantallaCompleta;
    private WebChromeClient.CustomViewCallback cerrarPantallaCompleta;
    private boolean reintentando = false;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle estadoAnterior) {
        super.onCreate(estadoAnterior);

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#08080a"));
        setContentView(web);

        WebSettings ajustes = web.getSettings();
        ajustes.setJavaScriptEnabled(true);
        ajustes.setDomStorageEnabled(true);          // la sesión y las listas guardadas
        ajustes.setMediaPlaybackRequiresUserGesture(false);
        ajustes.setLoadWithOverviewMode(true);
        ajustes.setUseWideViewPort(true);
        ajustes.setSupportZoom(false);
        ajustes.setUserAgentString(ajustes.getUserAgentString() + " TOTALplayerApp/1.0");

        // Sin esto, cerrar la aplicación cierra la sesión y hay que volver a entrar
        CookieManager.getInstance().setAcceptCookie(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);
        }

        /*
         * Descargar para ver sin conexión, que una web no puede hacer sola.
         *
         * La página pregunta si hay alguien capaz de guardar ficheros y, si lo
         * hay, enseña el botón de descargar y su sección; en el navegador del
         * teléfono ese acceso no existe, porque allí lo único que hay es
         * almacenamiento del sitio y el sistema lo borra cuando le hace falta
         * espacio. Ver apps/comun/java/.../Descargas.java y
         * components/tv/descargas.ts.
         *
         * Solo lo alcanza la propia aplicación: lo que no es de nuestro
         * dominio se abre en el navegador del teléfono, no aquí dentro —ver
         * `shouldOverrideUrlLoading` justo debajo—.
         */
        web.addJavascriptInterface(new Descargas(this), "TPDescargas");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest peticion) {
                Uri destino = peticion.getUrl();
                String host = destino.getHost() == null ? "" : destino.getHost();
                /* Lo nuestro se abre dentro; un enlace a otro sitio —el soporte
                   del proveedor, por ejemplo— en el navegador del teléfono, que
                   es donde el usuario tiene sus contraseñas y sus pestañas */
                if (host.endsWith(hostDeInicio())) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, destino));
                } catch (Exception e) {
                    return false;
                }
                return true;
            }

            @Override
            public void onReceivedError(WebView v, WebResourceRequest peticion, WebResourceError error) {
                // Solo la página principal: un logotipo que no carga no es motivo
                // para recargar la aplicación entera
                if (peticion == null || !peticion.isForMainFrame() || reintentando) return;
                reintentando = true;
                v.postDelayed(new Runnable() {
                    @Override
                    public void run() {
                        reintentando = false;
                        web.loadUrl(INICIO);
                    }
                }, ESPERA_REINTENTO);
            }
        });

        /*
         * El vídeo a pantalla completa.
         *
         * Sin esto, el botón de pantalla completa del reproductor no hace nada:
         * el WebView se queda con el vídeo dentro de su recuadro. Aquí se saca
         * la vista que manda el navegador, se pone encima de todo y se apagan
         * las barras del sistema.
         */
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onShowCustomView(View vista, CustomViewCallback alCerrar) {
                if (vistaEnPantallaCompleta != null) {
                    alCerrar.onCustomViewHidden();
                    return;
                }
                vistaEnPantallaCompleta = vista;
                cerrarPantallaCompleta = alCerrar;
                ((FrameLayout) getWindow().getDecorView()).addView(
                        vista,
                        new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,
                                ViewGroup.LayoutParams.MATCH_PARENT));
                web.setVisibility(View.GONE);
                // La pantalla no se apaga mientras dura el vídeo
                getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                sinBarras(true);
            }

            @Override
            public void onHideCustomView() {
                if (vistaEnPantallaCompleta == null) return;
                ((FrameLayout) getWindow().getDecorView()).removeView(vistaEnPantallaCompleta);
                vistaEnPantallaCompleta = null;
                web.setVisibility(View.VISIBLE);
                getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                sinBarras(false);
                if (cerrarPantallaCompleta != null) {
                    cerrarPantallaCompleta.onCustomViewHidden();
                    cerrarPantallaCompleta = null;
                }
            }
        });

        /* Las descargas —una factura en PDF, una lista M3U— las ignora un
           WebView si nadie las recoge: el usuario pulsa y no pasa nada */
        web.setDownloadListener((url, agente, contenido, tipo, tam) -> {
            try {
                DownloadManager.Request peticion = new DownloadManager.Request(Uri.parse(url));
                peticion.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                peticion.allowScanningByMediaScanner();
                ((DownloadManager) getSystemService(DOWNLOAD_SERVICE)).enqueue(peticion);
            } catch (Exception e) {
                startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
            }
        });

        web.loadUrl(INICIO);
    }

    /** El dominio de INICIO, para saber qué se abre dentro y qué fuera */
    private String hostDeInicio() {
        Uri u = Uri.parse(INICIO);
        return u.getHost() == null ? "" : u.getHost();
    }

    private void sinBarras(boolean quitar) {
        View raiz = getWindow().getDecorView();
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.KITKAT) return;
        raiz.setSystemUiVisibility(quitar
                ? View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                : View.SYSTEM_UI_FLAG_VISIBLE);
    }

    /**
     * ATRÁS: primero cierra el vídeo a pantalla completa, luego deshace un paso
     * dentro de la web, y solo cuando no queda nada que deshacer, sale.
     */
    @Override
    public boolean onKeyDown(int tecla, KeyEvent evento) {
        if (tecla == KeyEvent.KEYCODE_BACK) {
            if (vistaEnPantallaCompleta != null) {
                web.getWebChromeClient().onHideCustomView();
                return true;
            }
            if (web != null && web.canGoBack()) {
                web.goBack();
                return true;
            }
        }
        return super.onKeyDown(tecla, evento);
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (web != null) web.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
