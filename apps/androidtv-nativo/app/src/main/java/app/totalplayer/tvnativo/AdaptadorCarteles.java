package app.totalplayer.tvnativo;

import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageView;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;

import java.util.ArrayList;
import java.util.List;

/** La rejilla de carteles de películas y series. */
public class AdaptadorCarteles extends RecyclerView.Adapter<AdaptadorCarteles.Celda> {

    public interface AlElegir { void ficha(int posicion); }

    private final List<Catalogo.Item> datos = new ArrayList<>();
    private final AlElegir alElegir;
    /** Ancho del cartel en píxeles; 0 deja el del diseño. */
    private int ancho = 0;
    /**
     * Si la fila va numerada del 1 al 10.
     *
     * Es la misma celda con otro XML: el número enorme detrás de la
     * carátula. Tener dos adaptadores casi iguales solo sirve para arreglar
     * las cosas dos veces.
     */
    private boolean numerada = false;

    public AdaptadorCarteles(AlElegir alElegir) { this.alElegir = alElegir; }

    /**
     * Cuánto mide cada cartel.
     *
     * En la tele son los 150 puntos del diseño y ahí caben. En un teléfono
     * no: dos carteles de 150 con sus márgenes piden 356 puntos y la
     * pantalla da 340, así que la segunda columna salía cortada por el borde
     * derecho. El ancho de verdad se sabe al abrir, no al dibujar el XML.
     */
    public void ancho(int px) { ancho = px; }

    public void numerada(boolean si) { numerada = si; }

    public void poner(List<Catalogo.Item> nuevos) {
        datos.clear();
        datos.addAll(nuevos);
        notifyDataSetChanged();
    }

    public Catalogo.Item enPosicion(int posicion) {
        return posicion >= 0 && posicion < datos.size() ? datos.get(posicion) : null;
    }

    static class Celda extends RecyclerView.ViewHolder {
        final ImageView cartel;
        final TextView nombre, extra, puesto;
        Celda(View v) {
            super(v);
            cartel = v.findViewById(R.id.cartel);
            nombre = v.findViewById(R.id.nombre);
            extra = v.findViewById(R.id.extra);
            puesto = v.findViewById(R.id.puesto);
        }
    }

    @NonNull
    @Override public Celda onCreateViewHolder(@NonNull ViewGroup padre, int tipo) {
        View v = LayoutInflater.from(padre.getContext())
                .inflate(numerada ? R.layout.pieza_poster_num : R.layout.pieza_poster, padre, false);
        Foco.agrandar(v, 1.08f);
        return new Celda(v);
    }

    @Override public void onBindViewHolder(@NonNull final Celda celda, int posicion) {
        Catalogo.Item it = datos.get(posicion);
        if (ancho > 0) {
            // 2:3, la proporción de siempre de una carátula
            medir(celda.cartel, ancho, ancho * 3 / 2);
            medir(celda.nombre, ancho, 0);
            medir(celda.extra, ancho, 0);
        }
        celda.nombre.setText(it.nombre);
        celda.extra.setText(it.extra);
        if (celda.puesto != null) celda.puesto.setText(String.valueOf(posicion + 1));
        celda.extra.setVisibility(it.extra.isEmpty() ? View.INVISIBLE : View.VISIBLE);
        Imagenes.cargar(celda.cartel, it.imagen, it.esSerie ? R.drawable.ic_series : R.drawable.ic_cine);
        celda.itemView.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { alElegir.ficha(celda.getAdapterPosition()); }
        });
    }

    /** Alto 0 deja el que traiga: los textos siguen creciendo con la letra. */
    private static void medir(View v, int ancho, int alto) {
        ViewGroup.LayoutParams medidas = v.getLayoutParams();
        medidas.width = ancho;
        if (alto > 0) medidas.height = alto;
        v.setLayoutParams(medidas);
    }

    @Override public int getItemCount() { return datos.size(); }
}
