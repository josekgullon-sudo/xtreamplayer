package app.totalplayer.tvnativo;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import android.widget.ImageView;
import android.widget.TextView;
import android.widget.Toast;

import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

/**
 * El menú: elegir qué se quiere ver.
 *
 * Es la pantalla que faltaba. Al entrar se caía directamente en una lista de
 * carpetas de canales, y las películas y las series del proveedor no
 * aparecían por ninguna parte, aunque estuvieran pagadas.
 */
public class InicioActivity extends Activity {

    /** Las secciones que el proveedor no sirve: se enseñan, pero no abren. */
    private final Set<String> vacias = new HashSet<>();

    @Override protected void onCreate(Bundle guardado) {
        super.onCreate(guardado);
        setContentView(R.layout.inicio);
        if (!Guardia.haySesion(this)) return;

        Sesion s = Sesion.actual();
        // El nombre del proveedor manda sobre el nuestro: es su tele
        ((TextView) findViewById(R.id.marca))
                .setText((s.marca.isEmpty() ? "TOTALplayer" : s.marca).toUpperCase(Locale.getDefault()));

        String quien = s.perfil.isEmpty() ? s.entradaUsuario : s.perfil;
        ((TextView) findViewById(R.id.saludo)).setText(
                quien.isEmpty() ? "¿Qué te apetece ver?" : "Hola, " + quien + ". ¿Qué te apetece ver?");
        ((TextView) findViewById(R.id.textoSalir)).setText(
                quien.isEmpty() ? "Cambiar de cuenta" : "No soy " + quien);

        preparar(R.id.tarjetaDirecto, R.drawable.ic_tv, "TV en directo", Catalogo.DIRECTO);
        preparar(R.id.tarjetaPelis, R.drawable.ic_cine, "Películas", Catalogo.PELIS);
        preparar(R.id.tarjetaSeries, R.drawable.ic_series, "Series", Catalogo.SERIES);

        findViewById(R.id.botonBuscar).setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                startActivity(new Intent(InicioActivity.this, BuscarActivity.class));
            }
        });
        findViewById(R.id.botonActualizar).setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                Catalogo.vaciar();
                recargar();
                Toast.makeText(InicioActivity.this, "Actualizando tus listas…", Toast.LENGTH_SHORT).show();
            }
        });
        findViewById(R.id.botonSalir).setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                Sesion s = Sesion.actual();
                if (!s.galleta.isEmpty()) {
                    /* Con perfiles, «no soy este» es cambiar de perfil, no
                       cerrar la sesión: volver a escribir la contraseña con
                       el mando para pasarle la tele a otro es un castigo */
                    s.fijarPerfil(InicioActivity.this, false);
                    startActivity(new Intent(InicioActivity.this, PerfilesActivity.class));
                } else {
                    Sesion.olvidar(InicioActivity.this);
                    startActivity(new Intent(InicioActivity.this, AccesoActivity.class));
                }
                finish();
            }
        });

        /*
         * El camino del mando, dicho a mano.
         *
         * Buscarlo solo por geometría funciona hasta que una tarjeta se
         * queda sin foco —un proveedor sin películas la apaga— y entonces
         * derecha desde la primera se salta a la tercera sin avisar. Escrito
         * así, el orden es siempre el que se ve.
         */
        encadenar(R.id.tarjetaDirecto, R.id.tarjetaPelis);
        encadenar(R.id.tarjetaPelis, R.id.tarjetaSeries);
        encadenar(R.id.botonBuscar, R.id.botonActualizar);
        encadenar(R.id.botonActualizar, R.id.botonSalir);
        findViewById(R.id.tarjetaSeries).setNextFocusRightId(R.id.tarjetaSeries);
        findViewById(R.id.tarjetaDirecto).setNextFocusLeftId(R.id.tarjetaDirecto);

        findViewById(R.id.tarjetaDirecto).requestFocus();
    }

    /** Deja «derecha» en uno y «izquierda» en el otro, en los dos sentidos. */
    private void encadenar(int izquierda, int derecha) {
        findViewById(izquierda).setNextFocusRightId(derecha);
        findViewById(derecha).setNextFocusLeftId(izquierda);
    }

    private void preparar(int cual, int icono, final String titulo, final String seccion) {
        final View tarjeta = findViewById(cual);
        ((ImageView) tarjeta.findViewById(R.id.icono)).setImageResource(icono);
        ((TextView) tarjeta.findViewById(R.id.titulo)).setText(titulo);
        final TextView detalle = tarjeta.findViewById(R.id.detalle);
        detalle.setText("Cargando…");
        Foco.agrandar(tarjeta, 1.04f);

        tarjeta.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                // Una tarjeta vacía se puede enfocar, pero no lleva a ninguna parte
                if (vacias.contains(seccion)) return;
                Intent i = new Intent(InicioActivity.this,
                        Catalogo.DIRECTO.equals(seccion) ? DirectoActivity.class : VodActivity.class);
                i.putExtra("seccion", seccion);
                i.putExtra("titulo", titulo);
                startActivity(i);
            }
        });

        /*
         * Mantener pulsado actualiza esa sección.
         *
         * El proveedor añade canales y quita otros, y el catálogo se guarda
         * en memoria para que moverse sea instantáneo. Sin esto, la única
         * manera de ver lo nuevo era cerrar la aplicación entera.
         */
        tarjeta.setOnLongClickListener(new View.OnLongClickListener() {
            @Override public boolean onLongClick(View v) {
                Catalogo.olvidarSeccion(seccion);
                detalle.setText("Actualizando…");
                contar(tarjeta, detalle, seccion);
                Toast.makeText(InicioActivity.this,
                        "Actualizando " + titulo.toLowerCase(Locale.getDefault()) + "…",
                        Toast.LENGTH_SHORT).show();
                return true;
            }
        });

        contar(tarjeta, detalle, seccion);
    }

    /** Vuelve a preguntar por las tres secciones. */
    private void recargar() {
        preparar(R.id.tarjetaDirecto, R.drawable.ic_tv, "TV en directo", Catalogo.DIRECTO);
        preparar(R.id.tarjetaPelis, R.drawable.ic_cine, "Películas", Catalogo.PELIS);
        preparar(R.id.tarjetaSeries, R.drawable.ic_series, "Series", Catalogo.SERIES);
    }

    private void contar(final View tarjeta, final TextView detalle, final String seccion) {
        /*
         * Cuántas carpetas hay dentro. No es un adorno: un proveedor que no
         * vende películas deja esa tarjeta vacía, y decirlo aquí ahorra
         * entrar, esperar y encontrarse la nada.
         */
        Hilos.fuera(new Hilos.Trabajo<Integer>() {
            @Override public Integer hacer() throws Exception { return Catalogo.carpetas(seccion).size(); }
        }, new Hilos.Luego<Integer>() {
            @Override public void listo(Integer cuantas) {
                vacias.remove(seccion);
                tarjeta.setAlpha(1f);
                if (cuantas == 0) {
                    /* Apagada, pero enfocable: quitarle el foco a una tarjeta
                       del medio parte el camino del mando y deja la de al
                       lado inalcanzable */
                    vacias.add(seccion);
                    detalle.setText("Tu proveedor no ofrece esto");
                    tarjeta.setAlpha(0.45f);
                } else {
                    detalle.setText(cuantas + (cuantas == 1 ? " categoría" : " categorías"));
                }
            }
            @Override public void falla(Exception e) {
                detalle.setText("No se ha podido consultar");
                vacias.add(seccion);
            }
        });
    }

    /** Desde el menú, atrás sale de la aplicación: no hay dónde volver. */
    @Override public void onBackPressed() {
        finish();
    }
}
