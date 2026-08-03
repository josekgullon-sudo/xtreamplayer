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

/** La lista de canales, con su logotipo y una marca en el que suena. */
public class AdaptadorCanales extends RecyclerView.Adapter<AdaptadorCanales.Celda> {

    public interface AlElegir { void canal(int posicion); }

    private final List<Catalogo.Item> datos = new ArrayList<>();
    private final AlElegir alElegir;
    /** El identificador del que se está viendo, para marcarlo. */
    private String sonando = "";

    public AdaptadorCanales(AlElegir alElegir) { this.alElegir = alElegir; }

    public void poner(List<Catalogo.Item> nuevos) {
        datos.clear();
        datos.addAll(nuevos);
        notifyDataSetChanged();
    }

    public List<Catalogo.Item> datos() { return datos; }

    public void sonando(String id) {
        sonando = id == null ? "" : id;
        notifyDataSetChanged();
    }

    static class Celda extends RecyclerView.ViewHolder {
        final ImageView logo, sonando;
        final TextView nombre;
        Celda(View v) {
            super(v);
            logo = v.findViewById(R.id.logo);
            nombre = v.findViewById(R.id.nombre);
            sonando = v.findViewById(R.id.sonando);
        }
    }

    @NonNull
    @Override public Celda onCreateViewHolder(@NonNull ViewGroup padre, int tipo) {
        return new Celda(LayoutInflater.from(padre.getContext())
                .inflate(R.layout.pieza_canal, padre, false));
    }

    @Override public void onBindViewHolder(@NonNull final Celda celda, int posicion) {
        Catalogo.Item c = datos.get(posicion);
        celda.nombre.setText(c.nombre);
        celda.sonando.setVisibility(c.id.equals(sonando) ? View.VISIBLE : View.GONE);
        Imagenes.cargar(celda.logo, c.imagen, R.drawable.ic_tv);
        celda.itemView.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { alElegir.canal(celda.getAdapterPosition()); }
        });
    }

    @Override public int getItemCount() { return datos.size(); }
}
