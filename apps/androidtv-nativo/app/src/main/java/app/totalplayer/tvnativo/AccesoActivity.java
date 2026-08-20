package app.totalplayer.tvnativo;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.view.View;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * La puerta de entrada.
 *
 * Usuario y contraseña, los mismos que en la web. Quien no tenga proveedor
 * aquí puede desplegar el bloque de la lista propia, que admite tanto un
 * servidor Xtream como un enlace M3U.
 */
public class AccesoActivity extends Activity {

    private EditText campoUsuario, campoClave, campoServidor;
    private TextView aviso, textoCargando, porQueNo;
    private LinearLayout bloquePropia, cargando;

    @Override protected void onCreate(Bundle guardado) {
        super.onCreate(guardado);
        Pantalla.colocar(this);
        setContentView(R.layout.acceso);

        Marca.nombre((TextView) findViewById(R.id.nombreMarca));
        campoUsuario = findViewById(R.id.campoUsuario);
        campoClave = findViewById(R.id.campoClave);
        campoServidor = findViewById(R.id.campoServidor);
        aviso = findViewById(R.id.aviso);
        porQueNo = findViewById(R.id.porQueNo);
        bloquePropia = findViewById(R.id.bloquePropia);
        cargando = findViewById(R.id.cargando);
        textoCargando = findViewById(R.id.textoCargando);

        final SharedPreferences ajustes = Sesion.ajustes(this);
        campoUsuario.setText(ajustes.getString("usuario", ""));
        campoClave.setText(ajustes.getString("clave", ""));
        campoServidor.setText(ajustes.getString("servidor", ""));
        if (!ajustes.getString("servidor", "").isEmpty()) bloquePropia.setVisibility(View.VISIBLE);

        findViewById(R.id.botonPropia).setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                bloquePropia.setVisibility(View.VISIBLE);
                campoServidor.requestFocus();
            }
        });

        final TextView entrar = findViewById(R.id.botonEntrar);
        entrar.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { intentar(); }
        });

        // Si ya se entró antes, no se vuelve a preguntar: encender la tele y
        // tener que escribir la contraseña con el mando es lo que hace que la
        // gente no vuelva a abrir la aplicación
        if (!ajustes.getString("usuario", "").isEmpty()) intentar();
        else campoUsuario.requestFocus();
    }

    private void intentar() {
        final String usuario = campoUsuario.getText().toString().trim();
        final String clave = campoClave.getText().toString().trim();
        final String propio = Web.normalizar(campoServidor.getText().toString());

        if (usuario.isEmpty() && propio.isEmpty()) {
            decirPorQueNo("Escribe el usuario y la contraseña que te dio tu proveedor.");
            campoUsuario.requestFocus();
            return;
        }
        porQueNo.setVisibility(View.GONE);

        cargando.setVisibility(View.VISIBLE);
        textoCargando.setText(propio.isEmpty() ? "Entrando…" : "Conectando con tu servidor…");

        Hilos.fuera(new Hilos.Trabajo<Sesion>() {
            @Override public Sesion hacer() throws Exception {
                Sesion s = Sesion.actual();
                s.entradaUsuario = usuario;
                s.entradaClave = clave;
                s.entradaServidor = propio;

                if (propio.isEmpty()) {
                    /* Entrando con el usuario del proveedor: la lista la
                       administra la plataforma y su dirección no baja aquí */
                    Acceso.Lista lista = Acceso.entrar(usuario, clave, Sesion.llaveDelAparato(AccesoActivity.this));
                    s.gestionada = true;
                    s.tipo = Sesion.M3U.equals(lista.tipo) ? Sesion.M3U : Sesion.XTREAM;
                    s.servidor = "";
                    s.usuario = "";
                    s.clave = "";
                    s.marca = lista.marca;
                    s.galleta = lista.galleta;
                } else if (pareceM3u(propio)) {
                    // Lista escrita aquí: es suya y la conoce, no hay nada que tapar
                    s.gestionada = false;
                    s.tipo = Sesion.M3U;
                    s.servidor = propio;
                    s.usuario = usuario;
                    s.clave = clave;
                    s.marca = "";
                    s.galleta = "";
                } else {
                    s.gestionada = false;
                    s.tipo = Sesion.XTREAM;
                    s.servidor = propio;
                    s.usuario = usuario;
                    s.clave = clave;
                    s.marca = "";
                    s.galleta = "";
                }

                /* Pedir ya las carpetas del directo: si las credenciales están
                   mal o la lista ha caducado, se sabe aquí y no tres pantallas
                   más adelante con un «no hay canales» que no explica nada */
                if (Catalogo.carpetas(Catalogo.DIRECTO).isEmpty()
                        && Catalogo.carpetas(Catalogo.PELIS).isEmpty()) {
                    throw new Acceso.NoEntra(
                            "La cuenta entra, pero no trae ningún contenido. Suele ser que la suscripción ha caducado.");
                }
                return s;
            }
        }, new Hilos.Luego<Sesion>() {
            @Override public void listo(Sesion s) {
                s.guardar(AccesoActivity.this);
                /* Con cuenta de proveedor se pasa por los perfiles, como en la
                   web. Con lista propia no hay perfiles que elegir. */
                boolean hayPerfiles = !s.galleta.isEmpty();
                startActivity(new Intent(AccesoActivity.this,
                        hayPerfiles ? PerfilesActivity.class : InicioActivity.class));
                finish();
            }
            @Override public void falla(Exception e) {
                cargando.setVisibility(View.GONE);
                Catalogo.vaciar();
                decirPorQueNo(Hilos.enCristiano(e));
                campoUsuario.requestFocus();
            }
        });
    }

    private void decirPorQueNo(String porque) {
        porQueNo.setText(porque);
        porQueNo.setVisibility(View.VISIBLE);
    }

    /** Un enlace de lista, no un servidor: get.php y los .m3u de siempre. */
    private static boolean pareceM3u(String url) {
        String u = url.toLowerCase();
        return u.contains("get.php") || u.contains(".m3u") || u.contains("type=m3u");
    }
}
