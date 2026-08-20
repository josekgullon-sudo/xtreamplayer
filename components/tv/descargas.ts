/**
 * Descargas para ver sin conexión.
 *
 * La interfaz de televisión es la misma web en cinco sitios: en un navegador,
 * dentro del programa de Windows, y dentro de las aplicaciones de Fire TV, de
 * Android y de los televisores Samsung y LG. Guardar una película en el
 * aparato solo se puede hacer de verdad en algunos de esos sitios:
 *
 * · En una aplicación de Android —Fire TV y móvil— hay disco propio, permiso
 *   para escribir en él y un gestor de descargas del sistema que sigue
 *   bajando con la aplicación cerrada.
 * · En Windows, el programa es una ventana nativa y puede escribir donde
 *   quiera.
 * · En un navegador, no. Lo que hay es almacenamiento del sitio, que el
 *   navegador borra cuando le hace falta espacio: prometer «lo tienes
 *   guardado» y que desaparezca solo es peor que no ofrecerlo. Y en un
 *   televisor Samsung o LG, ni eso.
 *
 * Así que esto no descarga nada: le pide al envoltorio que lo haga. Cada
 * aplicación nativa pone un objeto con estas tres funciones en `window`, y
 * donde no lo hay la sección de descargas simplemente no aparece. Sin
 * mensajes de «tu dispositivo no es compatible», que es una forma cara de no
 * hacer nada: si no se puede, no se enseña.
 *
 * Todo va y viene en texto porque el puente de Android —`@JavascriptInterface`
 * — solo sabe de tipos sueltos: pasar un objeto no es una opción, y devolver
 * uno tampoco.
 */

/** Una descarga, tal y como la cuenta el envoltorio. */
export interface Descarga {
  /** El mismo que usa la portada: «vod-123», «serie-45-s1e2» */
  id: string;
  nombre: string;
  cartel: string;
  estado: "bajando" | "lista" | "fallo";
  /** De 0 a 100. Solo significa algo mientras baja */
  parte: number;
  /**
   * Dónde se ve, ya en el aparato. La pone el envoltorio y cada uno la suya:
   * en Android es un servidor local, en Windows el protocolo de ficheros de
   * Tauri. La web no la interpreta, se la pasa al reproductor tal cual.
   */
  url: string;
  /** Cuánto ocupa, en bytes. Cero mientras no se sepa */
  bytes: number;
  /**
   * Por qué falló, cuando falló.
   *
   * Sin esto, «No se ha podido terminar» es todo lo que se sabía —de este
   * lado y del de quien lo usa—, y con eso no se arregla nada. El envoltorio
   * lo tiene: es el error que le dio el servidor o el disco.
   */
  motivo?: string;
}

/** Lo que se le pide al envoltorio para que empiece a bajar algo. */
export interface Encargo {
  id: string;
  nombre: string;
  cartel: string;
  /** La dirección del vídeo, ya resuelta contra el panel del proveedor */
  url: string;
}

interface Puente {
  bajar(encargo: string): void;
  quitar(id: string): void;
  lista(): string;
  /**
   * Lo último que se le rompió al envoltorio, si algo se le rompió.
   *
   * `bajar` no puede contestar —tiene que ser síncrono y lo que hace es
   * asíncrono—, así que cuando falla antes siquiera de empezar (una
   * dirección que no vale, un permiso, un puente que no llega al programa) no
   * había forma de enterarse: la lista seguía vacía y la pantalla se quedaba
   * como si no hubieras pulsado. Esto se pregunta justo después de encargar.
   *
   * Opcional: un envoltorio viejo no lo trae y no pasa nada.
   */
  fallo?(): string;
}

declare global {
  interface Window {
    TPDescargas?: Puente;
  }
}

/** El envoltorio, si lo hay. En un navegador esto es siempre `null`. */
export function puente(): Puente | null {
  if (typeof window === "undefined") return null;
  const p = window.TPDescargas;
  if (!p || typeof p.bajar !== "function" || typeof p.lista !== "function") return null;
  return p;
}

/**
 * Si esto es una aplicación nativa que debería poder guardar y no puede.
 *
 * Un navegador no puede y punto: ahí no se enseña nada, que es lo correcto.
 * Pero el programa de Windows sí puede, y si alguien tiene instalada una
 * versión anterior a que existieran las descargas, el puente no viene dentro
 * y la aplicación se quedaba callada: ni botón, ni sección, ni una palabra.
 * Desde fuera es indistinguible de «esto no lo hace», y no es eso: es «este
 * programa es viejo».
 *
 * Tauri deja siempre sus tripas en `window`, así que se puede distinguir un
 * caso del otro y decir el que toca.
 */
export function envoltorioSinPuente(): boolean {
  if (typeof window === "undefined") return false;
  if (puente()) return false;
  const w = window as unknown as Record<string, unknown>;
  return Boolean(w.__TAURI_INTERNALS__ || w.__TAURI__);
}

/** Si esta aplicación puede guardar cosas para verlas sin conexión. */
export function sePuedeDescargar(): boolean {
  return puente() !== null;
}

/**
 * Lo que hay guardado ahora mismo.
 *
 * Se pregunta en vez de avisarse: un envoltorio que tuviera que llamar a la
 * web cada vez que avanza una descarga necesitaría saber cómo hablarle, y son
 * cuatro envoltorios distintos. Preguntar cada segundo y medio mientras haya
 * algo bajando cuesta menos que eso, y con nada bajando no se pregunta.
 */
export function leerDescargas(): Descarga[] {
  const p = puente();
  if (!p) return [];
  try {
    const crudo = JSON.parse(p.lista() || "[]");
    if (!Array.isArray(crudo)) return [];
    return crudo
      .filter((d) => d && typeof d.id === "string")
      .map((d) => ({
        id: String(d.id),
        nombre: String(d.nombre ?? ""),
        cartel: String(d.cartel ?? ""),
        estado: d.estado === "lista" || d.estado === "fallo" ? d.estado : "bajando",
        parte: Math.max(0, Math.min(100, Number(d.parte) || 0)),
        url: String(d.url ?? ""),
        bytes: Number(d.bytes) || 0,
        motivo: d.motivo ? String(d.motivo) : undefined,
      }));
  } catch {
    /* Un envoltorio que devuelve basura no puede tirar la pantalla abajo */
    return [];
  }
}

/**
 * La dirección, entera.
 *
 * El servidor a veces contesta con una ruta suya —«/api/proxy?v=…»— en vez de
 * con la dirección del proveedor, y en un navegador eso funciona porque la
 * completa él con el sitio en el que está. Un programa nativo no está en
 * ningún sitio: recibe ese texto y no sabe a dónde ir, así que la descarga
 * moría antes de empezar y sin decir nada. Aquí se completa antes de salir.
 */
function entera(url: string): string {
  const u = (url || "").trim();
  if (!u) return "";
  if (/^https?:\/\//i.test(u)) return u;
  if (typeof window === "undefined") return u;
  return new URL(u, window.location.origin).toString();
}

/**
 * Encarga una descarga y devuelve lo que se haya roto, o cadena vacía.
 *
 * Devuelve en vez de tragar: un botón que no hace nada y no dice por qué es
 * lo peor que puede pasar aquí, y era exactamente lo que pasaba.
 */
export function encargarDescarga(e: Encargo): string {
  const p = puente();
  if (!p) return "Esta aplicación no puede guardar nada en el aparato";
  const url = entera(e.url);
  if (!url) return "Tu proveedor no ha dado la dirección de este vídeo";
  try {
    p.bajar(JSON.stringify({ ...e, url }));
  } catch (nada) {
    return String((nada as Error)?.message || nada) || "El programa no ha aceptado la descarga";
  }
  /* Y lo que diga el propio envoltorio, si sabe decirlo */
  try {
    return p.fallo?.() || "";
  } catch {
    return "";
  }
}

export function quitarDescarga(id: string): void {
  const p = puente();
  if (!p) return;
  try {
    p.quitar(id);
  } catch {
    /* Igual: lo que manda es lo que conteste `lista()` la próxima vez */
  }
}

/**
 * Cómo se dice por dónde va una descarga.
 *
 * Con porcentaje, el porcentaje. Sin él, los megas que lleva — y no un «0 %»
 * clavado, que es lo que había y lo que hacía pensar que se había parado:
 * media lista de IPTV sirve el vídeo sin decir cuánto ocupa, así que no hay
 * total contra el que medir y el tanto por ciento no significa nada. Lo que
 * sí significa algo, y crece a la vista, es cuánto llevas.
 */
export function comoVa(parte: number, bytes: number): string {
  if (parte > 0) return `${parte}%`;
  const cuanto = tamanoLegible(bytes);
  return cuanto || "empezando…";
}

/** «1,4 GB». Vacío si todavía no se sabe cuánto ocupa. */
export function tamanoLegible(bytes: number): string {
  if (!bytes || bytes < 0) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1).replace(".", ",")} GB`;
}
