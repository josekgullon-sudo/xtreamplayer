package app.totalplayer.tvnativo;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import android.widget.ProgressBar;
import android.widget.TextView;

import androidx.recyclerview.widget.GridLayoutManager;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import java.util.ArrayList;
import java.util.List;

/**
 * Películas y series: carpetas a la izquierda, carteles a la derecha.
 *
 * La misma pantalla sirve para las dos porque se usan igual; lo único que
 * cambia es adónde lleva pulsar un cartel.
 */
public class VodActivity extends Activity {

    private String seccion = Catalogo.PELIS;
    private RecyclerView listaCarpetas, rejilla;
    private AdaptadorCarpetas carpetas;
    private AdaptadorCarteles carteles;
    private TextView tituloCarpeta, vacio, cuantos;
    private View bloqueVacio;
    private ProgressBar girando;
    private Runnable pendiente;
    private View columnaCarpetasVista, columnaRejilla;
    private boolean enMovil = false;
    private boolean yaHuboUnaCarpeta = false;

    @Override protected void onCreate(Bundle guardado) {
        super.onCreate(guardado);
        Pantalla.colocar(this);
        setContentView(R.layout.vod);
        if (!Guardia.haySesion(this)) return;

        seccion = getIntent().getStringExtra("seccion");
        if (seccion == null) seccion = Catalogo.PELIS;
        String titulo = getIntent().getStringExtra("titulo");

        ((TextView) findViewById(R.id.tituloSeccion))
                .setText(titulo == null ? "" : titulo.toUpperCase());
        tituloCarpeta = findViewById(R.id.tituloCarpeta);
        vacio = findViewById(R.id.vacio);
        cuantos = findViewById(R.id.cuantos);
        bloqueVacio = findViewById(R.id.bloqueVacio);
        findViewById(R.id.botonReintentar).setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                Catalogo.olvidarSeccion(seccion);
                bloqueVacio.setVisibility(View.GONE);
                cargarCarpetas();
            }
        });
        girando = findViewById(R.id.girando);
        listaCarpetas = findViewById(R.id.listaCarpetas);
        columnaCarpetasVista = findViewById(R.id.columnaCarpetas);
        columnaRejilla = findViewById(R.id.columnaRejilla);
        enMovil = Pantalla.esMovil(this);
        if (enMovil) verCarpetas(true);
        rejilla = findViewById(R.id.rejilla);

        listaCarpetas.setLayoutManager(new LinearLayoutManager(this));
        listaCarpetas.setItemAnimator(null);
        rejilla.setLayoutManager(new GridLayoutManager(this, cuantosCaben()));
        rejilla.setItemAnimator(null);
        // Lo enfocado crece: sin esto, la rejilla le recorta el borde
        rejilla.setClipChildren(false);

        carpetas = new AdaptadorCarpetas(new AdaptadorCarpetas.AlPosarse() {
            @Override public void en(int posicion) { abrirCarpeta(posicion); }
        });
        carteles = new AdaptadorCarteles(new AdaptadorCarteles.AlElegir() {
            @Override public void ficha(int posicion) { abrirFicha(posicion); }
        });
        listaCarpetas.setAdapter(carpetas);
        rejilla.setAdapter(carteles);

        cargarCarpetas();
    }

    /**
     * Cuántos carteles caben por fila.
     *
     * A ojo no vale: una tele de 1080p da 960dp de ancho y una de 4K con
     * otra densidad da otra cosa, y un número fijo deja o media pantalla
     * vacía o una columna cortada por la mitad.
     */
    private int cuantosCaben() {
        float porPunto = getResources().getDisplayMetrics().density;
        int anchoDp = (int) (getResources().getDisplayMetrics().widthPixels / porPunto);
        // En el teléfono la rejilla ocupa la pantalla entera; en la tele hay
        // que descontar la columna de categorías
        int paraCarteles = enMovil ? anchoDp - 20 : anchoDp - 260 - 52;
        // 150 del cartel, 16 de sus márgenes y 12 del marco del foco
        return Math.max(2, paraCarteles / 178);
    }

    /** En el teléfono, o las categorías o las carátulas: no caben las dos. */
    private void verCarpetas(boolean si) {
        columnaCarpetasVista.setVisibility(si ? View.VISIBLE : View.GONE);
        columnaRejilla.setVisibility(si ? View.GONE : View.VISIBLE);
    }

    private void cargarCarpetas() {
        girando.setVisibility(View.VISIBLE);
        Hilos.fuera(new Hilos.Trabajo<List<Catalogo.Carpeta>>() {
            @Override public List<Catalogo.Carpeta> hacer() throws Exception {
                return Catalogo.carpetas(seccion);
            }
        }, new Hilos.Luego<List<Catalogo.Carpeta>>() {
            @Override public void listo(List<Catalogo.Carpeta> lista) {
                girando.setVisibility(View.GONE);
                if (lista.isEmpty()) {
                    vacio.setText(Catalogo.PELIS.equals(seccion)
                            ? "Tu proveedor no incluye películas en tu lista."
                            : "Tu proveedor no incluye series en tu lista.");
                    bloqueVacio.setVisibility(View.VISIBLE);
                    return;
                }
                carpetas.poner(lista);
                abrirCarpeta(0);
                if (!enMovil) listaCarpetas.requestFocus();
            }
            @Override public void falla(Exception e) {
                girando.setVisibility(View.GONE);
                vacio.setText(Hilos.enCristiano(e));
                bloqueVacio.setVisibility(View.VISIBLE);
                findViewById(R.id.botonReintentar).requestFocus();
            }
        });
    }

    private void abrirCarpeta(int cual) {
        final Catalogo.Carpeta carpeta = carpetas.cual(cual);
        if (carpeta == null) return;
        carpetas.marcar(listaCarpetas, cual);
        tituloCarpeta.setText(carpeta.nombre);
        cuantos.setText("");
        if (enMovil && yaHuboUnaCarpeta) verCarpetas(false);
        yaHuboUnaCarpeta = true;

        if (pendiente != null) Hilos.olvidar(pendiente);
        pendiente = new Runnable() {
            @Override public void run() {
                girando.setVisibility(View.VISIBLE);
                Hilos.fuera(new Hilos.Trabajo<List<Catalogo.Item>>() {
                    @Override public List<Catalogo.Item> hacer() throws Exception {
                        return Catalogo.contenido(seccion, carpeta.id);
                    }
                }, new Hilos.Luego<List<Catalogo.Item>>() {
                    @Override public void listo(List<Catalogo.Item> lista) {
                        girando.setVisibility(View.GONE);
                        if (!carpeta.nombre.contentEquals(tituloCarpeta.getText())) return;
                        carteles.poner(lista);
                        cuantos.setText(String.valueOf(lista.size()));
                        rejilla.scrollToPosition(0);
                        vacio.setText("Esta categoría está vacía.");
                        bloqueVacio.setVisibility(lista.isEmpty() ? View.VISIBLE : View.GONE);
                    }
                    @Override public void falla(Exception e) {
                        // Sin vaciar la rejilla: un corte de un segundo no es
                        // motivo para dejar la pantalla peor que antes
                        girando.setVisibility(View.GONE);
                        vacio.setText(Hilos.enCristiano(e));
                        bloqueVacio.setVisibility(View.VISIBLE);
                    }
                });
            }
        };
        Hilos.enPantallaDentroDe(pendiente, 220);
    }

    private void abrirFicha(int posicion) {
        Catalogo.Item it = carteles.enPosicion(posicion);
        if (it == null) return;
        Traspaso.ficha = it;
        startActivity(new Intent(this, FichaActivity.class));
    }

    @Override public void onBackPressed() {
        if (enMovil && columnaRejilla.getVisibility() == View.VISIBLE) {
            verCarpetas(true);
            return;
        }
        if (!enMovil && rejilla.hasFocus()) {
            listaCarpetas.requestFocus();
            return;
        }
        super.onBackPressed();
    }

    @Override protected void onDestroy() {
        super.onDestroy();
        if (pendiente != null) Hilos.olvidar(pendiente);
    }
}
