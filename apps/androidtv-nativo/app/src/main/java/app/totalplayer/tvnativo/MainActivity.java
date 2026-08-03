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
import android.widget.TextView;
import android.widget.Toast;

import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.ui.PlayerView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * El reproductor nativo de Android TV y Fire TV.
 *
 * Existe para responder a una pregunta que el envoltorio de WebView no puede
 * responder bien: ¿va fluido un canal de verdad en un aparato de verdad?
 *
 * El WebView reproduce con hls.js y mpegts.js, que desmontan el flujo en
 * JavaScript, por software y en el hilo principal. Y hay dos cosas que ahí
 * no se pueden hacer de ninguna manera: H.265 —que hoy trae media lista de
 * proveedor— y el audio AC3/E-AC3, que Chromium no lleva. ExoPlayer usa el
 * decodificador del aparato y las trae de fábrica.
 *
 * Esto es a propósito lo mínimo para medir eso: entrar, ver la lista de
 * canales y reproducir. Sin guía, sin favoritos, sin cine ni series. Si en
 * un Fire TV Stick esto va donde el WebView se atraganta, la tesis queda
 * probada y merece la pena construir encima; si no, hemos perdido poco.
 */
public class MainActivity extends Activity {

    private static final String AJUSTES = "totalplayer.tv.nativo";

    private ExoPlayer reproductor;
    private PlayerView vista;
    private ListView listaCanales;
    private LinearLayout pantallaAcceso, pantallaVer;
    private TextView aviso;

    private final List<Canal> canales = new ArrayList<>();
    private final ExecutorService hilos = Executors.newSingleThreadExecutor();
    private final Handler enPantalla = new Handler(Looper.getMainLooper());

    /** Un canal: lo justo para pintarlo en la lista y poder reproducirlo. */
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
        vista = findViewById(R.id.vista);
        listaCanales = findViewById(R.id.listaCanales);
        aviso = findViewById(R.id.aviso);

        final EditText campoServidor = findViewById(R.id.campoServidor);
        final EditText campoUsuario = findViewById(R.id.campoUsuario);
        final EditText campoClave = findViewById(R.id.campoClave);
        Button botonEntrar = findViewById(R.id.botonEntrar);

        /* Escribir con el mando es un suplicio: se recuerda lo de la última
           vez para que solo haya que hacerlo una */
        final SharedPreferences ajustes = getSharedPreferences(AJUSTES, MODE_PRIVATE);
        campoServidor.setText(ajustes.getString("servidor", ""));
        campoUsuario.setText(ajustes.getString("usuario", ""));
        campoClave.setText(ajustes.getString("clave", ""));

        botonEntrar.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                String servidor = campoServidor.getText().toString().trim();
                String usuario = campoUsuario.getText().toString().trim();
                String clave = campoClave.getText().toString().trim();
                if (servidor.isEmpty() || usuario.isEmpty() || clave.isEmpty()) {
                    aviso.setText("Faltan datos: servidor, usuario y contraseña");
                    return;
                }
                if (!servidor.startsWith("http")) servidor = "http://" + servidor;
                ajustes.edit()
                        .putString("servidor", servidor)
                        .putString("usuario", usuario)
                        .putString("clave", clave)
                        .apply();
                aviso.setText("Conectando…");
                cargarCanales(servidor, usuario, clave);
            }
        });

        listaCanales.setOnItemClickListener((padre, v, posicion, id) -> reproducir(canales.get(posicion)));

        // Si ya se entró antes, no se vuelve a preguntar
        if (!ajustes.getString("servidor", "").isEmpty()) botonEntrar.performClick();
    }

    /**
     * Pide la lista al panel del proveedor.
     *
     * Fuera del hilo principal: con 8.000 canales, hacerlo en el de la
     * interfaz deja la tele congelada mientras baja y se analiza.
     */
    private void cargarCanales(final String servidor, final String usuario, final String clave) {
        hilos.execute(new Runnable() {
            @Override public void run() {
                try {
                    String base = servidor + "/player_api.php?username=" + URLEncoder.encode(usuario, "UTF-8")
                            + "&password=" + URLEncoder.encode(clave, "UTF-8");
                    JSONArray flujos = new JSONArray(pedir(base + "&action=get_live_streams"));

                    final List<Canal> nuevos = new ArrayList<>();
                    for (int i = 0; i < flujos.length(); i++) {
                        JSONObject c = flujos.getJSONObject(i);
                        String nombre = c.optString("name", "").trim();
                        String id = c.optString("stream_id", "");
                        if (nombre.isEmpty() || id.isEmpty()) continue;
                        /* El .ts es el formato del directo en Xtream, y es
                           justo el que un navegador no sabe reproducir sin
                           desmontarlo en JavaScript. ExoPlayer sí. */
                        nuevos.add(new Canal(nombre, servidor + "/live/" + usuario + "/" + clave + "/" + id + ".ts"));
                    }

                    enPantalla.post(new Runnable() {
                        @Override public void run() {
                            if (nuevos.isEmpty()) {
                                aviso.setText("La cuenta entra, pero no trae ningún canal");
                                return;
                            }
                            canales.clear();
                            canales.addAll(nuevos);
                            listaCanales.setAdapter(new ArrayAdapter<>(
                                    MainActivity.this, R.layout.fila_canal, R.id.nombreCanal, canales));
                            pantallaAcceso.setVisibility(View.GONE);
                            pantallaVer.setVisibility(View.VISIBLE);
                            listaCanales.requestFocus();
                            reproducir(canales.get(0));
                        }
                    });
                } catch (final Exception e) {
                    enPantalla.post(new Runnable() {
                        @Override public void run() {
                            aviso.setText("No hemos podido conectar. Comprueba los datos y la conexión.");
                        }
                    });
                }
            }
        });
    }

    private String pedir(String direccion) throws Exception {
        HttpURLConnection con = (HttpURLConnection) new URL(direccion).openConnection();
        con.setConnectTimeout(15000);
        con.setReadTimeout(20000);
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
            reproductor = new ExoPlayer.Builder(this).build();
            vista.setPlayer(reproductor);
            vista.setUseController(false);
            reproductor.addListener(new Player.Listener() {
                @Override public void onPlayerError(PlaybackException error) {
                    /* Que diga qué ha pasado en vez de quedarse en negro: en
                       una tele, una pantalla negra y muda es indistinguible
                       de un aparato colgado */
                    Toast.makeText(MainActivity.this,
                            "Este canal no ha arrancado: " + error.getErrorCodeName(),
                            Toast.LENGTH_LONG).show();
                }
            });
        }
        reproductor.setMediaItem(MediaItem.fromUri(Uri.parse(canal.url)));
        reproductor.prepare();
        reproductor.play();
    }

    /** Atrás: primero suelta el vídeo y vuelve a la lista; solo entonces sale. */
    @Override
    public boolean onKeyDown(int tecla, KeyEvent evento) {
        if (tecla == KeyEvent.KEYCODE_BACK && pantallaVer.getVisibility() == View.VISIBLE
                && !listaCanales.hasFocus()) {
            listaCanales.requestFocus();
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
