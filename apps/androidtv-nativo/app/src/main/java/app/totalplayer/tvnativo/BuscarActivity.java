package app.totalplayer.tvnativo;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.text.Editable;
import android.text.TextWatcher;
import android.widget.EditText;
import android.widget.TextView;

import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Buscar, en todo.
 *
 * Buscaba solo canales, y era la mitad de un buscador: quien escribe
 * «Gladiator» no está pensando en si eso es un canal, una película o una
 * serie, ni en qué carpeta lo puso su proveedor. Está pensando en
 * «Gladiator». Ahora mira en las tres secciones y cada resultado dice de
 * qué es, que es lo único que hace falta saber para elegir.
 *
 * Los canales van primero y salen enseguida —esa lista suele estar ya
 * pedida—; las películas y las series son la petición más gorda de la
 * aplicación y se meten cuando llegan, sin que nadie espere delante de una
 * pantalla en blanco.
 */
public class BuscarActivity extends Activity {

    /**
     * Las tres listas, cada una en su sitio.
     *
     * En un solo saco el orden de los resultados dependía de cuál de las tres
     * peticiones volviera antes, que es como decir de la red: la misma
     * búsqueda salía un día con las películas arriba y otro con los canales.
     * Separadas, el orden es siempre el mismo —canales, películas, series—
     * lo tarde que llegue cada una.
     */
    private final List<List<Catalogo.Item>> cajones = new ArrayList<>();
    private final List<Catalogo.Item> encontrados = new ArrayList<>();
    private AdaptadorCanales adaptador;
    private TextView cuantos;
    private EditText campo;
    /** Cuántas de las tres listas han llegado ya. */
    private int listasPuestas;

    @Override protected void onCreate(Bundle guardado) {
        super.onCreate(guardado);
        Pantalla.colocar(this);
        setContentView(R.layout.buscar);
        if (!Guardia.haySesion(this)) return;

        campo = findViewById(R.id.campo);
        cuantos = findViewById(R.id.cuantos);
        RecyclerView resultados = findViewById(R.id.resultados);
        resultados.setLayoutManager(new LinearLayoutManager(this));
        resultados.setItemAnimator(null);

        adaptador = new AdaptadorCanales(new AdaptadorCanales.AlElegir() {
            @Override public void canal(int posicion) { abrir(posicion); }
        });
        adaptador.conTipo(true);
        resultados.setAdapter(adaptador);

        cuantos.setText("Cargando tu lista…");
        for (int i = 0; i < 3; i++) cajones.add(new ArrayList<Catalogo.Item>());
        pedir(0, new Hilos.Trabajo<List<Catalogo.Item>>() {
            @Override public List<Catalogo.Item> hacer() throws Exception { return Catalogo.todoElDirecto(); }
        });
        pedir(1, new Hilos.Trabajo<List<Catalogo.Item>>() {
            @Override public List<Catalogo.Item> hacer() throws Exception { return Catalogo.todasLasPelis(); }
        });
        pedir(2, new Hilos.Trabajo<List<Catalogo.Item>>() {
            @Override public List<Catalogo.Item> hacer() throws Exception { return Catalogo.todasLasSeries(); }
        });

        campo.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int a, int b, int c) {}
            @Override public void onTextChanged(CharSequence s, int a, int b, int c) {}
            @Override public void afterTextChanged(Editable s) { filtrar(s.toString()); }
        });
    }

    /**
     * Una de las tres listas, con lo que hay que hacer cuando llegue.
     *
     * Las tres van a la vez y ninguna espera a las otras. Al llegar cada una
     * se rehace la búsqueda con lo que ya se había escrito: si alguien
     * escribió mientras se pedían las películas, la lista se completa sola
     * en lugar de quedarse corta hasta que vuelva a tocar una tecla.
     */
    private void pedir(final int cajon, Hilos.Trabajo<List<Catalogo.Item>> trabajo) {
        Hilos.fuera(trabajo, new Hilos.Luego<List<Catalogo.Item>>() {
            @Override public void listo(List<Catalogo.Item> lista) {
                cajones.get(cajon).addAll(lista);
                listasPuestas++;
                if (listasPuestas == 1) campo.requestFocus();
                filtrar(campo.getText().toString());
            }
            @Override public void falla(Exception e) {
                listasPuestas++;
                if (cuantos() == 0) cuantos.setText(Hilos.enCristiano(e));
                else filtrar(campo.getText().toString());
            }
        });
    }

    /** Cuántas cosas hay donde buscar, ahora mismo. */
    private int cuantos() {
        int n = 0;
        for (List<Catalogo.Item> cajon : cajones) n += cajon.size();
        return n;
    }

    private void abrir(int posicion) {
        if (posicion < 0 || posicion >= encontrados.size()) return;
        Catalogo.Item it = encontrados.get(posicion);
        /*
         * Un canal se ve; una película o una serie se abren por su ficha.
         *
         * Y al canal se le pasa de compañía solo los otros canales del
         * resultado, no la lista entera: la zapeo del reproductor va de uno
         * al siguiente, y encadenar «arriba» hasta caer en una serie no es
         * zapear, es perderse.
         */
        if (it.esSerie || Enlaces.PELICULA.equals(it.clase)) {
            Traspaso.ficha = it;
            startActivity(new Intent(this, FichaActivity.class));
            return;
        }
        List<Catalogo.Item> soloCanales = new ArrayList<>();
        int cual = 0;
        for (Catalogo.Item otro : encontrados) {
            if (otro.esSerie || Enlaces.PELICULA.equals(otro.clase)) continue;
            if (otro == it) cual = soloCanales.size();
            soloCanales.add(otro);
        }
        Traspaso.reproducir(soloCanales, cual);
        startActivity(new Intent(this, ReproductorActivity.class));
    }

    private void filtrar(String texto) {
        String busca = texto.trim().toLowerCase(Locale.getDefault());
        encontrados.clear();
        if (busca.isEmpty()) {
            adaptador.poner(encontrados);
            cuantos.setText(esperando());
            return;
        }
        for (List<Catalogo.Item> cajon : cajones) {
            for (Catalogo.Item it : cajon) {
                if (it.nombre.toLowerCase(Locale.getDefault()).contains(busca)) encontrados.add(it);
                // Con doscientos aciertos ya no se está buscando, se está mirando
                if (encontrados.size() >= 200) break;
            }
        }
        adaptador.poner(encontrados);
        cuantos.setText(encontrados.isEmpty()
                ? (listasPuestas < 3 ? "Buscando…" : "No hay nada que se llame así")
                : encontrados.size() + (encontrados.size() == 1 ? " resultado" : " resultados")
                        + (listasPuestas < 3 ? "  ·  buscando en el resto…" : ""));
    }

    /** Lo que se dice cuando no se ha escrito nada todavía. */
    private String esperando() {
        if (listasPuestas < 3) return "Cargando tu lista…";
        return cuantos() + " canales, películas y series donde buscar";
    }
}
