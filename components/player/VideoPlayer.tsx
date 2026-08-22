"use client";

import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";

export interface PlaySource {
  /**
   * El enlace a reproducir, ya resuelto por el servidor. Con el vídeo directo
   * es la dirección del proveedor; con VIDEO_OCULTO=1 es «/api/proxy?v=…» y
   * aquí no se sabe —ni hace falta saber— a dónde apunta.
   */
  url: string;
  name: string;
  /** Pista sobre el tipo de stream para elegir motor */
  kind: "hls" | "ts" | "video" | "auto";
  /**
   * El mismo destino cifrado, para pedirlo por nuestro proxy, por el
   * conversor o por el diagnóstico sin volver a mandar la dirección. Antes
   * estas tres cosas se pedían con «?url=http://servidor…», que es
   * exactamente lo que ya no puede salir del servidor.
   */
  vale?: string;
  /** El mismo canal en TS: hay paneles que anuncian .m3u8 y solo sirven TS */
  urlTs?: string;
  valeTs?: string;
  /** false cuando el servidor ha decidido servir el vídeo él */
  directo?: boolean;
  /**
   * Lo que ha fallado ANTES de que hubiera nada que reproducir.
   *
   * Poner un canal son dos pasos: pedirle al servidor la dirección y luego
   * reproducirla. Este reproductor solo sabía contar lo que pasa en el
   * segundo; si el primero fallaba —sesión caducada, proveedor que no
   * contesta— quien lo hubiera pedido se quedaba con la dirección vacía en
   * la mano y aquí no llegaba nada, así que la pantalla se quedaba en
   * «Conectando con…» para siempre. Con esto, el motivo llega y se enseña.
   */
  fallo?: string;
  /**
   * Con qué nombre recordar el camino que funcionó, o nada para no recordar.
   *
   * Se pone SOLO en los canales en directo, y vale la lista de la que salen.
   * Los canales de una misma lista salen todos del mismo panel y por el mismo
   * camino, así que lo que se aprende con el primero sirve para los 8.000: es
   * la diferencia entre pagar el descubrimiento una vez o pagarlo en cada
   * zapeo. En películas no se pone a propósito: ahí lo que funciona depende
   * del fichero —un MKV necesita el conversor y un MP4 no—, y recordar
   * «conversor» para toda la lista mandaría a recodificar vídeo que ya se
   * veía bien.
   */
  recordar?: string;
}

function porElProxy(vale: string): string {
  return `/api/proxy?v=${encodeURIComponent(vale)}`;
}

type Attempt = {
  url: string;
  engine: "hls" | "mpegts" | "native";
  label: string;
  /** Va al servidor del proveedor sin pasar por nuestro proxy */
  direct: boolean;
  /**
   * Arranque lento por naturaleza: el conversor del servidor puede tardar
   * 15-20 s en producir el primer trozo (descarga del proveedor incluida).
   * Con los plazos normales lo matábamos justo antes de que respondiera.
   */
  lento?: boolean;
};

/**
 * El plazo se mide sobre el avance, no sobre el reloj.
 *
 * Un plazo fijo obliga a elegir entre dos males: corto, y se corta un canal
 * que estaba descargando sin problemas pero despacio; largo, y un servidor
 * muerto tiene al usuario mirando una ruleta. Contando desde la última señal
 * de vida —manifiesto leído, trozo descargado, primer fotograma— no hay que
 * elegir: lo que avanza sigue, y lo que no avanza cae rápido.
 *
 * El techo existe para el caso raro del servidor que va soltando datos
 * eternamente sin llegar a reproducir nada.
 */
const SIN_AVANCE_MS = 8000;
/*
 * El intento directo espera menos: tiene al proxy esperando detrás, así que
 * cada segundo mirando a un servidor mudo es un segundo robado al camino que
 * sí va a funcionar. Este peaje además solo se paga una vez por servidor,
 * gracias a la memoria de sesión.
 */
const SIN_AVANCE_DIRECTO_MS = 5000;
/* El último intento espera más sin señales: si falla, ya no hay nada detrás,
   y un VOD pesado puede tardar en soltar el primer byte. */
const SIN_AVANCE_ULTIMO_MS = 15000;
/* Lo que se espera a que el servidor diga por dónde sale el vídeo. Ver el
   plazo de la dirección que no llega, más abajo. */
const SIN_ENLACE_MS = 30000;
const TECHO_INTENTO_MS = 40000;

/**
 * Memoria por servidor: si un servidor ya rechazó la conexión directa una
 * vez, la rechazará siempre — es un filtro suyo, no mala suerte. Sin esta
 * memoria, cada zapping volvía a pagar el descubrimiento entero (hasta 8 s
 * mirando a un servidor mudo) antes de caer al proxy que sí funciona.
 *
 * Estaba en sessionStorage, y eso la dejaba inútil justo donde más falta
 * hace. Una sesión de navegador dura lo que la pestaña; en la aplicación de
 * Windows y en la de televisión, **cada arranque es una sesión nueva**. O
 * sea que quien enciende la tele para ver un canal paga religiosamente sus
 * cinco segundos de servidor mudo, todos los días, antes del primer canal.
 * En localStorage la lección se aprende una vez.
 *
 * Con fecha, eso sí: el proveedor puede cambiar de configuración, y una
 * lista negra para siempre acabaría mandando por el proxy tráfico que ya
 * podría ir directo. A la semana se vuelve a probar.
 */
const K_SIN_DIRECTO = "xp.sinDirecto.v2";
const CADUCA_SIN_DIRECTO = 7 * 24 * 3600 * 1000;

function leerSinDirecto(): Record<string, number> {
  try {
    const crudo = JSON.parse(localStorage.getItem(K_SIN_DIRECTO) || "{}");
    if (!crudo || typeof crudo !== "object" || Array.isArray(crudo)) return {};
    const ahora = Date.now();
    const vivos: Record<string, number> = {};
    for (const [origen, cuando] of Object.entries(crudo as Record<string, number>)) {
      if (typeof cuando === "number" && ahora - cuando < CADUCA_SIN_DIRECTO) vivos[origen] = cuando;
    }
    return vivos;
  } catch {
    return {};
  }
}

function marcarSinDirecto(url: string) {
  try {
    const origen = new URL(url, window.location.href).origin;
    const vivos = leerSinDirecto();
    vivos[origen] = Date.now();
    localStorage.setItem(K_SIN_DIRECTO, JSON.stringify(vivos));
  } catch {
    /* URL rara o almacenamiento bloqueado: sin memoria, pero sin romper */
  }
}

function origenSinDirecto(url: string): boolean {
  try {
    return Boolean(leerSinDirecto()[new URL(url, window.location.href).origin]);
  } catch {
    return false;
  }
}

/**
 * Memoria por lista: por qué camino salió el vídeo la última vez.
 *
 * La escalera de intentos está ordenada por lo que es más probable en
 * general, pero para un cliente concreto no hay nada probable: su panel
 * sirve TS o sirve HLS, y hace lo mismo con los 8.000 canales. Sin memoria,
 * quien tiene un panel de solo TS paga en CADA zapeo un intento de HLS que
 * ya se sabe que no va: unos segundos de rueda girando por canal, todo el
 * día. Con ella, el primer canal descubre el camino y los demás van derechos.
 *
 * Con fecha, como la de «sin directo»: los paneles cambian de configuración
 * y una preferencia para siempre acabaría siendo la equivocada.
 */
/*
 * La versión sube con la escalera, y esto no es un detalle.
 *
 * Lo apuntado es «por aquí salió el vídeo la última vez», y eso solo vale
 * mientras la escalera sea la misma. Al poner el TS por delante, todo el que
 * ya tuviera apuntado «proxy de compatibilidad» —que es lo que aprendió con
 * la escalera vieja— habría seguido entrando por HLS una semana entera, que
 * es lo que dura la nota: justo los clientes que ya usan esto, y justo los
 * que se quejaban de que tarda. La lección hay que volver a aprenderla
 * cuando cambia el temario.
 */
const K_CAMINO = "xp.camino.v2";
const CADUCA_CAMINO = 7 * 24 * 3600 * 1000;

function leerCaminos(): Record<string, { via: string; t: number }> {
  try {
    const crudo = JSON.parse(localStorage.getItem(K_CAMINO) || "{}");
    if (!crudo || typeof crudo !== "object" || Array.isArray(crudo)) return {};
    const ahora = Date.now();
    const vivos: Record<string, { via: string; t: number }> = {};
    for (const [lista, dato] of Object.entries(crudo as Record<string, { via?: unknown; t?: unknown }>)) {
      if (dato && typeof dato.via === "string" && typeof dato.t === "number" && ahora - dato.t < CADUCA_CAMINO) {
        vivos[lista] = { via: dato.via, t: dato.t };
      }
    }
    return vivos;
  } catch {
    return {};
  }
}

function caminoBueno(lista?: string): string {
  if (!lista) return "";
  try {
    return leerCaminos()[lista]?.via || "";
  } catch {
    return "";
  }
}

function marcarCamino(lista: string | undefined, via: string) {
  if (!lista || !via) return;
  try {
    const vivos = leerCaminos();
    if (vivos[lista]?.via === via) return; // ya estaba: no reescribir en cada canal
    vivos[lista] = { via, t: Date.now() };
    localStorage.setItem(K_CAMINO, JSON.stringify(vivos));
  } catch {
    /* Almacenamiento bloqueado: sin memoria, pero sin romper */
  }
}

/**
 * ¿Sabe este navegador reproducir HLS él solo?
 *
 * Safari y todo lo que corre en un iPhone o un iPad sí: lo hace el sistema,
 * fuera del JavaScript, y arranca rápido. Cualquier otro navegador necesita
 * hls.js, que baja el manifiesto, lo mastica y luego baja un trozo entero de
 * vídeo antes de enseñar el primer fotograma. Esa diferencia decide por qué
 * camino conviene empezar en un canal en directo.
 */
function hlsDeFabrica(): boolean {
  if (typeof document === "undefined") return false;
  try {
    return document.createElement("video").canPlayType("application/vnd.apple.mpegurl") !== "";
  } catch {
    return false;
  }
}

/**
 * Una página servida por HTTPS no puede cargar un stream por HTTP: el
 * navegador lo bloquea siempre, sin excepción. Como la mayoría de paneles
 * IPTV solo hablan HTTP, intentar la conexión directa en producción es
 * tiempo tirado — mejor ir derechos al proxy.
 */
function bloqueadoPorContenidoMixto(url: string): boolean {
  if (typeof window === "undefined") return false;
  if (window.location.protocol !== "https:" || !url.startsWith("http://")) return false;
  /*
   * Menos lo que sale de este mismo ordenador.
   *
   * Una película descargada la sirve el propio programa por
   * `http://127.0.0.1:PUERTO`, y el navegador NO trata eso como contenido
   * mixto: la dirección de bucle local está en la lista de orígenes de
   * confianza justo para esto. Dándola por bloqueada, no quedaba ni un
   * intento que hacer —no hay vale ni versión TS de un fichero que está en
   * el disco— y el reproductor se quedaba en «Conectando con…» para
   * siempre, sin error y sin vídeo. Que es exactamente lo que pasaba al
   * reproducir algo descargado en el programa de Windows.
   */
  return !esDeAqui(url);
}

/** Si la dirección sale de este mismo ordenador. */
function esDeAqui(url: string): boolean {
  try {
    const donde = new URL(url, window.location.href).hostname;
    return donde === "127.0.0.1" || donde === "localhost" || donde === "[::1]" || donde === "::1";
  } catch {
    return false;
  }
}

/**
 * Un bloqueo CORS o una conexión rechazada llegan al elemento <video> como
 * MEDIA_ERR_NETWORK o como MEDIA_ERR_SRC_NOT_SUPPORTED (el navegador no llega
 * a leer nada, así que dice que no reconoce el formato). Ambos significan lo
 * mismo para nosotros: contra ese servidor, directo, no hay nada que hacer.
 */
function esFalloDeRed(v: HTMLVideoElement): boolean {
  const code = v.error?.code;
  return code === 2 || code === 4;
}

function engineDe(src: PlaySource): "hls" | "mpegts" | "native" {
  return guessEngine(src.url, src.kind);
}

function guessEngine(url: string, kind: PlaySource["kind"]): "hls" | "mpegts" | "native" {
  if (kind === "hls") return "hls";
  if (kind === "ts") return "mpegts";
  if (kind === "video") return "native";
  const clean = url.split("?")[0].toLowerCase();
  if (clean.endsWith(".m3u8") || clean.includes("/hls/")) return "hls";
  if (clean.endsWith(".ts")) return "mpegts";
  return "native";
}

/**
 * Orden de intentos, del más probable al más rebuscado:
 *   1. Directo: cuando funciona es lo más rápido y no gasta ancho de banda nuestro
 *   2. El proxy con el mismo formato: es lo que arregla el caso habitual, un
 *      servidor que no manda cabeceras CORS o que filtra por User-Agent
 *   3. El proxy en TS y, ya como último recurso, el TS directo: algunos paneles
 *      sirven solo TS aunque anuncien .m3u8
 *
 * El TS directo va al final justo porque, si el servidor ya ha rechazado al
 * navegador una vez, va a rechazarlo también aquí.
 */
function buildAttempts(src: PlaySource): Attempt[] {
  const engine = guessEngine(src.url, src.kind);
  /*
   * Con el vídeo servido desde aquí no hay «intento directo» que valga: el
   * navegador no tiene la dirección del proveedor y ese es justo el objetivo.
   * Queda un solo camino, el nuestro, y las variantes de formato.
   */
  const ocultado = src.directo === false;
  const mixto = !ocultado && bloqueadoPorContenidoMixto(src.url);
  // Sin directo cuando el navegador lo bloquearía (HTTPS→HTTP) o cuando este
  // servidor ya nos rechazó antes en esta sesión
  const sinDirecto = ocultado || mixto || origenSinDirecto(src.url);

  const attempts: Attempt[] = [];
  /*
   * Sin dirección todavía no hay nada que intentar, y eso no es un fallo: el
   * canal se pinta en cuanto se pulsa y su dirección se le pide al servidor,
   * que tarda lo que tarda un viaje de ida y vuelta. Ese instante se espera.
   */
  if (!src.url) return attempts;
  if (!sinDirecto) attempts.push({ url: src.url, engine, label: "conexión directa", direct: true });
  if (ocultado) {
    attempts.push({ url: src.url, engine, label: "conexión protegida", direct: false });
  } else if (src.vale) {
    attempts.push({ url: porElProxy(src.vale), engine, label: "proxy de compatibilidad", direct: false });
  }
  if (src.urlTs) {
    /* El TS lo manda el servidor ya resuelto: componerlo aquí cambiando la
       extensión exigía tener la dirección del proveedor delante */
    if (src.valeTs && !ocultado) {
      attempts.push({ url: porElProxy(src.valeTs), engine: "mpegts", label: "proxy en formato TS", direct: false });
    }
    attempts.push({
      url: src.urlTs,
      engine: "mpegts",
      label: ocultado ? "formato TS protegido" : "formato TS directo",
      direct: !ocultado,
    });
  }
  /*
   * Último recurso para películas y series: el conversor del servidor, que
   * reenvuelve el fichero como MP4 al vuelo. Es lo que hace que un MKV se
   * vea en un iPhone. Va el último porque gasta CPU nuestra; si el fichero
   * ya era compatible, nunca se llega aquí.
   */
  if (engine === "native") {
    // Como HLS: es lo único que Safari/iPhone reproducen en streaming, y de
    // regalo permite saltar dentro de lo ya convertido
    if (src.vale) {
      attempts.push({ url: `/api/remux?v=${encodeURIComponent(src.vale)}`, engine: "hls", label: "conversor de formato", direct: false, lento: true });
    }
    /*
     * Plan C: si el dispositivo rechaza hasta la copia convertida (metadatos
     * del códec rotos, perfiles raros), el conversor recodifica el vídeo a
     * H.264 estándar — eso lo reproduce cualquier cosa con pantalla. Va en
     * sesión aparte del servidor, así que no pisa la variante en copia.
     */
    if (src.vale) attempts.push({
      url: `/api/remux?v=${encodeURIComponent(src.vale)}&transcodificar=1`,
      engine: "hls",
      label: "conversor (recodificando para este dispositivo)",
      direct: false,
      lento: true,
    });
  }
  /*
   * En directo, el TS por delante. Y esto es lo que hace que un canal tarde
   * un segundo en abrir en vez de cinco.
   *
   * Los reproductores con los que compite esto —MaxPlayer, TiviMate y el
   * resto— piden el canal en TS y se lo dan a un decodificador del sistema:
   * los primeros paquetes que llegan ya son imagen. Nosotros pedíamos el
   * .m3u8, y por ahí el camino es baja el manifiesto, léelo, baja un TROZO
   * ENTERO de vídeo —seis o diez segundos de emisión, varios megas— y solo
   * entonces enseña el primer fotograma. Con el panel al otro lado del
   * charco y pasando por nuestro proxy, eso son los tres a cinco segundos
   * que se notan al zapear.
   *
   * El TS no tiene manifiesto ni trozos: es un chorro, y mpegts.js le pasa
   * al vídeo lo que va llegando. Se empieza a ver casi al momento.
   *
   * La excepción es Safari y todo lo del iPhone, que reproducen HLS de
   * fábrica —sin bajar el trozo entero, porque lo hace el sistema— y ahí
   * cambiar de camino sería perder. Ver `hlsDeFabrica`.
   *
   * Y si el panel resulta no servir TS, detrás sigue la escalera entera: se
   * cae al HLS de siempre y la memoria del camino se acuerda para la
   * próxima vez.
   */
  const conTs = attempts.some((a) => a.engine === "mpegts");
  if (conTs && !hlsDeFabrica()) {
    /* Primero por formato y, dentro de cada formato, lo directo antes que el
       proxy: seguimos prefiriendo no pagar el viaje por nuestro servidor
       cuando el del proveedor deja entrar al navegador. Los intentos
       directos contra un servidor que ya nos rechazó no llegan hasta aquí
       —los quita `sinDirecto`— así que esto no reabre esa puerta. */
    attempts.sort(
      (a, b) =>
        Number(b.engine === "mpegts") - Number(a.engine === "mpegts") ||
        Number(b.direct) - Number(a.direct)
    );
  }

  /*
   * Y lo aprendido manda: si de esta lista ya salió vídeo por un camino, ese
   * va primero. Los demás se quedan detrás en el mismo orden, así que si el
   * panel ha cambiado se sigue llegando a ellos igual que antes.
   */
  const bueno = caminoBueno(src.recordar);
  if (bueno && attempts.some((a) => a.label === bueno)) {
    return [...attempts.filter((a) => a.label === bueno), ...attempts.filter((a) => a.label !== bueno)];
  }
  return attempts;
}

export default function VideoPlayer({
  source,
  controles = true,
  onEnded,
}: {
  source: PlaySource | null;
  /**
   * Los mandos del navegador: la barra con play, tiempo y volumen.
   *
   * En el reproductor web valen; en un televisor, no. Ahí salía la barra
   * gris de Chrome —pensada para un ratón— encima del vídeo, con su botón
   * de pantalla completa y sus tres puntitos. Con un mando no se puede
   * usar y afea lo único que se ha venido a ver.
   */
  controles?: boolean;
  onEnded?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "playing" | "error">("idle");
  const [errorDetail, setErrorDetail] = useState<string>("");
  const [progress, setProgress] = useState<{ step: number; total: number; label: string } | null>(null);
  const [diag, setDiag] = useState<string | null>(null);
  const [diagnosticando, setDiagnosticando] = useState(false);

  /**
   * Pregunta al servidor qué le respondió el proveedor y lo traduce a un
   * veredicto en cristiano. Distingue los dos fallos que por fuera se ven
   * iguales: proveedor que bloquea IPs de servidores, y formato que este
   * navegador no sabe decodificar.
   */
  async function diagnosticar() {
    if (!source) return;
    setDiagnosticando(true);
    setDiag(null);
    /*
     * La firma de versiones va en cada veredicto: si la web del navegador y
     * el servidor no coinciden, el móvil está probando arreglos que aún no
     * tiene (Safari se aferra a su caché) — y la captura lo delata sola.
     */
    let firma = `[web ${process.env.NEXT_PUBLIC_BUILD || "?"}`;
    try {
      const v = await fetch("/api/version").then((r) => r.json());
      firma += ` · servidor ${v.commit}]`;
    } catch {
      firma += "]";
    }
    const setDiag_ = (texto: string) => setDiag(`${texto} ${firma}`);
    try {
      const res = await fetch(`/api/diag?v=${encodeURIComponent(source.vale || "")}`);
      const d = await res.json();
      const ext = (source.url.split("?")[0].match(/\.([a-z0-9]{2,4})$/i)?.[1] || "").toLowerCase();
      const esAppleSinSoporte = ["mkv", "avi", "wmv", "flv"].includes(ext);
      if (d.ok && d.bytes > 0) {
        // El proveedor entrega: la siguiente pregunta es si el conversor pudo
        if (engineDe(source) === "native") {
          // Sondeos cortos al conversor: cada respuesta llega en milisegundos
          // y trae el estado real (listo, en marcha, o fallo con su porqué)
          const limite = Date.now() + 45000;
          let veredicto = "";
          while (Date.now() < limite) {
            try {
              const rc = await fetch(`/api/remux/espera?v=${encodeURIComponent(source.vale || "")}`, {
                signal: AbortSignal.timeout(15000),
              });
              const rj = (await rc.json()) as { listo?: boolean; error?: string; detalle?: string; codec?: string };
              if (rj.listo) {
                veredicto = `El proveedor entrega el vídeo y el conversor lo tiene listo${rj.codec ? ` (vídeo: ${rj.codec})` : ""}. El fallo está en la reproducción en este dispositivo: recarga la página y dale al play de nuevo; si persiste, dime qué dispositivo es y este veredicto entero.`;
                break;
              }
              if (rj.error) {
                veredicto = `El proveedor entrega el vídeo, pero el conversor falló: ${rj.error}${rj.detalle ? ` — ${rj.detalle}` : ""}`;
                break;
              }
              // sigue convirtiendo: se le da un poco más de cuerda
            } catch {
              /* un sondeo perdido no decide nada: se reintenta */
            }
            await new Promise((r) => setTimeout(r, 2000));
          }
          setDiag_(
            veredicto ||
              "El proveedor entrega el vídeo y el conversor lleva 45 segundos trabajando sin terminar: el proveedor está entregando el fichero muy despacio. Espera un minuto y dale al play otra vez."
          );
          return;
        }
        setDiag_(
          esAppleSinSoporte
            ? `El proveedor entrega el vídeo sin problema, pero es un fichero .${ext} y ni este navegador ni el conversor han podido con su contenido. Suele ser el códec interno (p. ej. vídeo HEVC en un navegador sin soporte). Prueba desde otro dispositivo.`
            : "El proveedor entrega datos al servidor sin problema. El fallo está en la decodificación en este dispositivo: prueba desde otro navegador o dispositivo."
        );
      } else if (d.timeout || d.status === 0) {
        setDiag_(
          "Tu proveedor no responde a nuestro servidor (sí respondería a tu casa). Suele significar que bloquea las IPs de centros de datos: pídele que permita el acceso desde servidores, o desde la IP de este servicio."
        );
      } else {
        setDiag_(
          `Tu proveedor respondió ${d.status} al servidor: rechaza la conexión (bloqueo de IPs de servidores, o suscripción sin conexiones libres).`
        );
      }
    } catch {
      setDiag_("No se pudo completar el diagnóstico. Inténtalo de nuevo.");
    } finally {
      setDiagnosticando(false);
    }
  }

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !source) return;

    let cancelled = false;

    /* Lo que falló antes de llegar aquí se enseña tal cual: es la única
       pantalla que hay, y sin esto el motivo se perdía por el camino */
    if (source.fallo) {
      setState("error");
      setErrorDetail(source.fallo);
      return;
    }

    const attempts = buildAttempts(source);
    if (!attempts.length) {
      /* Todavía sin dirección: se queda esperando, no da error. El canal se
         pinta al pulsarlo y su dirección llega en otro viaje */
      if (!source.url) {
        setState("loading");
        setErrorDetail("");
        /*
         * Pero esperando con un plazo.
         *
         * Sin él, cualquier camino que se olvide de contar su fallo —y hubo
         * dos— deja la rueda girando para siempre: ni vídeo, ni error, ni
         * manera de saber qué ha pasado. Es el peor final posible, porque el
         * que mira no puede ni contarlo. Treinta segundos es más de lo que
         * tarda cualquier respuesta y menos de lo que nadie aguanta.
         */
        const plazo = setTimeout(() => {
          if (cancelled) return;
          setState("error");
          setErrorDetail("no ha llegado la dirección de este canal");
        }, SIN_ENLACE_MS);
        return () => {
          cancelled = true;
          clearTimeout(plazo);
        };
      }
      /*
       * Pero CON dirección y sin un solo intento, esto es un fallo nuestro
       * y hay que decirlo. Estaba cayendo en la misma rama que «espera un
       * momento», así que la pantalla se quedaba dando vueltas para
       * siempre: ni vídeo, ni error, ni forma de saber qué pasaba.
       */
      setState("error");
      setErrorDetail("No hay ninguna forma de reproducir esta dirección desde aquí");
      return;
    }
    let index = 0;
    let watchdog: ReturnType<typeof setInterval> | null = null;
    /** El servidor ya ha rechazado al navegador: no vale la pena volver a él */
    let directoDescartado = false;
    const problems: string[] = [];

    setState("loading");
    setErrorDetail("");
    setDiag(null);

    function clearWatchdog() {
      if (watchdog) clearInterval(watchdog);
      watchdog = null;
    }

    function destroyEngine() {
      clearWatchdog();
      cleanupRef.current?.();
      cleanupRef.current = null;
    }

    /**
     * @param redCaida el fallo fue de red (CORS, conexión rechazada, servidor
     *   caído), no de formato. Distinguirlo importa: si el servidor no deja
     *   entrar al navegador, los demás intentos directos contra ese mismo
     *   servidor van a fallar igual, y probarlos uno a uno gasta un plazo de
     *   espera entero por cada uno antes de llegar al proxy, que es el que
     *   sí funciona.
     */
    function fail(detail: string, redCaida = false) {
      if (cancelled) return;
      clearWatchdog();
      const actual = attempts[index];
      problems.push(`${actual?.label ?? "intento"}: ${detail}`);
      index += 1;

      if (redCaida && actual?.direct) {
        directoDescartado = true;
        // Y se recuerda para toda la sesión: el próximo canal de este mismo
        // servidor irá al proxy sin pagar otra vez el descubrimiento
        marcarSinDirecto(actual.url);
      }
      // Se descartan todos los intentos directos que queden, estén donde estén
      // en la lista: si el servidor no acepta al navegador, no lo va a aceptar
      // por cambiarle la extensión al fichero.
      while (index < attempts.length && directoDescartado && attempts[index].direct) {
        problems.push(`${attempts[index].label}: omitido (el servidor no acepta al navegador)`);
        index += 1;
      }

      if (index < attempts.length) {
        start();
      } else {
        destroyEngine();
        setErrorDetail(problems.join(" · "));
        setState("error");
      }
    }

    async function start() {
      if (cancelled) return;
      destroyEngine();
      const attempt = attempts[index];
      const v = videoRef.current;
      if (!v) return;

      const esUltimo = index === attempts.length - 1;
      setProgress({ step: index + 1, total: attempts.length, label: attempt.label });

      /*
       * Hay que mirar si ha empezado a verse de verdad, no el currentTime: en
       * directo, hls.js coloca el cursor en el borde de emisión en cuanto lee
       * el manifiesto, así que currentTime deja de ser 0 aunque no llegue ni
       * un fotograma. Con esa comprobación el plazo nunca saltaba y el
       * reproductor se quedaba girando.
       */
      let arrancado = false;
      const inicio = Date.now();
      let ultimoAvance = inicio;
      const avanza = () => {
        ultimoAvance = Date.now();
      };

      const onPlaying = () => {
        if (cancelled) return;
        arrancado = true;
        clearWatchdog();
        setState("playing");
        // Esto es lo que funciona en esta casa: que el siguiente canal no
        // vuelva a buscarlo desde el principio
        marcarCamino(source?.recordar, attempt.label);
      };
      v.addEventListener("playing", onPlaying);
      // Cualquier señal de que están llegando datos cuenta como avance
      const EVENTOS_AVANCE = ["loadedmetadata", "loadeddata", "progress", "canplay"];
      for (const evt of EVENTOS_AVANCE) v.addEventListener(evt, avanza);
      const soltarEventos = () => {
        v.removeEventListener("playing", onPlaying);
        for (const evt of EVENTOS_AVANCE) v.removeEventListener(evt, avanza);
      };

      const sinAvanceMax = attempt.lento
        ? 35000
        : esUltimo
          ? SIN_AVANCE_ULTIMO_MS
          : attempt.direct
            ? SIN_AVANCE_DIRECTO_MS
            : SIN_AVANCE_MS;
      const techo = attempt.lento ? 150000 : TECHO_INTENTO_MS;
      watchdog = setInterval(() => {
        if (cancelled || arrancado) return;
        const ahora = Date.now();
        if (ahora - ultimoAvance > sinAvanceMax) {
          fail("el servidor dejó de responder", true);
        } else if (ahora - inicio > techo) {
          fail("tarda demasiado en arrancar");
        }
      }, 1000);

      /*
       * El conversor primero se sondea hasta que esté listo: peticiones de
       * milisegundos cada 2 s, nada que un intermediario pueda cortar. Solo
       * entonces se le da la URL al vídeo, que ya carga al instante. Esperar
       * dentro de la petición del vídeo dejaba la conexión muda mientras
       * ffmpeg trabajaba, y algo por el camino la cortaba a mitad.
       */
      if (attempt.lento) {
        const limite = Date.now() + 120000;
        let preparado = false;
        // El sondeo pregunta por la misma variante que se va a reproducir
        const forzado = attempt.url.includes("transcodificar=1") ? "&transcodificar=1" : "";
        while (!cancelled && Date.now() < limite) {
          avanza(); // el sondeo cuenta como señal de vida para el plazo
          try {
            const r = await fetch(`/api/remux/espera?v=${encodeURIComponent(source!.vale || "")}${forzado}`, {
              signal: AbortSignal.timeout(15000),
            });
            const est = (await r.json()) as { listo?: boolean; error?: string; detalle?: string; playlist?: string };
            if (est.listo) {
              // El playlist directo, sin la redirección 302 de /api/remux:
              // Safari es capaz de rechazar un src que redirige
              if (est.playlist) attempt.url = est.playlist;
              preparado = true;
              break;
            }
            if (est.error) {
              fail(`${est.error}${est.detalle ? ` — ${est.detalle}` : ""}`);
              return;
            }
          } catch {
            /* un sondeo perdido no es un fallo: se reintenta */
          }
          await new Promise((r) => setTimeout(r, 2000));
        }
        if (cancelled) return;
        if (!preparado) {
          fail("la conversión no arrancó en dos minutos");
          return;
        }
        avanza();
      }

      if (attempt.engine === "hls") {
        /*
         * En Safari (iPhone sobre todo) el HLS se entrega al reproductor
         * nativo del sistema: es el cliente HLS original y el más fiable, y
         * ahí hls.js corre sobre ManagedMediaSource con más papeletas de
         * fallar. En el resto de navegadores no hay nativo, así que hls.js.
         */
        const hlsNativo = v.canPlayType("application/vnd.apple.mpegurl");
        if (hlsNativo) {
          // El código del error nativo distingue red (2), decodificación (3)
          // y formato no soportado (4): oro para diagnosticar a distancia
          const onError = () =>
            fail(
              `No se pudo cargar el stream HLS${v.error ? ` (código ${v.error.code}${v.error.message ? `: ${v.error.message}` : ""})` : ""}`,
              esFalloDeRed(v)
            );
          v.addEventListener("error", onError);
          v.src = attempt.url;
          v.play().catch((e) => {
            /*
             * iOS bloquea el autoplay si el gesto del usuario ya caducó
             * (llegar hasta aquí puede llevar varios intentos). El vídeo
             * está listo; solo falta que pulse play. Eso no es un fallo.
             */
            if (e instanceof Error && e.name === "NotAllowedError") {
              arrancado = true;
              clearWatchdog();
              setState("playing");
            }
          });
          cleanupRef.current = () => {
            soltarEventos();
            v.removeEventListener("error", onError);
            v.removeAttribute("src");
            v.load();
          };
        } else if (Hls.isSupported()) {
          const hls = new Hls({
            maxBufferLength: 30,
            /*
             * Empezar a bajar el primer trozo sin esperar a tener el
             * manifiesto entero masticado.
             *
             * Un canal de directo tarda en arrancar tres viajes seguidos:
             * manifiesto, lista de trozos y primer trozo. Con esto, el
             * último empieza mientras se procesa el anterior en vez de
             * después, que es un viaje de ida y vuelta menos —y en un panel
             * de IPTV, que no suele estar cerca, cada viaje se nota.
             */
            startFragPrefetch: true,
            /*
             * Y se arranca por la calidad más baja del canal, no por la que
             * hls.js adivine.
             *
             * Al empezar no hay ninguna medida del ancho de banda, así que
             * la elección es una conjetura; si sale alta, el primer trozo
             * pesa varios megas y el canal se queda parado mientras baja
             * —justo el «tarda y luego se queda pillado»—. Empezando por
             * abajo, la imagen aparece enseguida y en unos segundos sube
             * sola a la calidad que dé la conexión, que es como se comporta
             * cualquier reproductor decente.
             *
             * Un canal con una sola calidad —la mayoría en IPTV— no se
             * entera de esto.
             */
            startLevel: 0,
            /*
             * Los reintentos internos de hls.js sobran mientras quede otro
             * intento nuestro por probar: duplican la espera antes de dejar
             * paso al proxy. En el último sí interesan, porque detrás no hay
             * nada y un corte pasajero merece una segunda oportunidad.
             */
            manifestLoadingMaxRetry: esUltimo ? 2 : 0,
            levelLoadingMaxRetry: esUltimo ? 2 : 0,
            /*
             * El manifiesto del conversor tarda lo que tarde ffmpeg en tener
             * el primer segmento (el servidor espera hasta 20 s antes de
             * contestar). Con 12 s el reproductor se rendía justo antes de
             * la respuesta buena.
             */
            manifestLoadingTimeOut: attempt.lento ? 30000 : 12000,
            levelLoadingTimeOut: attempt.lento ? 30000 : 12000,
            fragLoadingTimeOut: 25000,
          });
          // El manifiesto y cada trozo que llega son señales de vida
          for (const evt of [
            Hls.Events.MANIFEST_LOADED,
            Hls.Events.MANIFEST_PARSED,
            Hls.Events.LEVEL_LOADED,
            Hls.Events.FRAG_LOADED,
            Hls.Events.FRAG_BUFFERED,
          ]) {
            hls.on(evt, avanza);
          }
          hls.on(Hls.Events.ERROR, (_evt, data) => {
            if (data.fatal) {
              hls.destroy();
              fail(`HLS: ${data.details}`, data.type === Hls.ErrorTypes.NETWORK_ERROR);
            }
          });
          hls.loadSource(attempt.url);
          hls.attachMedia(v);
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            v.play().catch(() => {});
          });
          cleanupRef.current = () => {
            soltarEventos();
            hls.destroy();
          };
        } else {
          fail("Este navegador no soporta HLS");
        }
      } else if (attempt.engine === "mpegts") {
        try {
          const mpegts = (await import("mpegts.js")).default;
          if (!mpegts.isSupported()) {
            fail("Este navegador no soporta MPEG-TS");
            return;
          }
          const player = mpegts.createPlayer({
            type: "mpegts",
            isLive: true,
            url: attempt.url,
          });
          player.on(mpegts.Events.MEDIA_INFO, avanza);
          player.on(mpegts.Events.STATISTICS_INFO, avanza);
          player.on(mpegts.Events.ERROR, (tipo: string) => {
            player.destroy();
            fail("MPEG-TS: error de red o formato", tipo === mpegts.ErrorTypes.NETWORK_ERROR);
          });
          player.attachMediaElement(v);
          player.load();
          player.play()?.catch?.(() => {});
          cleanupRef.current = () => {
            soltarEventos();
            try {
              player.destroy();
            } catch {
              /* ya destruido */
            }
          };
        } catch {
          fail("No se pudo iniciar el motor MPEG-TS");
        }
      } else {
        const onError = () =>
          fail("El navegador no pudo reproducir este vídeo (¿códec no soportado?)", esFalloDeRed(v));
        v.addEventListener("error", onError);
        v.src = attempt.url;
        v.play().catch(() => {});
        cleanupRef.current = () => {
          soltarEventos();
          v.removeEventListener("error", onError);
          v.removeAttribute("src");
          v.load();
        };
      }
    }

    start();

    return () => {
      cancelled = true;
      destroyEngine();
    };
  }, [source]);

  return (
    <div className="pa-video-zone">
      <video
        ref={videoRef}
        controls={controles}
        playsInline
        onEnded={onEnded}
        aria-label={source ? `Reproduciendo ${source.name}` : "Reproductor de vídeo"}
      />
      {!source && (
        <div className="pa-video-overlay">
          <h2>Elige algo para reproducir</h2>
          <p>Selecciona un canal, película o serie de la lista para empezar a verlo aquí.</p>
        </div>
      )}
      {source && state === "loading" && (
        <div className="pa-video-overlay" style={{ pointerEvents: "none" }}>
          <div className="pa-spinner" />
          <p>Conectando con {source.name}…</p>
          {progress && progress.total > 1 && (
            <p style={{ fontSize: 13, color: "var(--text-faint)" }}>
              Probando {progress.label} ({progress.step} de {progress.total})
            </p>
          )}
        </div>
      )}
      {source && state === "error" && (
        <div className="pa-video-overlay">
          <h2>No se pudo reproducir</h2>
          {/* Y el porqué, según dónde se haya roto: contar «probamos
              conexión directa y el motor de compatibilidad» cuando lo que
              falló fue pedir la dirección manda a buscar donde no hay nada */}
          <p>
            {source.fallo
              ? "No hemos podido preparar este canal. Suele ser la sesión caducada o el proveedor sin responder."
              : "Probamos conexión directa y nuestro motor de compatibilidad sin éxito. Suele deberse a: suscripción caducada, límite de conexiones alcanzado, canal caído o proveedor que bloquea la reproducción web."}
          </p>
          <p style={{ fontSize: 12.5, color: "var(--text-faint)", maxWidth: 560 }}>
            {source.fallo ? errorDetail : `Intentos realizados — ${errorDetail}`}
          </p>
          {diag && (
            <p style={{ fontSize: 13.5, maxWidth: 560, color: "var(--warning)", pointerEvents: "auto" }} role="status">
              {diag}
            </p>
          )}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center", pointerEvents: "auto" }}>
            <button className="btn btn-primary btn-sm" onClick={diagnosticar} disabled={diagnosticando}>
              {diagnosticando ? "Diagnosticando…" : "Diagnosticar conexión"}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => navigator.clipboard?.writeText(source.url)}>
              Copiar URL (para VLC)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
