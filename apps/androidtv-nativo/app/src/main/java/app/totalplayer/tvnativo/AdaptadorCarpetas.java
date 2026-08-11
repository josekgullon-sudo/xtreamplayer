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

    /**
     * Marca la carpeta abierta SIN avisar al RecyclerView.
     *
     * Aquí estaba el fallo que tiraba la aplicación al menú principal.
     * Esto llamaba a notifyItemChanged, y la marca se pone desde el listener
     * del foco: al bajar a una carpeta que todavía no está pintada, el
     * RecyclerView tiene que desplazarse para traerla, y avisar de un cambio
     * mientras se está desplazando lanza «Cannot call this method while
     * RecyclerView is computing a layout or scrolling». La aplicación se
     * caía, y detrás quedaba el menú: por eso parecía que «se salía al
     * menú» en vez de que se cerraba de golpe.
     *
     * Y por eso fallaba justo al pasar de la última carpeta visible y no
     * antes: hasta ahí no había que desplazar nada.
     */
    public void marcar(RecyclerView donde, int posicion) {
        elegida = posicion;
        for (int i = 0; i < donde.getChildCount(); i++) {
            View hijo = donde.getChildAt(i);
            RecyclerView.ViewHolder vh = donde.getChildViewHolder(hijo);
            if (vh instanceof Celda) hijo.setActivated(vh.getAdapterPosition() == elegida);
        }
    }

    static class Celda extends RecyclerView.ViewHolder {
        final TextView nombre, cuantos;
        final ImageView icono;
        Celda(View v) {
            super(v);
            nombre = v.findViewById(R.id.nombre);
            cuantos = v.findViewById(R.id.cuantos);
            icono = v.findViewById(R.id.icono);
        }
    }

    @NonNull
    @Override public Celda onCreateViewHolder(@NonNull ViewGroup padre, int tipo) {
        View v = LayoutInflater.from(padre.getContext()).inflate(R.layout.pieza_carpeta, padre, false);
        return new Celda(v);
    }

    @Override public void onBindViewHolder(@NonNull final Celda celda, int posicion) {
        Catalogo.Carpeta c = datos.get(posicion);
        celda.nombre.setText(c.nombre);
        /* El dibujo sale del nombre de la carpeta, que es lo único que manda
           el panel. Ver Categorias.java */
        celda.icono.setImageResource(Categorias.icono(c.nombre));
        /* Cuántos hay dentro, cuando el panel lo dice. No siempre lo dice:
           entonces se calla en vez de poner un cero que no es verdad */
        if (c.cuantos > 0) {
            celda.cuantos.setText(c.cuantos + (c.cuantos == 1 ? " canal" : " canales"));
            celda.cuantos.setVisibility(View.VISIBLE);
        } else {
            celda.cuantos.setVisibility(View.GONE);
        }
        /* El fondo y el foco los lleva la fila entera, no el texto: antes la
           pieza ERA el TextView y ahora es la caja que lo contiene */
        celda.itemView.setActivated(posicion == elegida);
        celda.itemView.setOnFocusChangeListener(new View.OnFocusChangeListener() {
            @Override public void onFocusChange(View v, boolean tiene) {
                if (tiene) alPosarse.en(celda.getAdapterPosition());
            }
        });
        celda.itemView.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { alPosarse.en(celda.getAdapterPosition()); }
        });
    }

    @Override public int getItemCount() { return datos.size(); }
}
