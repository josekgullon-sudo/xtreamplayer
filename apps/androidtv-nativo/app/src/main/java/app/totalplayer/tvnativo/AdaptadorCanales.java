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
    /** Mantener pulsado marca o desmarca. */
    public interface AlMarcar { void favorito(int posicion); }
    /**
     * Posarse encima de un canal, sin pulsar.
     *
     * Sirve para enseñar SU guía debajo del vídeo mientras se baja por la
     * lista, que es lo que se hace de verdad al zapear: mirar qué dan antes
     * de poner nada. Hasta ahora la guía era la del canal que sonaba, así
     * que para ver qué echaban en otro había que ponerlo.
     */
    public interface AlPosarse { void en(int posicion); }

    private final List<Catalogo.Item> datos = new ArrayList<>();
    private final AlElegir alElegir;
    private AlMarcar alMarcar;
    private AlPosarse alPosarse;
    private java.util.Set<String> favoritos = new java.util.HashSet<>();
    /** El identificador del que se está viendo, para marcarlo. */
    private String sonando = "";
    /** Lo que echan en el que suena, si se sabe. */
    private String loQueEchan = "";
    /**
     * En el buscador la segunda línea dice de qué es cada resultado.
     *
     * En la lista de canales de una carpeta sobra —ahí todo son canales—,
     * pero en una lista donde salen mezclados un canal, una película y una
     * serie con el mismo nombre, saber cuál es cuál es la mitad del trabajo.
     */
    private boolean conTipo;

    public void conTipo(boolean si) { this.conTipo = si; }

    public AdaptadorCanales(AlElegir alElegir) { this.alElegir = alElegir; }

    public void alMarcar(AlMarcar quien) { this.alMarcar = quien; }

    public void alPosarse(AlPosarse quien) { this.alPosarse = quien; }

    public void favoritos(java.util.Set<String> ids) {
        favoritos = ids == null ? new java.util.HashSet<String>() : ids;
    }

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
        celda.estrella.setVisibility(favoritos.contains(canal.id) ? View.VISIBLE : View.GONE);
        String pie = conTipo ? deQueEs(canal) : "";
        if (!pie.isEmpty()) {
            celda.ahora.setText(pie);
            celda.ahora.setVisibility(View.VISIBLE);
        } else if (suena && !loQueEchan.isEmpty()) {
            celda.ahora.setText(loQueEchan);
            celda.ahora.setVisibility(View.VISIBLE);
        } else {
            celda.ahora.setVisibility(View.GONE);
        }
    }

    /** «Serie · 2019 · ★ 8,1», o lo que se sepa. */
    private static String deQueEs(Catalogo.Item it) {
        String que = it.esSerie ? "Serie"
                : Enlaces.PELICULA.equals(it.clase) ? "Película" : "Canal";
        return it.extra == null || it.extra.isEmpty() ? que : que + "  ·  " + it.extra;
    }

    static class Celda extends RecyclerView.ViewHolder {
        final ImageView logo;
        final View sonando;
        final TextView nombre, ahora, numero;
        final View estrella;
        Celda(View v) {
            super(v);
            logo = v.findViewById(R.id.logo);
            nombre = v.findViewById(R.id.nombre);
            ahora = v.findViewById(R.id.ahora);
            numero = v.findViewById(R.id.numero);
            estrella = v.findViewById(R.id.estrella);
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
        // El número que le ha puesto el proveedor: es como la gente los pide
        celda.numero.setText(c.numero > 0 ? String.valueOf(c.numero) : "");
        marcar(celda, c);
        Imagenes.cargar(celda.logo, c.imagen, R.drawable.ic_tv);
        celda.itemView.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { alElegir.canal(celda.getAdapterPosition()); }
        });
        celda.itemView.setOnFocusChangeListener(new View.OnFocusChangeListener() {
            @Override public void onFocusChange(View v, boolean tiene) {
                if (tiene && alPosarse != null) alPosarse.en(celda.getAdapterPosition());
            }
        });
        celda.itemView.setOnLongClickListener(new View.OnLongClickListener() {
            @Override public boolean onLongClick(View v) {
                if (alMarcar == null) return false;
                alMarcar.favorito(celda.getAdapterPosition());
                return true;
            }
        });
    }

    @Override public int getItemCount() { return datos.size(); }
}
