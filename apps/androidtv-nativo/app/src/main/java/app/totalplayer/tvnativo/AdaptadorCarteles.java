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
    /** Ver `canales`. */
    private boolean deCanales = false;

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

    /**
     * Si lo que hay en la fila son canales y no películas.
     *
     * Cambia la forma de la celda, y no es un detalle: un logotipo de canal
     * metido en un cartel de 2:3 y recortado al centro se convierte en un
     * «1» de un palmo que ocupa media pantalla. Los canales son apaisados y
     * su logotipo tiene que caber entero, no llenar el hueco.
     */
    public void canales(boolean si) { deCanales = si; }

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
        final View marco;
        final TextView nombre, extra, puesto, sinCartel;
        Celda(View v) {
            super(v);
            cartel = v.findViewById(R.id.cartel);
            marco = v.findViewById(R.id.marcoCartel);
            nombre = v.findViewById(R.id.nombre);
            extra = v.findViewById(R.id.extra);
            puesto = v.findViewById(R.id.puesto);
            sinCartel = v.findViewById(R.id.sinCartel);
        }
    }

    @NonNull
    @Override public Celda onCreateViewHolder(@NonNull ViewGroup padre, int tipo) {
        View v = LayoutInflater.from(padre.getContext())
                .inflate(deCanales ? R.layout.pieza_canal_tira
                        : numerada ? R.layout.pieza_poster_num
                        : R.layout.pieza_poster, padre, false);
        Foco.agrandar(v, 1.08f);
        return new Celda(v);
    }

    @Override public void onBindViewHolder(@NonNull final Celda celda, int posicion) {
        Catalogo.Item it = datos.get(posicion);
        if (ancho > 0) {
            // 2:3, la proporción de siempre de una carátula
            medir(celda.marco != null ? celda.marco : celda.cartel, ancho, ancho * 3 / 2);
            medir(celda.nombre, ancho, 0);
            medir(celda.extra, ancho, 0);
        }
        celda.nombre.setText(it.nombre);
        celda.extra.setText(it.extra);
        if (celda.puesto != null) celda.puesto.setText(String.valueOf(posicion + 1));
        celda.extra.setVisibility(it.extra.isEmpty() ? View.INVISIBLE : View.VISIBLE);
        /*
         * El título detrás del hueco, y la carátula encima cuando llega.
         *
         * El dibujo de reserva era el icono de cine o el de series metido en
         * un ImageView con «centerCrop»: el vector se estiraba a 150×225 y lo
         * que se veía era un cuadrado gris con un triángulo enorme dentro,
         * igual para las cuatrocientas películas cuya carátula no cargaba. El
         * nombre debajo era lo único que las distinguía y a tres metros no se
         * llegaba a leer. Ahora, mientras no haya imagen, el hueco es el
         * título.
         */
        if (celda.sinCartel != null) celda.sinCartel.setText(it.nombre);
        Imagenes.cargar(celda.cartel, it.imagen,
                celda.sinCartel != null ? android.R.color.transparent
                        : (it.esSerie ? R.drawable.ic_series : R.drawable.ic_cine));
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
