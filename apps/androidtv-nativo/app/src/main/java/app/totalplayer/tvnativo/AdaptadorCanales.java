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
    /** Lo que echan en el que suena, si se sabe. */
    private String loQueEchan = "";

    public AdaptadorCanales(AlElegir alElegir) { this.alElegir = alElegir; }

    public void poner(List<Catalogo.Item> nuevos) {
        datos.clear();
        datos.addAll(nuevos);
        notifyDataSetChanged();
    }

    public List<Catalogo.Item> datos() { return datos; }

    /**
     * Marca el canal que suena SIN repintar la lista.
     *
     * Aquí estaba el fallo que hacía la pantalla inservible: esto llamaba a
     * notifyDataSetChanged(), que rehace todas las filas. La fila enfocada
     * dejaba de existir, el foco se caía a lo primero que hubiera —la
     * primera carpeta— y para ver un canal a pantalla completa había que
     * volver a entrar en la carpeta y bajar otra vez hasta él. Se toca solo
     * lo que está a la vista, que es lo único que hay que cambiar.
     */
    public void sonando(RecyclerView donde, String id, String echan) {
        sonando = id == null ? "" : id;
        // null es «no lo sé todavía»; "" es «bórralo»
        if (echan != null) loQueEchan = echan;
        for (int i = 0; i < donde.getChildCount(); i++) {
            RecyclerView.ViewHolder vh = donde.getChildViewHolder(donde.getChildAt(i));
            if (!(vh instanceof Celda)) continue;
            int posicion = vh.getAdapterPosition();
            if (posicion >= 0 && posicion < datos.size()) marcar((Celda) vh, datos.get(posicion));
        }
    }

    private void marcar(Celda celda, Catalogo.Item canal) {
        boolean suena = !sonando.isEmpty() && canal.id.equals(sonando);
        celda.sonando.setVisibility(suena ? View.VISIBLE : View.INVISIBLE);
        if (suena && !loQueEchan.isEmpty()) {
            celda.ahora.setText(loQueEchan);
            celda.ahora.setVisibility(View.VISIBLE);
        } else {
            celda.ahora.setVisibility(View.GONE);
        }
    }

    static class Celda extends RecyclerView.ViewHolder {
        final ImageView logo;
        final View sonando;
        final TextView nombre, ahora;
        Celda(View v) {
            super(v);
            logo = v.findViewById(R.id.logo);
            nombre = v.findViewById(R.id.nombre);
            ahora = v.findViewById(R.id.ahora);
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
        marcar(celda, c);
        Imagenes.cargar(celda.logo, c.imagen, R.drawable.ic_tv);
        celda.itemView.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { alElegir.canal(celda.getAdapterPosition()); }
        });
    }

    @Override public int getItemCount() { return datos.size(); }
}
