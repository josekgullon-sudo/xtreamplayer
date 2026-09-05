package app.totalplayer.tvnativo;

import android.app.Activity;
import android.app.Dialog;
import android.content.DialogInterface;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.media3.common.C;
import androidx.media3.common.Format;
import androidx.media3.common.Player;
import androidx.media3.common.TrackGroup;
import androidx.media3.common.TrackSelectionOverride;
import androidx.media3.common.TrackSelectionParameters;
import androidx.media3.common.Tracks;

import java.util.ArrayList;
import java.util.List;

/**
 * Elegir el audio y los subtítulos, en un solo sitio.
 *
 * Es de las cosas que más se pedían y de las que no había ninguna: media
 * parrilla española va en dual —la película en versión original y el
 * doblaje, o el partido con dos narradores— y aquí sonaba el que viniera
 * primero en el fichero, sin manera de cambiarlo. En el .exe se cambia con
 * un botón; aquí no se podía, y quien quería ver algo en versión original
 * tenía que hacerlo en otra aplicación.
 *
 * Sirve a las dos pantallas que reproducen: la de películas y episodios
 * —donde es un botón más de los mandos— y la del directo, donde no hay
 * mandos que valgan y se abre con la flecha derecha. Por eso vive aquí
 * fuera y no dentro de ninguna de las dos.
 */
public final class SelectorIdioma {

    private SelectorIdioma() {}

    /** Una pista con lo justo para pintarla y para elegirla. */
    private static final class Pista {
        TrackGroup grupo;
        int dentro;
        String nombre;
        String codigo;
        boolean puesta;
    }

    private static List<Pista> pistasDe(Player p, int tipo) {
        List<Pista> lista = new ArrayList<>();
        if (p == null) return lista;
        Tracks todas = p.getCurrentTracks();
        for (int g = 0; g < todas.getGroups().size(); g++) {
            Tracks.Group grupo = todas.getGroups().get(g);
            if (grupo.getType() != tipo) continue;
            TrackGroup dentro = grupo.getMediaTrackGroup();
            for (int i = 0; i < dentro.length; i++) {
                /* Las que el aparato no sabe descodificar no se enseñan:
                   ofrecer algo que al pulsarlo deja el vídeo mudo es peor
                   que no ofrecerlo */
                if (!grupo.isTrackSupported(i)) continue;
                Format f = dentro.getFormat(i);
                Pista pista = new Pista();
                pista.grupo = dentro;
                pista.dentro = i;
                pista.nombre = Idiomas.nombre(f, lista.size() + 1);
                pista.codigo = Idiomas.codigo(f);
                pista.puesta = grupo.isTrackSelected(i);
                lista.add(pista);
            }
        }
        return lista;
    }

    /**
     * Si merece la pena enseñar el botón.
     *
     * Con un solo audio y ningún subtítulo no hay nada que elegir, y un
     * botón que abre una lista de un renglón es un botón que estorba.
     */
    public static boolean hayDondeElegir(Player p) {
        return pistasDe(p, C.TRACK_TYPE_AUDIO).size() > 1
                || !pistasDe(p, C.TRACK_TYPE_TEXT).isEmpty();
    }

    /** El idioma que suena, para escribirlo en el botón. */
    public static String audioEnUso(Player p) {
        List<Pista> audios = pistasDe(p, C.TRACK_TYPE_AUDIO);
        for (int i = 0; i < audios.size(); i++) {
            Pista pista = audios.get(i);
            if (!pista.puesta) continue;
            int corte = pista.nombre.indexOf(" · ");
            return corte > 0 ? pista.nombre.substring(0, corte) : pista.nombre;
        }
        return "Idioma";
    }

    private static void poner(Player p, Pista pista, boolean subtitulos) {
        TrackSelectionParameters.Builder b = p.getTrackSelectionParameters().buildUpon()
                .setOverrideForType(new TrackSelectionOverride(pista.grupo, pista.dentro));
        /* Elegir un subtítulo con los subtítulos apagados no hace nada: hay
           que volver a encenderlos en la misma orden */
        if (subtitulos) b.setTrackTypeDisabled(C.TRACK_TYPE_TEXT, false);
        p.setTrackSelectionParameters(b.build());
    }

    private static void sinSubtitulos(Player p) {
        p.setTrackSelectionParameters(p.getTrackSelectionParameters().buildUpon()
                .clearOverridesOfType(C.TRACK_TYPE_TEXT)
                .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true)
                .build());
    }

    /**
     * Poner lo que se eligió la última vez.
     *
     * Se llama cada vez que un fichero dice qué trae dentro. Si lo trae, se
     * pone y ni se entera nadie; si no lo trae, se queda lo que venga, que
     * es lo único que se puede hacer.
     *
     * Los subtítulos solo se tocan si alguna vez se eligió algo: de fábrica
     * una película se pone sin subtítulos, y encenderlos porque el fichero
     * los trae es exactamente lo que nadie pidió.
     */
    public static void aplicarLoGuardado(Activity a, Player p) {
        if (p == null) return;

        String audio = Idiomas.guardado(a, false);
        if (!audio.isEmpty()) {
            for (Pista pista : pistasDe(p, C.TRACK_TYPE_AUDIO)) {
                if (pista.puesta) break;
                if (Idiomas.mismo(pista.codigo, audio)) {
                    poner(p, pista, false);
                    break;
                }
            }
        }

        String subs = Idiomas.guardado(a, true);
        if (subs.isEmpty()) return;
        if (Idiomas.SIN_SUBS.equals(subs)) {
            sinSubtitulos(p);
            return;
        }
        for (Pista pista : pistasDe(p, C.TRACK_TYPE_TEXT)) {
            if (pista.puesta) break;
            if (Idiomas.mismo(pista.codigo, subs)) {
                poner(p, pista, true);
                break;
            }
        }
    }

    /**
     * El cuadro.
     *
     * Los dos bloques seguidos y no en pestañas: son cuatro renglones en
     * total y con el mando cambiar de pestaña cuesta más que bajar.
     */
    public static void abrir(final Activity a, final Player p) {
        abrir(a, p, null);
    }

    /**
     * Igual, avisando al cerrarse.
     *
     * Lo pide la pantalla de películas: sus mandos se esconden solos a los
     * cinco segundos, y al cerrar el cuadro hay que volver a sacarlos o el
     * foco se queda en un botón que ya no está.
     */
    public static void abrir(final Activity a, final Player p,
                             DialogInterface.OnDismissListener alCerrar) {
        if (a == null || p == null || a.isFinishing()) return;

        final Dialog cuadro = new Dialog(a);
        cuadro.requestWindowFeature(Window.FEATURE_NO_TITLE);
        cuadro.setContentView(R.layout.dialogo_idioma);

        Window ventana = cuadro.getWindow();
        if (ventana != null) {
            // El diálogo no infla con el inflador de la actividad: la letra
            // de la casa se le pone a mano. Ver PerfilesActivity
            Tipos.aplicar(ventana.getDecorView());
            ventana.setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
            float porPunto = a.getResources().getDisplayMetrics().density;
            int tope = (int) ((Pantalla.esMovil(a) ? 400 : 560) * porPunto);
            int ancho = Math.min((int) (a.getResources().getDisplayMetrics().widthPixels * 0.92f), tope);
            ventana.setLayout(ancho, ViewGroup.LayoutParams.WRAP_CONTENT);
        }

        LinearLayout lista = cuadro.findViewById(R.id.listaIdioma);
        LayoutInflater inflador = LayoutInflater.from(a);

        List<Pista> audios = pistasDe(p, C.TRACK_TYPE_AUDIO);
        List<Pista> textos = pistasDe(p, C.TRACK_TYPE_TEXT);

        if (audios.size() > 1) {
            lista.addView(rotulo(a, "Audio", false));
            for (final Pista pista : audios) {
                lista.addView(renglon(inflador, lista, pista.nombre, pista.puesta,
                        new View.OnClickListener() {
                            @Override public void onClick(View v) {
                                poner(p, pista, false);
                                Idiomas.recordar(a, false, pista.codigo);
                                cuadro.dismiss();
                            }
                        }));
            }
        }

        if (!textos.isEmpty()) {
            boolean algunoPuesto = false;
            for (Pista pista : textos) if (pista.puesta) algunoPuesto = true;

            lista.addView(rotulo(a, "Subtítulos", audios.size() > 1));
            /* «Sin subtítulos» el primero y no el último: es la opción a la
               que se vuelve, y volver tiene que costar menos que ir */
            lista.addView(renglon(inflador, lista, "Sin subtítulos", !algunoPuesto,
                    new View.OnClickListener() {
                        @Override public void onClick(View v) {
                            sinSubtitulos(p);
                            Idiomas.recordar(a, true, Idiomas.SIN_SUBS);
                            cuadro.dismiss();
                        }
                    }));
            for (final Pista pista : textos) {
                lista.addView(renglon(inflador, lista, pista.nombre, pista.puesta,
                        new View.OnClickListener() {
                            @Override public void onClick(View v) {
                                poner(p, pista, true);
                                Idiomas.recordar(a, true, pista.codigo);
                                cuadro.dismiss();
                            }
                        }));
            }
        }

        if (alCerrar != null) cuadro.setOnDismissListener(alCerrar);

        cuadro.show();
        // Que el mando entre en la lista y no se quede en ningún sitio
        for (int i = 0; i < lista.getChildCount(); i++) {
            View hijo = lista.getChildAt(i);
            if (hijo.isFocusable()) {
                hijo.requestFocus();
                break;
            }
        }
    }

    private static TextView rotulo(Activity a, String texto, boolean conHueco) {
        TextView t = new TextView(a);
        t.setText(texto);
        t.setTextSize(13);
        t.setAllCaps(true);
        t.setTextColor(a.getResources().getColor(R.color.tenue));
        float porPunto = a.getResources().getDisplayMetrics().density;
        int lado = (int) (14 * porPunto);
        t.setPadding(lado, (int) ((conHueco ? 18 : 2) * porPunto), lado, (int) (6 * porPunto));
        Tipos.aplicar(t);
        return t;
    }

    private static View renglon(LayoutInflater inflador, ViewGroup padre, String nombre,
                                boolean puesta, View.OnClickListener alPulsar) {
        View fila = inflador.inflate(R.layout.pieza_idioma, padre, false);
        ((TextView) fila.findViewById(R.id.idiomaNombre)).setText(nombre);
        // Una marca y no un color: el que la pista puesta salga en rojo no
        // se ve desde el sofá, y en una tele que satura tampoco se lee
        ((TextView) fila.findViewById(R.id.idiomaMarca)).setText(puesta ? "✓" : "");
        fila.setOnClickListener(alPulsar);
        Tipos.aplicar(fila);
        return fila;
    }
}
