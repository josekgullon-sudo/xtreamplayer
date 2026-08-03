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

    public AdaptadorCarteles(AlElegir alElegir) { this.alElegir = alElegir; }

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
        final TextView nombre, extra;
        Celda(View v) {
            super(v);
            cartel = v.findViewById(R.id.cartel);
            nombre = v.findViewById(R.id.nombre);
            extra = v.findViewById(R.id.extra);
        }
    }

    @NonNull
    @Override public Celda onCreateViewHolder(@NonNull ViewGroup padre, int tipo) {
        View v = LayoutInflater.from(padre.getContext()).inflate(R.layout.pieza_poster, padre, false);
        Foco.agrandar(v, 1.08f);
        return new Celda(v);
    }

    @Override public void onBindViewHolder(@NonNull final Celda celda, int posicion) {
        Catalogo.Item it = datos.get(posicion);
        celda.nombre.setText(it.nombre);
        celda.extra.setText(it.extra);
        celda.extra.setVisibility(it.extra.isEmpty() ? View.INVISIBLE : View.VISIBLE);
        Imagenes.cargar(celda.cartel, it.imagen, it.esSerie ? R.drawable.ic_series : R.drawable.ic_cine);
        celda.itemView.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { alElegir.ficha(celda.getAdapterPosition()); }
        });
    }

    @Override public int getItemCount() { return datos.size(); }
}
