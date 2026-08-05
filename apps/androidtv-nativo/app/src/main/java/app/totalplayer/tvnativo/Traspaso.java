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
    /**
     * La dirección, si se sabe.
     *
     * Con lista de la plataforma llega vacía y la pide el reproductor justo
     * antes de arrancar —Enlaces.paraVer—, porque la dirección de un canal de
     * Xtream lleva dentro la línea del proveedor y no baja al aparato con el
     * catálogo.
     */
    public static String url = "";
    /** Con qué pedirla cuando no viene dada. */
    public static String clase = Enlaces.DIRECTO;
    public static String id = "";
    public static String extension = "";
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
        clase = it.clase;
        id = it.id;
        extension = it.extension;
        titulo = it.nombre;
        logo = it.imagen;
    }

    public static void reproducirSuelto(String direccion, String nombre, String imagen) {
        reproducirSuelto(direccion, nombre, imagen, Enlaces.PELICULA, "", "");
    }

    public static void reproducirSuelto(String direccion, String nombre, String imagen,
                                        String queClase, String queId, String queExtension) {
        cola = null;
        posicion = 0;
        esDirecto = false;
        clase = queClase;
        id = queId;
        extension = queExtension;
        url = direccion;
        titulo = nombre;
        logo = imagen == null ? "" : imagen;
    }
}
