package app.totalplayer.tvnativo;

import android.app.Activity;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.KeyEvent;
import android.view.View;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ListView;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.ui.PlayerView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * El reproductor nativo de Android TV y Fire TV.
 *
 * Existe porque el envoltorio de WebView reproduce con hls.js y mpegts.js,
 * que desmontan el flujo en JavaScript, por software y en el hilo principal.
 * Y hay dos cosas que ahí no se pueden hacer de ninguna manera: H.265 —que
 * hoy trae media lista de proveedor— y el audio AC3/E-AC3, que Chromium no
 * lleva. ExoPlayer usa el decodificador del aparato y trae las dos.
 *
 * Se entra con el usuario y la contraseña del proveedor, igual que en la
 * web: quién guarda a qué servidor va cada cliente es el panel, no el
 * cliente. Ver Acceso.
 */
public class MainActivity extends Activity {

    private static final String AJUSTES = "totalplayer.tv.nativo";

    /*
     * Muchos servidores IPTV miran quién les pide el flujo y cuelgan a los
     * que no reconocen. VLC es el que todos dejan pasar, así que es el que
     * decimos ser: no es un truco, es lo que hace cualquier reproductor de
     * este tipo para que el proveedor no le cierre la puerta.
     */
    private static final String QUIEN_SOY = "VLC/3.0.20 LibVLC/3.0.20";

    private ExoPlayer reproductor;
    private PlayerView vista;
    private ListView listaCarpetas, listaCanales;
    private ScrollView pantallaAcceso;
    private LinearLayout pantallaVer, bloquePropia;
    private TextView aviso;
    private EditText campoUsuario, campoClave, campoServidor;

    /** Las carpetas, en el orden en que las manda el proveedor. */
    private final Map<String, List<Canal>> carpetas = new LinkedHashMap<>();
    private final List<Canal> visibles = new ArrayList<>();
    private final ExecutorService hilos = Executors.newSingleThreadExecutor();
    private final Handler enPantalla = new Handler(Looper.getMainLooper());

    private static class Canal {
        final String nombre, url;
        Canal(String nombre, String url) { this.nombre = nombre; this.url = url; }
        @Override public String toString() { return nombre; }
    }

    @Override
    protected void onCreate(Bundle guardado) {
        super.onCreate(guardado);
        setContentView(R.layout.main);

        pantallaAcceso = findViewById(R.id.pantallaAcceso);
        pantallaVer = findViewById(R.id.pantallaVer);
        bloquePropia = findViewById(R.id.bloquePropia);
        vista = findViewById(R.id.vista);
        listaCarpetas = findViewById(R.id.listaCarpetas);
        listaCanales = findViewById(R.id.listaCanales);
        aviso = findViewById(R.id.aviso);
        campoUsuario = findViewById(R.id.campoUsuario);
        campoClave = findViewById(R.id.campoClave);
        campoServidor = findViewById(R.id.campoServidor);

        final SharedPreferences ajustes = getSharedPreferences(AJUSTES, MODE_PRIVATE);
        campoUsuario.setText(ajustes.getString("usuario", ""));
        campoClave.setText(ajustes.getString("clave", ""));
        campoServidor.setText(ajustes.getString("servidor", ""));

        findViewById(R.id.botonPropia).setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                bloquePropia.setVisibility(View.VISIBLE);
                campoServidor.requestFocus();
            }
        });

        final Button entrar = findViewById(R.id.botonEntrar);
        entrar.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                String usuario = campoUsuario.getText().toString().trim();
                String clave = campoClave.getText().toString().trim();
                String propio = campoServidor.getText().toString().trim();
                if (usuario.isEmpty() || clave.isEmpty()) {
                    aviso.setText("Escribe el usuario y la contraseña que te dio tu proveedor");
                    return;
                }
                ajustes.edit()
                        .putString("usuario", usuario)
                        .putString("clave", clave)
                        .putString("servidor", propio)
                        .apply();
                aviso.setText("Entrando…");
                entrar(usuario, clave, propio, ajustes);
            }
        });

        listaCarpetas.setOnItemClickListener((p, v, i, id) -> abrirCarpeta(i));
        listaCanales.setOnItemClickListener((p, v, i, id) -> reproducir(visibles.get(i)));

        // Si ya se entró antes, no se vuelve a preguntar
        if (!ajustes.getString("usuario", "").isEmpty()) entrar.performClick();
    }

    /**
     * Entrar: contra el panel si no se ha escrito un servidor propio, y
     * contra ese servidor si sí.
     */
    private void entrar(final String usuario, final String clave, final String propio,
                        final SharedPreferences ajustes) {
        hilos.execute(new Runnable() {
            @Override public void run() {
                try {
                    final String servidor, u, c;
                    if (propio.isEmpty()) {
                        /* Una llave por aparato, estable: el cupo de
                           dispositivos del cliente cuenta teles, no arranques */
                        String llave = ajustes.getString("aparato", "");
                        if (llave.isEmpty()) {
                            llave = "tv-" + UUID.randomUUID().toString().substring(0, 12);
                            ajustes.edit().putString("aparato", llave).apply();
                        }
                        Acceso.Lista lista = Acceso.entrar(usuario, clave, llave);
                        if (!"xtream".equals(lista.tipo)) {
                            throw new Acceso.NoEntra("Tu lista es M3U y esta versión todavía solo abre Xtream");
                        }
                        servidor = normalizar(lista.url);
                        u = lista.usuario;
                        c = lista.clave;
                    } else {
                        servidor = normalizar(propio);
                        u = usuario;
                        c = clave;
                    }
                    cargar(servidor, u, c);
                } catch (final Exception e) {
                    final String porque = (e instanceof Acceso.NoEntra && e.getMessage() != null)
                            ? e.getMessage()
                            : "No hemos podido conectar. Comprueba tu conexión y vuelve a intentarlo.";
                    enPantalla.post(new Runnable() {
                        @Override public void run() { aviso.setText(porque); }
                    });
                }
            }
        });
    }

    private static String normalizar(String servidor) {
        String s = servidor.trim();
        if (!s.startsWith("http")) s = "http://" + s;
        while (s.endsWith("/")) s = s.substring(0, s.length() - 1);
        return s;
    }

    /** Pide categorías y canales y los agrupa. Siempre fuera del hilo de la interfaz. */
    private void cargar(final String servidor, final String usuario, final String clave) throws Exception {
        String base = servidor + "/player_api.php?username=" + URLEncoder.encode(usuario, "UTF-8")
                + "&password=" + URLEncoder.encode(clave, "UTF-8");

        Map<String, String> nombreDeCat = new LinkedHashMap<>();
        JSONArray cats = new JSONArray(pedir(base + "&action=get_live_categories"));
        for (int i = 0; i < cats.length(); i++) {
            JSONObject c = cats.getJSONObject(i);
            nombreDeCat.put(c.optString("category_id", ""), c.optString("category_name", "Otros"));
        }

        JSONArray flujos = new JSONArray(pedir(base + "&action=get_live_streams"));
        final Map<String, List<Canal>> nuevas = new LinkedHashMap<>();
        // El orden de las carpetas lo ha puesto el proveedor a propósito
        for (String nombre : nombreDeCat.values()) nuevas.put(nombre, new ArrayList<Canal>());

        for (int i = 0; i < flujos.length(); i++) {
            JSONObject ch = flujos.getJSONObject(i);
            String nombre = ch.optString("name", "").trim();
            String id = ch.optString("stream_id", "");
            if (nombre.isEmpty() || id.isEmpty()) continue;
            String carpeta = nombreDeCat.get(ch.optString("category_id", ""));
            if (carpeta == null) carpeta = "Otros";
            List<Canal> donde = nuevas.get(carpeta);
            if (donde == null) { donde = new ArrayList<Canal>(); nuevas.put(carpeta, donde); }
            /* .ts es el formato del directo en Xtream, y justo el que un
               navegador no sabe reproducir sin desmontarlo en JavaScript */
            donde.add(new Canal(nombre, servidor + "/live/" + usuario + "/" + clave + "/" + id + ".ts"));
        }

        enPantalla.post(new Runnable() {
            @Override public void run() {
                carpetas.clear();
                // Las carpetas que se quedan vacías no se enseñan
                for (Map.Entry<String, List<Canal>> e : nuevas.entrySet()) {
                    if (!e.getValue().isEmpty()) carpetas.put(e.getKey(), e.getValue());
                }
                if (carpetas.isEmpty()) {
                    aviso.setText("La cuenta entra, pero no trae ningún canal. Suele ser que la suscripción ha caducado.");
                    return;
                }
                listaCarpetas.setAdapter(new ArrayAdapter<String>(
                        MainActivity.this, R.layout.fila_canal, R.id.nombreCanal,
                        new ArrayList<String>(carpetas.keySet())));
                pantallaAcceso.setVisibility(View.GONE);
                pantallaVer.setVisibility(View.VISIBLE);
                abrirCarpeta(0);
                listaCarpetas.requestFocus();
            }
        });
    }

    private void abrirCarpeta(int cual) {
        List<String> nombres = new ArrayList<String>(carpetas.keySet());
        if (cual < 0 || cual >= nombres.size()) return;
        visibles.clear();
        visibles.addAll(carpetas.get(nombres.get(cual)));
        listaCanales.setAdapter(new ArrayAdapter<Canal>(this, R.layout.fila_canal, R.id.nombreCanal, visibles));
    }

    private String pedir(String direccion) throws Exception {
        HttpURLConnection con = (HttpURLConnection) new URL(direccion).openConnection();
        con.setConnectTimeout(15000);
        con.setReadTimeout(20000);
        con.setRequestProperty("User-Agent", QUIEN_SOY);
        try {
            StringBuilder sb = new StringBuilder();
            BufferedReader r = new BufferedReader(new InputStreamReader(con.getInputStream(), "UTF-8"));
            String linea;
            while ((linea = r.readLine()) != null) sb.append(linea);
            r.close();
            return sb.toString();
        } finally {
            con.disconnect();
        }
    }

    private void reproducir(Canal canal) {
        if (reproductor == null) {
            /*
             * Las dos razones por las que un canal se queda en negro:
             *
             * - El servidor contesta con una redirección, a veces de http a
             *   https, y ExoPlayer no las sigue entre protocolos si no se le
             *   dice. En IPTV redirigir es la norma, no la excepción.
             * - El servidor mira quién pide y cuelga a los desconocidos.
             */
            DefaultHttpDataSource.Factory red = new DefaultHttpDataSource.Factory()
                    .setUserAgent(QUIEN_SOY)
                    .setAllowCrossProtocolRedirects(true)
                    .setConnectTimeoutMs(15000)
                    .setReadTimeoutMs(20000);

            reproductor = new ExoPlayer.Builder(this)
                    .setMediaSourceFactory(new DefaultMediaSourceFactory(red))
                    .build();
            vista.setPlayer(reproductor);
            vista.setUseController(false);
            reproductor.addListener(new Player.Listener() {
                @Override public void onPlayerError(PlaybackException error) {
                    /* Que diga qué ha pasado: en una tele, una pantalla negra
                       y muda es indistinguible de un aparato colgado */
                    Toast.makeText(MainActivity.this,
                            "No ha arrancado: " + error.getErrorCodeName(),
                            Toast.LENGTH_LONG).show();
                }
            });
        }
        reproductor.setMediaItem(MediaItem.fromUri(Uri.parse(canal.url)));
        reproductor.prepare();
        reproductor.play();
    }

    /** Atrás: de los canales a las carpetas, y solo entonces sale. */
    @Override
    public boolean onKeyDown(int tecla, KeyEvent evento) {
        if (tecla == KeyEvent.KEYCODE_BACK && pantallaVer.getVisibility() == View.VISIBLE
                && !listaCarpetas.hasFocus()) {
            listaCarpetas.requestFocus();
            return true;
        }
        return super.onKeyDown(tecla, evento);
    }

    @Override
    protected void onStop() {
        super.onStop();
        if (reproductor != null) reproductor.pause();
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (reproductor != null) {
            reproductor.release();
            reproductor = null;
        }
        hilos.shutdownNow();
    }
}
