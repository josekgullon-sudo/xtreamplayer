package app.totalplayer.tvnativo;

import java.util.List;

/**
 * Lo que una pantalla le pasa a la siguiente.
 *
 * Va por aquí y no dentro del Intent porque lo que se pasa son listas de
 * miles de canales y fichas enteras: meter eso en un Bundle es serializarlo,
 * y hay un tope de un megabyte que se revienta sin avisar. Todo esto vive en
 * el mismo proceso, así que basta con dejarlo puesto y recogerlo.
 */
public final class Traspaso {

    /** La ficha que se va a abrir. */
    public static Catalogo.Item ficha;

    /** Qué se está reproduciendo y con qué se puede zapear. */
    public static List<Catalogo.Item> cola;
    public static int posicion;
    public static String url = "";
    public static String titulo = "";
    public static String logo = "";
    /** El directo no se rebobina y no lleva mandos; una película sí. */
    public static boolean esDirecto = true;

    private Traspaso() {}

    public static void reproducir(List<Catalogo.Item> lista, int cual) {
        cola = lista;
        posicion = cual;
        esDirecto = true;
        Catalogo.Item it = lista.get(cual);
        url = it.url;
        titulo = it.nombre;
        logo = it.imagen;
    }

    public static void reproducirSuelto(String direccion, String nombre, String imagen) {
        cola = null;
        posicion = 0;
        esDirecto = false;
        url = direccion;
        titulo = nombre;
        logo = imagen == null ? "" : imagen;
    }
}
