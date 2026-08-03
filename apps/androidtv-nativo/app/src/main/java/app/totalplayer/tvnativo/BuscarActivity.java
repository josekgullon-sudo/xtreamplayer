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
 * Buscar un canal por su nombre.
 *
 * En una lista de ocho mil canales repartidos en doscientas carpetas,
 * encontrar uno concreto yendo carpeta por carpeta no es una opción.
 */
public class BuscarActivity extends Activity {

    private final List<Catalogo.Item> todos = new ArrayList<>();
    private final List<Catalogo.Item> encontrados = new ArrayList<>();
    private AdaptadorCanales adaptador;
    private TextView cuantos;
    private EditText campo;

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
            @Override public void canal(int posicion) {
                if (posicion < 0 || posicion >= encontrados.size()) return;
                Traspaso.reproducir(encontrados, posicion);
                startActivity(new Intent(BuscarActivity.this, ReproductorActivity.class));
            }
        });
        resultados.setAdapter(adaptador);

        cuantos.setText("Cargando la lista de canales…");
        Hilos.fuera(new Hilos.Trabajo<List<Catalogo.Item>>() {
            @Override public List<Catalogo.Item> hacer() throws Exception { return Catalogo.todoElDirecto(); }
        }, new Hilos.Luego<List<Catalogo.Item>>() {
            @Override public void listo(List<Catalogo.Item> lista) {
                todos.clear();
                todos.addAll(lista);
                cuantos.setText(lista.size() + " canales en tu lista");
                campo.requestFocus();
            }
            @Override public void falla(Exception e) { cuantos.setText(Hilos.enCristiano(e)); }
        });

        campo.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int a, int b, int c) {}
            @Override public void onTextChanged(CharSequence s, int a, int b, int c) {}
            @Override public void afterTextChanged(Editable s) { filtrar(s.toString()); }
        });
    }

    private void filtrar(String texto) {
        String busca = texto.trim().toLowerCase(Locale.getDefault());
        encontrados.clear();
        if (busca.isEmpty()) {
            adaptador.poner(encontrados);
            cuantos.setText(todos.size() + " canales en tu lista");
            return;
        }
        for (Catalogo.Item it : todos) {
            if (it.nombre.toLowerCase(Locale.getDefault()).contains(busca)) encontrados.add(it);
            // Con doscientos aciertos ya no se está buscando, se está mirando
            if (encontrados.size() >= 200) break;
        }
        adaptador.poner(encontrados);
        cuantos.setText(encontrados.isEmpty()
                ? "Ningún canal se llama así"
                : encontrados.size() + (encontrados.size() == 1 ? " canal" : " canales"));
    }
}
