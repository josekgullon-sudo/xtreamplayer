package app.totalplayer.tvnativo;

import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;

import java.util.ArrayList;
import java.util.List;

/**
 * La columna de carpetas.
 *
 * Cambia de lista al mover el foco, no al pulsar OK: en una tele bajar por
 * las carpetas y tener que confirmar cada una para ver qué hay dentro es un
 * botón de más en cada paso.
 */
public class AdaptadorCarpetas extends RecyclerView.Adapter<AdaptadorCarpetas.Celda> {

    public interface AlPosarse { void en(int posicion); }

    private final List<Catalogo.Carpeta> datos = new ArrayList<>();
    private final AlPosarse alPosarse;
    private int elegida = 0;

    public AdaptadorCarpetas(AlPosarse alPosarse) { this.alPosarse = alPosarse; }

    public void poner(List<Catalogo.Carpeta> nuevas) {
        datos.clear();
        datos.addAll(nuevas);
        elegida = 0;
        notifyDataSetChanged();
    }

    public Catalogo.Carpeta cual(int posicion) {
        return posicion >= 0 && posicion < datos.size() ? datos.get(posicion) : null;
    }

    public void marcar(int posicion) {
        if (posicion == elegida) return;
        int antes = elegida;
        elegida = posicion;
        notifyItemChanged(antes);
        notifyItemChanged(posicion);
    }

    static class Celda extends RecyclerView.ViewHolder {
        final TextView nombre;
        Celda(View v) { super(v); nombre = v.findViewById(R.id.nombre); }
    }

    @NonNull
    @Override public Celda onCreateViewHolder(@NonNull ViewGroup padre, int tipo) {
        View v = LayoutInflater.from(padre.getContext()).inflate(R.layout.pieza_carpeta, padre, false);
        return new Celda(v);
    }

    @Override public void onBindViewHolder(@NonNull final Celda celda, int posicion) {
        Catalogo.Carpeta c = datos.get(posicion);
        celda.nombre.setText(c.nombre);
        celda.nombre.setActivated(posicion == elegida);
        celda.nombre.setOnFocusChangeListener(new View.OnFocusChangeListener() {
            @Override public void onFocusChange(View v, boolean tiene) {
                if (tiene) alPosarse.en(celda.getAdapterPosition());
            }
        });
        celda.nombre.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { alPosarse.en(celda.getAdapterPosition()); }
        });
    }

    @Override public int getItemCount() { return datos.size(); }
}
