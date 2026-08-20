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
      }));
  } catch {
    /* Un envoltorio que devuelve basura no puede tirar la pantalla abajo */
    return [];
  }
}

export function encargarDescarga(e: Encargo): void {
  const p = puente();
  if (!p) return;
  try {
    p.bajar(JSON.stringify(e));
  } catch {
    /* Si el envoltorio revienta, lo dirá su propia lista con estado «fallo» */
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

/** «1,4 GB». Vacío si todavía no se sabe cuánto ocupa. */
export function tamanoLegible(bytes: number): string {
  if (!bytes || bytes < 0) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1).replace(".", ",")} GB`;
}
