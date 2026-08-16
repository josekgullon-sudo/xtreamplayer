"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Icon, { IconName } from "@/components/Icon";
import VideoPlayer, { PlaySource } from "@/components/player/VideoPlayer";
import { parseM3U } from "@/lib/m3u";
import { imgSrc } from "@/lib/img";
import { iconoDeCategoria } from "@/lib/categorias";
import { enCristiano } from "@/lib/errores";
import {
  FilaPortada,
  MetaTitulo,
  Titulo,
  anioDe,
  armarPortada,
  candidatosDestacado,
  conMeta,
  datosDe,
  llaveTmdb,
} from "@/lib/portada";
import {
  Fuente,
  pedirEnlace,
  momentoDeArchivo,
  XtreamCategory,
  XtreamLiveStream,
  XtreamVodStream,
  XtreamSeries,
  XtreamSeriesInfo,
  xtreamApi,
  decodeBase64Maybe,
} from "@/lib/xtream";

/**
 * La aplicación de televisión.
 *
 * Una tele no es un ordenador pequeño: se maneja con cuatro flechas y un
 * OK, desde el sofá, a tres metros. Por eso esto no es el reproductor web
 * con la letra más grande, sino otra aplicación: una portada con cuatro
 * accesos, listas de una columna que se recorren con el mando y el vídeo a
 * pantalla completa. Nada de pestañas, buscadores ni ajustes — lo que no se
 * puede usar cómodamente con un mando, no está.
 *
 * Sí hay un carril de iconos a la izquierda, dentro de las listas. No es un
 * menú de ordenador: es lo que hace cualquier aplicación de televisión, y
 * está porque sin él pasar de las películas a las series eran dos ATRÁS y
 * volver a recorrer la portada. Se entra en él con ◀ desde la primera
 * columna y se sale con ▶ o con ATRÁS.
 *
 * Y no se escribe: la tele enseña un código y el cliente lo teclea desde su
 * móvil, donde escribir es gratis.
 */

type Pantalla = "portada" | "directo" | "cine" | "series" | "viendo" | "salir";

interface Lista {
  tipo: "xtream" | "m3u";
  url: string;
  usuario: string;
  password: string;
  /**
   * La cargó alguien contra la MAC de este televisor desde la web.
   *
   * Entonces su dirección no baja aquí: /api/tv/lista la devolvía entera a
   * quien preguntase por una MAC, y una MAC se adivina. La resuelve el
   * servidor en cada petición, con la MAC por delante.
   */
  porMac?: boolean;
}

interface Fila {
  id: string;
  nombre: string;
  logo: string;
  /** Una carpeta se pinta distinto y al abrirla enseña lo que hay dentro */
  carpeta?: boolean;
  /**
   * Cine y series se eligen por la carátula, no leyendo una lista: es lo que
   * hace cualquier tele y lo que la gente espera. Los canales no, que lo que
   * importa de ellos es el nombre y el número.
   */
  caratula?: boolean;
  /** El dibujo de la carpeta, deducido de su nombre. Ver lib/categorias. */
  icono?: IconName;
  /**
   * El número de canal en el panel, para pedirle su guía.
   *
   * Solo lo llevan los canales de directo de una lista Xtream: son los
   * únicos de los que hay algo que contar sobre «qué echan ahora».
   */
  epgId?: string;
  /** El número que le ha puesto el proveedor, para la cabecera del directo. */
  numero?: number;
  /** Qué hacer al pulsar OK: reproducir, o abrir la lista de episodios */
  abrir: () => void;
}

const K_DEVICE = "xp.tvDevice.v1";
const K_MAC = "xp.tvMac.v1";
const K_LISTA_MANUAL = "xp.tvLista.v1";
/**
 * La última sesión que funcionó y el último canal que se puso.
 *
 * Una tele enciende antes de tener red: cuando la app arranca, el wifi lleva
 * un par de segundos negociando. Preguntando al servidor y creyéndonos el
 * fallo, lo que salía era la pantalla de activación —a alguien que lleva
 * meses activado— o una espera en blanco. Con lo de la última vez se entra
 * igual y la comprobación se hace por detrás.
 */
const K_SESION = "xp.tvSesion.v1";
const K_ULTIMO = "xp.tvUltimo.v1";

interface SesionGuardada {
  marca: string;
  caduca: number;
  soporte: string;
  lista: Lista;
}

interface UltimoCanal {
  nombre: string;
  source: PlaySource;
}

function guardar<T>(clave: string, valor: T) {
  try {
    localStorage.setItem(clave, JSON.stringify(valor));
  } catch {
    /* almacenamiento lleno o bloqueado: no es motivo para romper nada */
  }
}

function leer<T>(clave: string): T | null {
  try {
    const raw = localStorage.getItem(clave);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function deviceKey(): string {
  try {
    let k = localStorage.getItem(K_DEVICE);
    if (!k) {
      k = `tv-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
      localStorage.setItem(K_DEVICE, k);
    }
    return k;
  } catch {
    return "tv-anonimo";
  }
}

/**
 * La MAC del aparato, la que el cliente le pasa a su proveedor.
 *
 * Ningún navegador deja leer la MAC de verdad, así que se genera una propia
 * y estable con forma de MAC — para el proveedor es lo mismo: copia lo que
 * ve en la pantalla. En las apps nativas de Samsung o LG basta con
 * sustituir esto por la MAC real del sistema.
 */
function macDelAparato(): string {
  try {
    let m = localStorage.getItem(K_MAC);
    if (!m) {
      const hex = "0123456789ABCDEF";
      const bytes: string[] = [];
      // Primer byte par: así es una MAC de aparato, no de difusión
      bytes.push(hex[Math.floor(Math.random() * 16)] + hex[[0, 2, 4, 6, 8, 10, 12, 14][Math.floor(Math.random() * 8)]]);
      for (let i = 1; i < 6; i++) {
        bytes.push(hex[Math.floor(Math.random() * 16)] + hex[Math.floor(Math.random() * 16)]);
      }
      m = bytes.join(":");
      localStorage.setItem(K_MAC, m);
    }
    return m;
  } catch {
    return "00:00:00:00:00:00";
  }
}

interface ListaManual {
  tipo: "xtream" | "m3u";
  url: string;
  usuario: string;
  password: string;
  /** Cargada contra la MAC: su dirección la sabe el servidor, no esta tele. */
  porMac?: boolean;
}

/**
 * Qué ha pulsado el mando, diga lo que diga el televisor.
 *
 * Cada fabricante manda lo suyo: un navegador de escritorio da `e.key`
 * («ArrowUp», «Escape»); una Samsung con Tizen manda el 10009 para ATRÁS y
 * una LG con webOS el 461, y ninguno de los dos rellena `e.key` con nada
 * reconocible. Traduciéndolo aquí, el resto de la aplicación no se entera de
 * en qué tele está: pregunta por «Atrás» o por «Ok» y sigue.
 */
type Tecla = "Atras" | "Ok" | "Arriba" | "Abajo" | "Izquierda" | "Derecha" | "PaginaArriba" | "PaginaAbajo" | "";

/**
 * Lo que echan en un canal, con sus horas.
 *
 * El título solo ya servía para la línea de debajo del nombre. Con el
 * principio y el final se puede además decir cuánto queda y pintar la barra,
 * que es lo que convierte una lista de nombres en una parrilla: sin ella,
 * «Telediario» no dice si empieza ahora o si le quedan dos minutos.
 */
interface Guia {
  ahora: string;
  luego: string;
  /** En milisegundos. 0 si el panel no manda horas, que pasa. */
  desde: number;
  hasta: number;
}

/** El panel manda la hora de dos maneras y a veces de ninguna. */
function momento(v?: string | number): number {
  if (v === undefined || v === null || v === "") return 0;
  const n = Number(v);
  if (Number.isFinite(n) && n > 1000000000) return n * 1000;
  /* «2026-08-12 21:00:00» sin zona: los paneles la mandan en la del
     servidor, así que se lee como local y se acepta el desvío —vale para
     pintar una barra, no para programar una grabación— */
  const t = Date.parse(String(v).replace(" ", "T"));
  return Number.isFinite(t) ? t : 0;
}

function normalizarTecla(e: KeyboardEvent): Tecla {
  switch (e.key) {
    case "Escape":
    case "Backspace":
    case "GoBack":
    case "BrowserBack":
      return "Atras";
    case "Enter":
    case " ":
      return "Ok";
    case "ArrowUp":
      return "Arriba";
    case "ArrowDown":
      return "Abajo";
    case "ArrowLeft":
      return "Izquierda";
    case "ArrowRight":
      return "Derecha";
    case "PageUp":
      return "PaginaArriba";
    case "PageDown":
      return "PaginaAbajo";
  }
  switch (e.keyCode) {
    case 10009: // ATRÁS de Samsung (Tizen)
    case 461: // ATRÁS de LG (webOS)
    case 8:
    case 27:
      return "Atras";
    case 13:
      return "Ok";
    case 38:
      return "Arriba";
    case 40:
      return "Abajo";
    case 37:
      return "Izquierda";
    case 39:
      return "Derecha";
    case 33:
      return "PaginaArriba";
    case 34:
      return "PaginaAbajo";
    default:
      return "";
  }
}

function leerListaManual(): ListaManual | null {
  try {
    const raw = localStorage.getItem(K_LISTA_MANUAL);
    return raw ? (JSON.parse(raw) as ListaManual) : null;
  } catch {
    return null;
  }
}

export default function TvApp() {
  const [sesion, setSesion] = useState<"cargando" | "sin-sesion" | "dentro">("cargando");
  const [codigo, setCodigo] = useState<string>("");
  const [avisoCodigo, setAvisoCodigo] = useState("");
  const [marca, setMarca] = useState("TOTALplayer");
  const [caduca, setCaduca] = useState(0);
  const [soporte, setSoporte] = useState("");
  const [lista, setLista] = useState<Lista | null>(null);

  const [pantalla, setPantalla] = useState<Pantalla>("portada");
  const [filas, setFilas] = useState<Fila[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [foco, setFoco] = useState(0);
  const [viendo, setViendo] = useState<{ source: PlaySource; epgId?: string } | null>(null);
  /** Serie abierta: sus episodios sustituyen a la lista mientras dure */
  const [serieAbierta, setSerieAbierta] = useState<string>("");
  /** Carpeta abierta dentro de una sección (null = viendo las carpetas) */
  const [carpetaAbierta, setCarpetaAbierta] = useState<string>("");
  const [poniendoLista, setPoniendoLista] = useState(false);
  const [haciendoLogin, setHaciendoLogin] = useState(false);
  const [entrando, setEntrando] = useState(false);
  /** Arrancamos con lo de la última vez porque no hubo forma de preguntar */
  const [sinRed, setSinRed] = useState(false);
  /** Lo último que se estaba viendo, para volver con un solo OK */
  const [ultimo, setUltimo] = useState<UltimoCanal | null>(null);
  /**
   * Columnas que ha puesto de verdad la rejilla de carátulas. Se miden en vez
   * de darlas por sabidas: el mando tiene que bajar exactamente una fila, y
   * una tele de 4K y el navegador de pruebas no caben lo mismo.
   */
  const [columnas, setColumnas] = useState(1);
  /**
   * Qué icono del carril tiene el foco, o null si el foco está en la lista.
   *
   * Va aparte de `foco` a propósito: el carril y la lista son dos sitios
   * distintos y el mando tiene que poder volver de uno al otro sin perder
   * por dónde iba. Con un solo número, entrar en el carril y salir dejaba
   * la lista siempre arriba del todo.
   */
  const [focoCarril, setFocoCarril] = useState<number | null>(null);
  /**
   * Qué echan ahora en cada canal de la carpeta abierta.
   *
   * En una tele es donde más falta hace: con el mando no hay forma barata de
   * asomarse a un canal y volver, así que sin esto se elige a ciegas por el
   * nombre. Solo de la carpeta abierta y de los primeros, que es hasta donde
   * llega la vista antes de empezar a bajar.
   */
  const [epgAhora, setEpgAhora] = useState<Record<string, Guia>>({});
  /*
   * Y el mismo dato en una caja que el mando pueda leer siempre.
   *
   * El manejador de teclas se vuelve a colgar en un efecto, que corre
   * después de pintar. Dos pulsaciones seguidas —◀ y ATRÁS, que con un
   * mando es lo normal— llegaban antes de eso, y la segunda la atendía
   * todavía el manejador de la pulsación anterior: creía que el foco seguía
   * en la lista y ATRÁS salía de la sección en vez de salir del carril.
   */
  const focoCarrilRef = useRef<number | null>(null);
  focoCarrilRef.current = focoCarril;

  /**
   * Si el foco lo ha movido el mando o el ratón.
   *
   * Con el mando hay que llevar lo enfocado al centro de la pantalla, que si
   * no se sale por abajo y se navega a ciegas. Con el ratón, **no**: pasar
   * por encima de una carátula movía la lista para centrarla, con lo que
   * debajo del puntero quedaba otra distinta, que se enfocaba, y vuelta a
   * empezar. En el ejecutable de Windows eso era un carrusel que se movía
   * solo sin tocar nada.
   */
  const conElMando = useRef(true);

  /* ---------- La portada de cine y de series ---------- */

  /**
   * Cine y series no abren en una lista de carpetas, abren en una portada.
   *
   * Entrar en «Películas» y encontrarse cuarenta nombres de carpeta obliga a
   * saber en cuál buscar antes de poder mirar nada. La portada contesta a la
   * pregunta con la que se entra —«¿y qué veo?»—: un banner arriba y filas
   * de carátulas debajo. Las carpetas siguen ahí, al final, en «Ver todas».
   */
  const [vista, setVista] = useState<"portada" | "carpetas">("portada");
  const [filasPortada, setFilasPortada] = useState<FilaPortada[]>([]);
  /** Qué fila y qué carátula tienen el foco. La fila −1 es el banner. */
  const [focoFila, setFocoFila] = useState(-1);
  const [focoCol, setFocoCol] = useState(0);
  const [candidatos, setCandidatos] = useState<Titulo[]>([]);
  /**
   * Las carátulas que el navegador no ha podido cargar.
   *
   * Una parte del catálogo de cualquier proveedor apunta a imágenes que ya
   * no existen. Aquí no hace falta comprobarlas por adelantado como en la
   * aplicación nativa: el propio `onError` de la imagen lo dice, y con eso
   * el banner pasa al siguiente candidato y las filas de escaparate se
   * quedan sin ese hueco. Se arregla solo y no cuesta ni una petición.
   */
  const [rotas, setRotas] = useState<Record<string, true>>({});
  const marcarRota = useCallback((url: string) => {
    setRotas((prev) => (prev[url] ? prev : { ...prev, [url]: true }));
  }, []);

  /*
   * Con una serie abierta la portada se aparta.
   *
   * Los episodios se cargan en `filas`, que es la lista de siempre; sin esta
   * condición se quedaban detrás de la portada y pulsar OK sobre una serie
   * no hacía nada visible. Lo mismo con una carpeta abierta.
   */
  const enPortada =
    (pantalla === "cine" || pantalla === "series") &&
    vista === "portada" &&
    !serieAbierta &&
    !carpetaAbierta;

  /**
   * Lo que TMDB sabe de los títulos de la portada, si esta instalación lo usa.
   *
   * Llega después de pintar y a propósito: la portada se enseña con lo que
   * manda el panel —que es instantáneo— y cuando llega lo de TMDB se
   * refresca sola con el fondo apaisado, la sinopsis en español y la nota de
   * verdad. Si no hay clave configurada, esto se queda vacío para siempre y
   * no cambia nada.
   */
  const [meta, setMeta] = useState<Record<string, MetaTitulo>>({});
  const mejor = useCallback((t: Titulo) => conMeta(t, meta[llaveTmdb(t)]), [meta]);

  /** El primer candidato cuya carátula no haya fallado. */
  const crudo = candidatos.find((t) => !rotas[t.imagen]) || null;
  const destacado = crudo ? mejor(crudo) : null;

  /**
   * Las filas ya limpias: en las de escaparate, sin los que no tienen imagen.
   *
   * En la fila de una carpeta se dejan todos. Ahí están los títulos que hay,
   * y esconder la mitad porque el proveedor no les puso carátula es quitarle
   * catálogo al cliente; en un escaparate elegido de entre treinta
   * candidatos, no.
   */
  const filasALaVista: FilaPortada[] = filasPortada
    .map((f) => {
      const items = f.items.map(mejor);
      return f.escaparate
        ? { ...f, items: items.filter((t) => !rotas[t.imagen]).slice(0, 10) }
        : { ...f, items };
    })
    .filter((f) => f.items.length >= (f.escaparate ? 4 : 1));

  useEffect(() => {
    setUltimo(leer<UltimoCanal>(K_ULTIMO));
  }, []);

  /** Entrar con el usuario del proveedor, desde la propia tele */
  async function entrarConUsuario(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setEntrando(true);
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/customer/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: fd.get("usuario"),
        password: fd.get("password"),
        // La tele se identifica con su MAC: así el proveedor la reconoce
        deviceKey: `mac-${macDelAparato()}`,
        platform: "tv",
      }),
    });
    const data = await res.json();
    setEntrando(false);
    if (!res.ok) {
      setError(data.error || "No hemos podido entrar con esos datos");
      return;
    }
    setHaciendoLogin(false);
    await mirarSesion();
  }

  /** Lista puesta a mano en la propia tele, para quien no tiene proveedor */
  function guardarListaManual(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const fd = new FormData(e.currentTarget);
    const url = String(fd.get("url") || "").trim();
    const usuario = String(fd.get("usuario") || "").trim();
    const password = String(fd.get("password") || "").trim();
    if (!/^https?:\/\//i.test(url)) {
      setError("La dirección debe empezar por http:// o https://");
      return;
    }
    // Con usuario y contraseña es un panel Xtream; sin ellos, una lista M3U
    const nueva: ListaManual = { tipo: usuario && password ? "xtream" : "m3u", url, usuario, password };
    try {
      localStorage.setItem(K_LISTA_MANUAL, JSON.stringify(nueva));
    } catch {
      /* almacenamiento bloqueado: se usa igual mientras dure la sesión */
    }
    setLista(nueva);
    setPoniendoLista(false);
    setSesion("dentro");
  }

  const listaRef = useRef<HTMLDivElement>(null);

  /* ---------- Sesión: o ya la hay, o se empareja con un código ---------- */

  const mirarSesion = useCallback(async () => {
    /*
     * Distinguimos «el servidor dice que no hay sesión» de «no hemos podido
     * preguntar». Antes las dos acababan en la pantalla de activación, y la
     * segunda es lo que le pasa a una tele que enciende antes que el wifi.
     */
    let d: Record<string, unknown> | null = null;
    try {
      d = await fetch("/api/customer/me").then((r) => r.json());
    } catch {
      const guardada = leer<SesionGuardada>(K_SESION);
      if (guardada) {
        setMarca(guardada.marca);
        setCaduca(guardada.caduca);
        setSoporte(guardada.soporte);
        setLista(guardada.lista);
        setSesion("dentro");
        setSinRed(true);
        return true;
      }
      const manualSinRed = leerListaManual();
      if (manualSinRed) {
        setLista(manualSinRed);
        setSesion("dentro");
        setSinRed(true);
        return true;
      }
      setSesion("sin-sesion");
      setSinRed(true);
      return false;
    }
    setSinRed(false);
    if (!d || !d.customer || !d.playlist) {
      /*
       * Sin cliente puede haber una lista puesta a mano en esta tele: quien
       * compra la app sin proveedor detrás también tiene derecho a verla.
       */
      const manual = leerListaManual();
      if (manual) {
        setLista(manual);
        setSesion("dentro");
        return true;
      }
      setSesion("sin-sesion");
      return false;
    }
    const respuesta = d as unknown as {
      brand?: string;
      customer?: { expiresAt?: number };
      branding?: { support?: string };
      playlist: { type: "xtream" | "m3u"; url: string; username?: string; password?: string };
    };
    const nueva: SesionGuardada = {
      marca: respuesta.brand || "TOTALplayer",
      caduca: respuesta.customer?.expiresAt || 0,
      soporte: respuesta.branding?.support || "",
      lista: {
        tipo: respuesta.playlist.type,
        url: respuesta.playlist.url,
        usuario: respuesta.playlist.username || "",
        password: respuesta.playlist.password || "",
      },
    };
    setMarca(nueva.marca);
    setCaduca(nueva.caduca);
    setSoporte(nueva.soporte);
    setLista(nueva.lista);
    // Guardada para el próximo encendido, que puede ser sin red todavía
    guardar(K_SESION, nueva);
    setSesion("dentro");
    return true;
  }, []);

  useEffect(() => {
    mirarSesion().then((dentro) => {
      if (!dentro) pedirCodigo();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function pedirCodigo() {
    setAvisoCodigo("");
    const r = await fetch("/api/tv/code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceKey: deviceKey() }),
    }).then((x) => x.json());
    setCodigo(r.code || "");
  }

  /*
   * Mientras espera, la tele mira por los dos caminos a la vez: si su MAC ya
   * está dada de alta por el proveedor, o si alguien ha reclamado su código.
   * El cliente usa el que le resulte más cómodo y la tele no pregunta cuál.
   */
  useEffect(() => {
    if (sesion !== "sin-sesion") return;
    const t = setInterval(async () => {
      const porMac = await fetch(`/api/tv/mac?mac=${encodeURIComponent(macDelAparato())}`)
        .then((x) => x.json())
        .catch(() => ({}));
      if (porMac.estado === "listo") {
        clearInterval(t);
        await mirarSesion();
        return;
      }
      // Lista cargada contra la MAC desde la web, sin proveedor de por medio
      if (porMac.estado === "lista" && porMac.lista) {
        clearInterval(t);
        const l: ListaManual = {
          tipo: porMac.lista.tipo === "xtream" ? "xtream" : "m3u",
          url: "",
          usuario: "",
          password: "",
          porMac: true,
        };
        try {
          localStorage.setItem(K_LISTA_MANUAL, JSON.stringify(l));
        } catch {
          /* almacenamiento bloqueado */
        }
        setMarca(porMac.lista.nombre || "TOTALplayer");
        setLista(l);
        setSesion("dentro");
        return;
      }
      if (porMac.estado === "sin-hueco") {
        clearInterval(t);
        setAvisoCodigo(porMac.error || "No quedan dispositivos libres en tu cuenta");
        return;
      }
      if (!codigo) return;
      const r = await fetch(`/api/tv/code?code=${codigo}`).then((x) => x.json()).catch(() => ({}));
      if (r.estado === "listo") {
        clearInterval(t);
        await mirarSesion();
      } else if (r.estado === "caducado") {
        pedirCodigo();
      } else if (r.estado === "sin-hueco") {
        clearInterval(t);
        setAvisoCodigo(r.error || "No quedan dispositivos libres en tu cuenta");
      }
    }, 3000);
    return () => clearInterval(t);
  }, [sesion, codigo, mirarSesion]);

  /* ---------- Contenido ---------- */

  /*
   * De dónde sale la lista de esta tele.
   *
   * Aquí conviven dos casos: la que se teclea a mano en el propio televisor
   * —suya, y por eso puede ir con sus datos— y la del cliente de un
   * proveedor, que entra con su galleta y a la que el servidor le resuelve
   * el origen sin que viaje nada. Cuando hay sesión de cliente, el servidor
   * ignora lo que se le mande aquí y usa la suya: mandarle una dirección
   * elegida no le sirve de nada.
   */
  const creds: Fuente | null = lista
    ? lista.porMac
      ? { mac: macDelAparato() }
      : { base: lista.url, username: lista.usuario, password: lista.password }
    : null;

  const reproducir = useCallback((source: PlaySource, epgId?: string) => {
    setViendo({ source, epgId });
    setPantalla("viendo");
    /* En una tele se vuelve casi siempre a lo mismo. Guardarlo cuesta una
       línea y ahorra recorrer otra vez carpeta, categoría y canal */
    const ultimoCanal: UltimoCanal = { nombre: source.name, source };
    setUltimo(ultimoCanal);
    guardar(K_ULTIMO, ultimoCanal);
  }, []);

  /** Entra en una carpeta: su contenido sustituye a la lista de carpetas */
  const entrarEnCarpeta = useCallback((nombre: string, contenido: Fila[]) => {
    setCarpetaAbierta(nombre);
    setFilas(contenido);
    setFoco(0);
  }, []);

  /**
   * Agrupa por categoría con el nombre que da el panel. Lo que no encaja en
   * ninguna (pasa a menudo) va a una carpeta propia en vez de desaparecer.
   */
  const carpetasDe = useCallback(
    function <T>(
      cats: XtreamCategory[] | unknown,
      elementos: T[],
      catDe: (x: T) => string | undefined,
      aFila: (x: T) => Fila
    ): Fila[] {
      const nombres = new Map<string, string>();
      for (const c of Array.isArray(cats) ? (cats as XtreamCategory[]) : []) {
        nombres.set(String(c.category_id), c.category_name || "Sin nombre");
      }
      /*
       * Las carpetas salen en el orden que manda el panel, no en el que
       * aparezca el primer canal de cada una. Ese orden lo ha puesto el
       * proveedor a propósito —sus destacados primero, luego TDT,
       * autonómicos…— y llegaban revueltas porque se iban creando según se
       * recorrían los canales.
       */
      const porCat = new Map<string, T[]>();
      for (const c of Array.isArray(cats) ? (cats as XtreamCategory[]) : []) {
        porCat.set(String(c.category_id), []);
      }
      for (const el of elementos) {
        const id = String(catDe(el) ?? "");
        const clave = nombres.has(id) ? id : "__sueltos__";
        if (!porCat.has(clave)) porCat.set(clave, []);
        porCat.get(clave)!.push(el);
      }
      // Una categoría del panel que se quede sin nada no se enseña
      for (const [clave, suyos] of porCat) if (!suyos.length) porCat.delete(clave);
      return [...porCat.entries()].map(([clave, suyos]) => {
        const titulo = clave === "__sueltos__" ? "Otros" : nombres.get(clave) || "Sin nombre";
        return {
          id: `cat-${clave}`,
          nombre: `${titulo}  (${suyos.length})`,
          logo: "",
          carpeta: true,
          icono: iconoDeCategoria(titulo),
          abrir: () => entrarEnCarpeta(titulo, suyos.map(aFila)),
        };
      });
    },
    [entrarEnCarpeta]
  );

  /**
   * Qué hacer al pulsar OK sobre cada título de la portada.
   *
   * La portada trabaja con `Titulo`, que es un dato pelado a propósito —para
   * poder ordenarlo y compararlo sin arrastrar media aplicación detrás—, así
   * que las acciones se guardan aparte y se buscan por identificador.
   */
  const acciones = useRef(new Map<string, () => void | Promise<void>>());

  const montarPortada = useCallback(
    (
      cats: XtreamCategory[] | unknown,
      titulos: Titulo[],
      abridores: (() => void | Promise<void>)[]
    ) => {
      acciones.current = new Map(titulos.map((t, i) => [t.id, abridores[i]]));
      const categorias = (Array.isArray(cats) ? (cats as XtreamCategory[]) : []).map((c) => ({
        id: String(c.category_id),
        nombre: c.category_name || "Sin nombre",
      }));
      const hoy = new Date().getFullYear();
      const nuevas = armarPortada(titulos, categorias, hoy);
      setFilasPortada(nuevas);
      setCandidatos(candidatosDestacado(nuevas, hoy));
      setFocoFila(-1);
      setFocoCol(0);
    },
    []
  );

  const abrirTitulo = useCallback((t: Titulo) => {
    acciones.current.get(t.id)?.();
  }, []);

  /*
   * Y en cuanto la portada está en pie, se le pregunta a TMDB por lo que se
   * ve. No por el catálogo: por los títulos de las filas, que son ciento y
   * pico. El servidor los tiene guardados de la primera vez que alguien —de
   * cualquier proveedor— abrió una portada con ellos.
   */
  useEffect(() => {
    if (!enPortada || !filasPortada.length) return;
    const unicos = new Map<string, Titulo>();
    for (const f of filasPortada) for (const t of f.items) unicos.set(llaveTmdb(t), t);
    const pendientes = [...unicos.entries()].filter(([llave]) => !meta[llave]);
    if (!pendientes.length) return;

    let cancelado = false;
    (async () => {
      try {
        const r = await fetch(`/api/meta?mac=${encodeURIComponent(macDelAparato())}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            titulos: pendientes.slice(0, 200).map(([, t]) => ({
              nombre: t.nombre,
              anio: t.anio,
              serie: t.esSerie,
            })),
          }),
        }).then((x) => x.json());
        if (cancelado || !Array.isArray(r.meta) || !r.meta.length) return;
        setMeta((antes) => {
          const siguiente = { ...antes };
          for (const m of r.meta as MetaTitulo[]) siguiente[m.llave] = m;
          return siguiente;
        });
      } catch {
        /* Sin TMDB la portada se queda con lo del panel, que es como estaba */
      }
    })();
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enPortada, filasPortada]);

  const cargar = useCallback(
    async (destino: Pantalla) => {
      if (!lista) return;
      setCargando(true);
      setError("");
      setFilas([]);
      setFoco(0);
      setSerieAbierta("");
      setCarpetaAbierta("");
      try {
        /*
         * Primero las carpetas, nunca la lista entera de golpe. Con una lista
         * real son miles de canales seguidos y encontrar uno con las flechas
         * del mando es imposible: se entra por su categoría, como en
         * cualquier reproductor de tele.
         */
        if (lista.tipo === "m3u") {
          const texto = await fetch(
            lista.porMac
              ? `/api/m3u?mac=${encodeURIComponent(macDelAparato())}`
              : `/api/m3u?url=${encodeURIComponent(lista.url)}`
          ).then((r) => r.text());
          const canales = parseM3U(texto).channels;
          const porGrupo = new Map<string, typeof canales>();
          for (const c of canales) {
            const g = c.group || "Sin carpeta";
            if (!porGrupo.has(g)) porGrupo.set(g, []);
            porGrupo.get(g)!.push(c);
          }
          setFilas(
            [...porGrupo.entries()].map(([grupo, suyos]) => ({
              id: `grupo-${grupo}`,
              nombre: `${grupo}  (${suyos.length})`,
              logo: "",
              carpeta: true,
              icono: iconoDeCategoria(grupo),
              abrir: () =>
                entrarEnCarpeta(
                  grupo,
                  suyos.map((c, i) => ({
                    id: `m3u-${grupo}-${i}`,
                    nombre: c.name || `Canal ${i + 1}`,
                    logo: c.logo || "",
                    abrir: () => reproducir({ url: c.url, name: c.name || "", kind: "auto" }),
                  }))
                ),
            }))
          );
          return;
        }
        if (!creds) return;
        if (destino === "directo") {
          const [cats, canales] = await Promise.all([
            xtreamApi<XtreamCategory[]>(creds, "get_live_categories"),
            xtreamApi<XtreamLiveStream[]>(creds, "get_live_streams"),
          ]);
          const limpios = (Array.isArray(canales) ? canales : []).filter(
            (c) => typeof c.name === "string" && c.name.trim()
          );
          setFilas(
            carpetasDe(cats, limpios, (c) => c.category_id, (c) => ({
              id: `live-${c.stream_id}`,
              nombre: c.name,
              logo: c.stream_icon || "",
              epgId: String(c.stream_id),
              numero: Number(c.num) || 0,
              abrir: async () =>
                reproducir(
                  {
                    ...(await pedirEnlace({ ...creds, clase: "live", id: String(c.stream_id) })),
                    name: c.name,
                    kind: "hls",
                  },
                  String(c.stream_id)
                ),
            }))
          );
        } else if (destino === "cine") {
          const [cats, pelis] = await Promise.all([
            xtreamApi<XtreamCategory[]>(creds, "get_vod_categories"),
            xtreamApi<XtreamVodStream[]>(creds, "get_vod_streams"),
          ]);
          const limpias = (Array.isArray(pelis) ? pelis : []).filter(
            (v) => typeof v.name === "string" && v.name.trim()
          );
          const verPeli = (v: XtreamVodStream) => async () =>
            reproducir({
              ...(await pedirEnlace({
                ...creds,
                clase: "movie",
                id: String(v.stream_id),
                ext: v.container_extension || "mp4",
              })),
              name: v.name,
              kind: "video",
            });
          setFilas(
            carpetasDe(cats, limpias, (v) => v.category_id, (v) => ({
              id: `vod-${v.stream_id}`,
              nombre: v.name,
              logo: v.stream_icon || "",
              caratula: true,
              abrir: verPeli(v),
            }))
          );
          montarPortada(
            cats,
            limpias.map((v) => ({
              id: `vod-${v.stream_id}`,
              nombre: v.name,
              imagen: v.stream_icon || "",
              anio: anioDe(v.year ?? v.releasedate),
              nota: String(v.rating ?? ""),
              alta: Number(v.added) || 0,
              sinopsis: String(v.plot ?? ""),
              generos: String(v.genre ?? ""),
              esSerie: false,
              categoria: String(v.category_id ?? ""),
            })),
            limpias.map(verPeli)
          );
        } else if (destino === "series") {
          const [cats, series] = await Promise.all([
            xtreamApi<XtreamCategory[]>(creds, "get_series_categories"),
            xtreamApi<XtreamSeries[]>(creds, "get_series"),
          ]);
          const limpias = (Array.isArray(series) ? series : []).filter(
            (s) => typeof s.name === "string" && s.name.trim()
          );
          setFilas(
            carpetasDe(cats, limpias, (s) => s.category_id, (s) => ({
              id: `serie-${s.series_id}`,
              nombre: s.name,
              logo: s.cover || "",
              caratula: true,
              abrir: () => abrirSerie(s),
            }))
          );
          montarPortada(
            cats,
            limpias.map((s) => ({
              id: `serie-${s.series_id}`,
              nombre: s.name,
              imagen: s.cover || "",
              anio: anioDe(s.releaseDate ?? s.release_date),
              nota: String(s.rating ?? ""),
              alta: Number(s.last_modified) || 0,
              sinopsis: String(s.plot ?? ""),
              generos: String(s.genre ?? ""),
              esSerie: true,
              categoria: String(s.category_id ?? ""),
            })),
            limpias.map((s) => () => abrirSerie(s))
          );
        }
      } catch (e) {
        setError(enCristiano(e, "No se pudo cargar"));
      } finally {
        setCargando(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lista, reproducir]
  );

  async function abrirSerie(s: XtreamSeries) {
    if (!creds) return;
    setCargando(true);
    try {
      const info = await xtreamApi<XtreamSeriesInfo>(creds, "get_series_info", { series_id: String(s.series_id) });
      const temporadas = Object.entries(info.episodes || {});
      const eps: Fila[] = [];
      for (const [temporada, lista] of temporadas) {
        for (const ep of lista || []) {
          eps.push({
            id: `ep-${ep.id}`,
            nombre: `T${temporada} · E${ep.episode_num} — ${ep.title || "Episodio"}`,
            logo: s.cover || "",
            abrir: async () =>
              reproducir({
                ...(await pedirEnlace({
                  ...creds,
                  clase: "series",
                  id: ep.id,
                  ext: ep.container_extension || "mp4",
                })),
                name: `${s.name} — ${ep.title || ""}`,
                kind: "video",
              }),
          });
        }
      }
      setSerieAbierta(s.name);
      setFilas(eps);
      setFoco(0);
    } catch {
      setError("No se pudieron cargar los episodios");
    } finally {
      setCargando(false);
    }
  }

  /**
   * «Salir» cierra de verdad: suelta la sesión del cliente y la lista que
   * tuviera puesta este aparato, y vuelve a la pantalla de activación. Antes
   * llevaba a la web, que en una tele no sirve de nada.
   */
  async function salir() {
    if (!confirm("¿Salir de esta lista? Tendrás que volver a activar la tele.")) return;
    await fetch("/api/customer/me", { method: "DELETE" }).catch(() => {});
    try {
      localStorage.removeItem(K_LISTA_MANUAL);
    } catch {
      /* almacenamiento bloqueado */
    }
    // La lista guardada contra la MAC también se suelta: si no, la tele
    // volvería a entrar sola con ella en el siguiente sondeo
    await fetch(`/api/tv/lista?mac=${encodeURIComponent(macDelAparato())}`, { method: "DELETE" }).catch(() => {});
    window.location.reload();
  }

  function elegirDestino(destino?: Pantalla) {
    if (!destino) return;
    if (destino === "salir") {
      salir();
      return;
    }
    /* Volver a la portada desde el carril deja lo mismo que ATRÁS: sin la
       lista de la sección anterior debajo y con el foco en el acceso del
       que se sale, no en la fila 47 de una lista que ya no está */
    if (destino === "portada") {
      const vengoDe = DESTINOS.findIndex((d) => d.id === pantalla);
      setFoco(vengoDe >= 0 ? vengoDe : 0);
      setFilas([]);
      setSerieAbierta("");
      setCarpetaAbierta("");
      setFocoCarril(null);
      setPantalla("portada");
      return;
    }
    ir(destino);
  }

  /**
   * De la portada a la lista de carpetas de siempre.
   *
   * La portada enseña seis carpetas y veinte títulos de cada una. Un
   * proveedor trae cuarenta carpetas y miles de títulos: sin esta puerta, el
   * resto del catálogo dejaría de existir. No vuelve a pedir nada —las
   * carpetas se armaron en la misma carga que la portada—.
   */
  function verCarpetas() {
    setVista("carpetas");
    setFoco(0);
  }

  function ir(destino: Pantalla) {
    setPantalla(destino);
    setFocoCarril(null);
    /* Cine y series siempre abren por la portada, aunque la última vez se
       saliera desde la lista de carpetas: al entrar se pregunta «qué veo», no
       «en qué carpeta estaba» */
    setVista("portada");
    setFilasPortada([]);
    setCandidatos([]);
    if (destino !== "portada" && destino !== "viendo") cargar(destino);
  }

  /**
   * ATRÁS deshace un paso cada vez, en el orden en que se entró:
   * vídeo → episodios → carpeta → carpetas de la sección → portada.
   */
  function atras() {
    if (pantalla === "viendo") {
      setViendo(null);
      // Vuelve a la lista de la que se salió, no a la portada
      setPantalla(filas.length ? ultimaLista.current : "portada");
      return;
    }
    if (serieAbierta) {
      setSerieAbierta("");
      // Los episodios se abrieron desde dentro de una carpeta de series
      cargar("series");
      setCarpetaAbierta("");
      return;
    }
    if (carpetaAbierta) {
      setCarpetaAbierta("");
      cargar(pantalla);
      return;
    }
    /* Y de la lista de carpetas se vuelve a la portada, que es de donde se
       entró: si no, ATRÁS se saltaba un paso y salía al menú */
    if (vista === "carpetas" && (pantalla === "cine" || pantalla === "series")) {
      setVista("portada");
      return;
    }
    /* De vuelta en la portada, el foco se queda en el acceso del que sales.
       Si no, hereda la posición que tuviera la lista —la carátula 14, por
       ejemplo— y la portada aparece con un acceso cualquiera iluminado. */
    const vengoDe = DESTINOS.findIndex((d) => d.id === pantalla);
    setFoco(vengoDe >= 0 ? vengoDe : 0);
    setPantalla("portada");
    setFilas([]);
  }

  /*
   * Las guías de los canales de la carpeta abierta.
   *
   * De seis en seis y hasta cuarenta: en una tele caben doce filas en
   * pantalla, y una carpeta de noventa canales no justifica noventa
   * peticiones al panel para enseñar las doce que se ven. Se vacía al
   * cambiar de carpeta, que es cuando dejan de valer.
   */
  useEffect(() => {
    setEpgAhora({});
    if (pantalla !== "directo" || !creds || lista?.tipo !== "xtream") return;
    const ids = filas.map((f) => f.epgId).filter((id): id is string => Boolean(id)).slice(0, 40);
    if (!ids.length) return;

    let cancelado = false;
    (async () => {
      for (let i = 0; i < ids.length && !cancelado; i += 6) {
        const tanda = ids.slice(i, i + 6);
        const hechas = await Promise.all(
          tanda.map(async (id) => {
            const vacia: Guia = { ahora: "", luego: "", desde: 0, hasta: 0 };
            try {
              const res = await xtreamApi<{
                epg_listings?: {
                  title?: string;
                  start?: string;
                  end?: string;
                  start_timestamp?: string | number;
                  stop_timestamp?: string | number;
                }[];
              }>(creds, "get_short_epg", { stream_id: id, limit: "2" });
              const listado = res.epg_listings || [];
              if (!listado.length) return [id, vacia] as const;
              /*
               * El que está en antena, no el primero de la lista.
               *
               * `get_short_epg` empieza donde le parece al panel: unos lo
               * hacen en el programa en curso y otros en el bloque de la
               * hora anterior, que ya ha terminado. Cogiendo el primero a
               * ciegas se anunciaba como «ahora» algo emitido hace una hora,
               * y la barra de progreso salía llena o no salía.
               */
              const horas = listado.map((e) => ({
                titulo: decodeBase64Maybe(e.title) || "",
                desde: momento(e.start_timestamp ?? e.start),
                hasta: momento(e.stop_timestamp ?? e.end),
              }));
              const cuando = Date.now();
              let i = horas.findIndex((e) => e.desde && e.hasta && e.desde <= cuando && cuando < e.hasta);
              if (i < 0) i = 0;
              return [
                id,
                {
                  ahora: horas[i].titulo,
                  luego: horas[i + 1]?.titulo || "",
                  desde: horas[i].desde,
                  hasta: horas[i].hasta,
                } as Guia,
              ] as const;
            } catch {
              return [id, vacia] as const;
            }
          })
        );
        if (cancelado) return;
        setEpgAhora((prev) => {
          const siguiente = { ...prev };
          for (const [id, guia] of hechas) siguiente[id] = guia;
          return siguiente;
        });
      }
    })();
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pantalla, filas, lista]);

  const ultimaLista = useRef<Pantalla>("directo");
  useEffect(() => {
    if (pantalla === "directo" || pantalla === "cine" || pantalla === "series") ultimaLista.current = pantalla;
  }, [pantalla]);

  /* ---------- El mando ---------- */

  /* Una lista de películas o de series se enseña en carátulas grandes; los
     canales, las carpetas y los episodios, en filas con su nombre. Basta con
     que algo de lo que hay pida carátula: nunca se mezclan las dos cosas. */
  const rejilla = filas.length > 0 && filas.some((f) => f.caratula);

  /* ---------- La cabecera viva del directo ---------- */

  /*
   * El canal que hay debajo del foco, con su guía.
   *
   * Solo dentro de una carpeta de canales: en la lista de carpetas no hay
   * canal que enseñar, y en cine y series manda la portada.
   */
  const enDirecto = pantalla === "directo" && Boolean(carpetaAbierta);
  const canalMirado = enDirecto ? filas[foco] : undefined;
  const guiaMirada = canalMirado?.epgId ? epgAhora[canalMirado.epgId] : undefined;

  /*
   * Cuánto lleva y cuánto le queda.
   *
   * El reloj corre, así que esto se recalcula solo cada medio minuto: sin
   * eso, la barra se quedaba clavada donde estaba al abrir la carpeta y a
   * los diez minutos mentía.
   */
  /**
   * El rótulo de encima del vídeo, que se va solo.
   *
   * Es lo que hace cualquier televisor: al poner un canal dice cuál es y a
   * los pocos segundos desaparece. Dejarlo fijo es tener un cartel encima de
   * la película durante dos horas.
   */
  const [osd, setOsd] = useState(true);
  useEffect(() => {
    if (pantalla !== "viendo") return;
    setOsd(true);
    const t = setTimeout(() => setOsd(false), 5000);
    return () => clearTimeout(t);
  }, [pantalla, viendo]);

  const [ahoraMismo, setAhoraMismo] = useState(() => Date.now());
  useEffect(() => {
    if (!enDirecto) return;
    const t = setInterval(() => setAhoraMismo(Date.now()), 30000);
    return () => clearInterval(t);
  }, [enDirecto]);

  const avance = (() => {
    if (!guiaMirada?.desde || !guiaMirada.hasta || guiaMirada.hasta <= guiaMirada.desde) return null;
    const parte = (ahoraMismo - guiaMirada.desde) / (guiaMirada.hasta - guiaMirada.desde);
    if (parte < 0 || parte > 1) return null;
    return Math.round(parte * 100);
  })();

  const queda = (() => {
    if (!guiaMirada?.hasta) return "";
    const minutos = Math.round((guiaMirada.hasta - ahoraMismo) / 60000);
    if (minutos <= 0 || minutos > 600) return "";
    return minutos < 60 ? `quedan ${minutos} min` : `quedan ${Math.floor(minutos / 60)} h ${minutos % 60} min`;
  })();

  // Cuántas carátulas ha puesto el navegador por fila, para que baje una fila
  useEffect(() => {
    if (!rejilla) {
      setColumnas(1);
      return;
    }
    const medir = () => {
      const celdas = listaRef.current?.querySelectorAll<HTMLElement>("[data-i]");
      if (!celdas?.length) return;
      const primera = celdas[0].offsetTop;
      let n = 0;
      for (const c of celdas) {
        if (c.offsetTop !== primera) break;
        n++;
      }
      setColumnas(Math.max(1, n));
    };
    medir();
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, [rejilla, filas]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // En un input (el emparejado no tiene, pero por si acaso) manda el input
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      conElMando.current = true;

      const tecla = normalizarTecla(e);

      if (tecla === "Atras") {
        e.preventDefault();
        /* Estando en el carril, ATRÁS es salir del carril y no de la
           pantalla: si no, entrar sin querer costaba volver a cargarlo todo */
        if (focoCarrilRef.current !== null) setFocoCarril(null);
        else atras();
        return;
      }
      if (pantalla === "viendo") return;

      /* El carril: mientras el foco está en él, se mueve por sus iconos y
         nada de lo que hay a la derecha se entera */
      if (focoCarrilRef.current !== null) {
        if (tecla === "Arriba" || tecla === "Abajo") {
          e.preventDefault();
          setFocoCarril((f) => {
            const n = (f ?? 0) + (tecla === "Abajo" ? 1 : -1);
            return (n + CARRIL.length) % CARRIL.length;
          });
        } else if (tecla === "Derecha") {
          e.preventDefault();
          setFocoCarril(null);
        } else if (tecla === "Ok") {
          e.preventDefault();
          const destino = CARRIL[focoCarrilRef.current]?.id;
          setFocoCarril(null);
          elegirDestino(destino);
        }
        return;
      }

      /*
       * La portada se recorre distinto: filas de lado y no una columna.
       *
       * Arriba y abajo cambian de fila —del banner a «Mejor valoradas», de
       * ahí a la siguiente—, y las flechas de lado se mueven por las
       * carátulas de la fila en la que estás. Es lo que hace cualquier
       * aplicación de televisión y lo que la gente ya sabe usar sin que se
       * lo expliquen.
       */
      if (enPortada) {
        const ultima = filasALaVista.length; // la de «ver todas las carpetas»
        const primera = destacado ? -1 : 0;
        const anchoDe = (fi: number) => filasALaVista[fi]?.items.length ?? 1;

        if (tecla === "Arriba" || tecla === "Abajo") {
          e.preventDefault();
          const salto = tecla === "Abajo" ? 1 : -1;
          const nueva = Math.max(primera, Math.min(ultima, focoFila + salto));
          setFocoFila(nueva);
          // La columna se mantiene, pero sin salirse de la fila nueva
          if (nueva >= 0 && nueva < ultima) setFocoCol((c) => Math.min(c, anchoDe(nueva) - 1));
          return;
        }
        if (tecla === "Derecha") {
          e.preventDefault();
          if (focoFila >= 0 && focoFila < ultima) {
            setFocoCol((c) => Math.min(anchoDe(focoFila) - 1, c + 1));
          }
          return;
        }
        if (tecla === "Izquierda") {
          e.preventDefault();
          /* Pegado al borde de la fila, ◀ sale al carril: es lo mismo que en
             las listas y así no hay que aprenderse dos gestos */
          if (focoFila >= 0 && focoFila < ultima && focoCol > 0) setFocoCol((c) => c - 1);
          else setFocoCarril(Math.max(0, CARRIL.findIndex((d) => d.id === pantalla)));
          return;
        }
        if (tecla === "Ok") {
          e.preventDefault();
          if (focoFila === -1 && destacado) abrirTitulo(destacado);
          else if (focoFila === ultima) verCarpetas();
          else {
            const t = filasALaVista[focoFila]?.items[focoCol];
            if (t) abrirTitulo(t);
          }
          return;
        }
        return;
      }

      /*
       * ◀ pegado al borde izquierdo entra en el carril: es donde está, y es
       * lo que hace cualquier aplicación de televisión.
       *
       * Va ANTES de mirar si hay filas. Mientras una sección carga la lista
       * está vacía, y ahí el carril es lo único a lo que se puede llegar:
       * comprobándolo después, ◀ no hacía nada y el ATRÁS siguiente se
       * llevaba por delante la sección entera.
       */
      if (tecla === "Izquierda" && pantalla !== "portada" && (columnas <= 1 || foco % columnas === 0)) {
        e.preventDefault();
        setFocoCarril(Math.max(0, CARRIL.findIndex((d) => d.id === pantalla)));
        return;
      }

      const total = pantalla === "portada" ? 4 : filas.length;
      if (!total) return;
      /* «Seguir viendo» es el −1 de la portada: por encima de los cuatro
         accesos, que es donde lo busca quien enciende para seguir con lo suyo */
      const primero = pantalla === "portada" && ultimo ? -1 : 0;

      /* En una lista todo es una columna y da igual la flecha; en la rejilla
         de carátulas, arriba y abajo saltan una fila entera, que es lo que
         espera cualquiera que haya usado el mando de una tele */
      const cols = pantalla === "portada" ? 1 : columnas;
      const salto = cols > 1 ? cols * 3 : 8;
      const siguiente = (f: number) => (f + 1 > total - 1 ? primero : f + 1);
      const anterior = (f: number) => (f - 1 < primero ? total - 1 : f - 1);

      if (tecla === "Derecha") {
        e.preventDefault();
        setFoco(siguiente);
      } else if (tecla === "Izquierda") {
        /* En medio de una fila de carátulas sigue siendo «la anterior»: el
           borde izquierdo, que es el que lleva al carril, ya se ha atendido */
        e.preventDefault();
        setFoco(anterior);
      } else if (tecla === "Abajo") {
        e.preventDefault();
        setFoco((f) => (cols > 1 ? Math.min(total - 1, f + cols) : siguiente(f)));
      } else if (tecla === "Arriba") {
        e.preventDefault();
        setFoco((f) => (cols > 1 ? Math.max(0, f - cols) : anterior(f)));
      } else if (tecla === "PaginaAbajo") {
        e.preventDefault();
        setFoco((f) => Math.min(total - 1, f + salto));
      } else if (tecla === "PaginaArriba") {
        e.preventDefault();
        setFoco((f) => Math.max(primero, f - salto));
      } else if (tecla === "Ok") {
        e.preventDefault();
        if (pantalla === "portada") {
          if (foco === -1 && ultimo) reproducir(ultimo.source);
          else elegirDestino(DESTINOS[foco]?.id);
        } else filas[foco]?.abrir();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pantalla, filas, foco, ultimo, reproducir, columnas, focoCarril, enPortada, filasALaVista, destacado, focoFila, focoCol]);

  // La fila con el foco siempre a la vista, sin que el usuario persiga nada
  useEffect(() => {
    if (!conElMando.current) return;
    listaRef.current?.querySelector<HTMLElement>(`[data-i="${foco}"]`)?.scrollIntoView({ block: "center" });
  }, [foco, filas]);

  /* Lo mismo en la portada, que además se mueve de lado: la carátula
     enfocada tiene que quedar centrada en su fila, no medio salida */
  useEffect(() => {
    if (!enPortada || !conElMando.current) return;
    /* Con el foco en el banner se sube del todo: centrarlo dejaría hueco
       arriba y el banner cortado, que es peor que no hacer nada */
    if (focoFila === -1) {
      listaRef.current?.scrollTo({ top: 0 });
      return;
    }
    listaRef.current
      ?.querySelector<HTMLElement>('[data-foco="1"]')
      ?.scrollIntoView({ block: "center", inline: "center" });
  }, [enPortada, focoFila, focoCol, filasALaVista.length]);

  /* Sin banner —ningún título del catálogo trae carátula que cargue— la
     fila −1 no existe y el foco se quedaría en un sitio que no se ve */
  useEffect(() => {
    if (enPortada && !destacado && focoFila === -1) setFocoFila(0);
  }, [enPortada, destacado, focoFila]);

  /* ---------- Pantallas ---------- */

  if (sesion === "cargando") {
    /* Presentación con la marca mientras se comprueba la sesión: una tele
       tarda un par de segundos en tener red y «Un momento…» sobre negro se
       parece demasiado a una app que no arranca */
    return (
      <div className="tv-app tv-centro">
        <div className="tv-splash">
          <span className="tv-splash-marca">{marca}</span>
          <span className="tv-splash-barra" aria-hidden="true" />
          <p className="tv-cargando">Encendiendo…</p>
        </div>
      </div>
    );
  }

  /*
   * La pantalla de inicio es la misma en la tele, en el móvil y en el
   * Firestick, y contesta de un vistazo a las tres preguntas que hace
   * cualquiera al abrir la app: qué lista tengo y hasta cuándo, cuál es mi
   * MAC (lo primero que pide el proveedor), y por dónde entro si tengo
   * usuario. Solo se salta cuando ya está activada: entonces se va directo
   * a ver la tele, que es a lo que se venía.
   */
  const caducado = caduca > 0 && caduca < Date.now();

  if (sesion === "sin-sesion" || caducado) {
    if (haciendoLogin) {
      return (
        <div className="tv-app tv-centro">
          <form className="tv-activar tv-form" onSubmit={entrarConUsuario}>
            <h1>Entrar con mi usuario</h1>
            <p className="tv-activar-paso">El usuario y la contraseña que te dio tu proveedor.</p>
            <input name="usuario" className="tv-input" placeholder="Usuario" required autoFocus autoComplete="off" />
            <input name="password" className="tv-input" type="password" placeholder="Contraseña" required autoComplete="off" />
            {error && <p className="tv-activar-error">{error}</p>}
            <div className="tv-form-fila">
              <button type="submit" className="tv-boton" disabled={entrando}>
                {entrando ? "Entrando…" : "Entrar"}
              </button>
              <button type="button" className="tv-boton tv-boton-suave" onClick={() => setHaciendoLogin(false)}>
                Cancelar
              </button>
            </div>
          </form>
        </div>
      );
    }
    if (poniendoLista) {
      return (
        <div className="tv-app tv-centro">
          <form className="tv-activar tv-form" onSubmit={guardarListaManual}>
            <h1>Poner mi lista</h1>
            <p className="tv-activar-paso">Pega tu URL M3U, o tu servidor Xtream con usuario y contraseña.</p>
            <input name="url" className="tv-input" placeholder="http://servidor.com:8080  o  http://…/get.php?…" required autoFocus />
            <div className="tv-form-fila">
              <input name="usuario" className="tv-input" placeholder="Usuario (solo Xtream)" autoComplete="off" />
              <input name="password" className="tv-input" placeholder="Contraseña (solo Xtream)" autoComplete="off" />
            </div>
            {error && <p className="tv-activar-error">{error}</p>}
            <div className="tv-form-fila">
              <button type="submit" className="tv-boton">Guardar y ver</button>
              <button type="button" className="tv-boton tv-boton-suave" onClick={() => setPoniendoLista(false)}>
                Cancelar
              </button>
            </div>
          </form>
        </div>
      );
    }
    return (
      <div className="tv-app tv-centro">
        <div className="tv-activar">
          <p className="tv-marca">{marca}</p>

          {/* Lo primero y en grande: qué tengo y hasta cuándo */}
          <div className={`tv-estado ${caducado ? "caducado" : ""}`}>
            {caducado ? (
              <>
                <h1>Tu lista ha caducado</h1>
                <p className="tv-estado-linea">
                  Venció el {new Date(caduca).toLocaleDateString("es-ES")}
                  {soporte ? ` · Renueva con ${soporte}` : ""}
                </p>
              </>
            ) : (
              <>
                <h1>Activa esta tele</h1>
                <p className="tv-estado-linea">Aún no tiene ninguna lista. Elige la forma que te sea más fácil.</p>
              </>
            )}
          </div>

          {/* Dos tarjetas iguales, no dos columnas sueltas: la misma caja, el
              mismo tamaño de letra y el dato abajo del todo en las dos, para
              que se vean como dos opciones y no como una principal y un resto */}
          <div className="tv-dos-caminos">
            <div className="tv-camino">
              <p className="tv-camino-t">1 · Con tu proveedor</p>
              <p className="tv-camino-txt">Pásale esta MAC y te activa la tele:</p>
              <p className="tv-camino-txt tv-camino-nota">Es el número con el que tu proveedor reconoce este aparato.</p>
              <div className="tv-dato">{macDelAparato()}</div>
            </div>
            <div className="tv-camino">
              <p className="tv-camino-t">2 · Tú mismo, desde el móvil</p>
              <p className="tv-camino-txt">Entra desde el móvil en:</p>
              <div className="tv-sitio">{sitio()}/activar</div>
              <p className="tv-camino-txt">y escribe este código:</p>
              <div className="tv-dato tv-dato-codigo">{codigo || "······"}</div>
            </div>
          </div>

          {avisoCodigo ? (
            <p className="tv-activar-error">{avisoCodigo}</p>
          ) : (
            <p className="tv-activar-nota">La tele entrará sola por cualquiera de las dos vías.</p>
          )}

          {/* Y siempre a la vista, sin esconderse: entrar con usuario */}
          <div className="tv-form-fila tv-acciones">
            <button className="tv-boton" onClick={() => { setError(""); setHaciendoLogin(true); }}>
              Entrar con usuario y contraseña
            </button>
            <button className="tv-boton tv-boton-suave" onClick={() => setPoniendoLista(true)}>
              Tengo mi propia lista M3U
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (pantalla === "viendo" && viendo) {
    /* Lo que se está viendo, encima y sin estorbar: en una tele no hay barra
       de título ni pestaña que lo diga, y a los dos minutos ya no te acuerdas
       de en qué canal entraste */
    const guiaDeEsto = viendo.epgId ? epgAhora[viendo.epgId] : undefined;
    return (
      <div className="tv-app tv-viendo">
        <VideoPlayer source={viendo.source} controles={false} />
        <div className={`tv-viendo-canal ${osd ? "" : "ido"}`}>
          <span className="tv-punto" aria-hidden="true" />
          <span className="tv-viendo-nombre">{viendo.source.name}</span>
          {guiaDeEsto?.ahora && <span className="tv-viendo-prog">{guiaDeEsto.ahora}</span>}
        </div>
        <p className={`tv-viendo-pie ${osd ? "" : "ido"}`}>Pulsa ATRÁS para volver</p>
      </div>
    );
  }

  if (pantalla === "portada") {
    return (
      <div className="tv-app tv-centro">
        <div className="tv-portada">
          <p className="tv-marca">{marca}</p>
          {sinRed && (
            <p className="tv-sinred" role="status">
              Sin conexión: estás viendo lo de la última vez. Se reintenta solo.
            </p>
          )}
          {ultimo && (
            <button
              className={`tv-seguir ${foco === -1 ? "foco" : ""}`}
              onMouseEnter={() => { conElMando.current = false; setFoco(-1); }}
              onClick={() => reproducir(ultimo.source)}
            >
              <Icon name="play" size={28} />
              <span>
                Seguir viendo
                <b>{ultimo.nombre}</b>
              </span>
            </button>
          )}
          <div className="tv-tiles">
            {DESTINOS.map((d, i) => (
              <button
                key={d.id}
                className={`tv-tile ${foco === i ? "foco" : ""}`}
                onMouseEnter={() => { conElMando.current = false; setFoco(i); }}
                onClick={() => elegirDestino(d.id)}
              >
                <span className="tv-tile-icono"><Icon name={d.icono} size={44} /></span>
                <span className="tv-tile-txt">
                  {d.titulo}
                  {/* Una línea que diga de qué va: cuatro nombres a secas
                      obligan a entrar para saber qué hay detrás */}
                  <span className="tv-tile-sub">{d.pie}</span>
                </span>
              </button>
            ))}
          </div>
          <p className="tv-pie">
            {caduca ? `Tu acceso vence el ${new Date(caduca).toLocaleDateString("es-ES")}` : "Acceso sin fecha de fin"}
            {soporte ? ` · Soporte: ${soporte}` : ""}
          </p>
          {/* La MAC siempre a la vista, como en los reproductores de siempre:
              es lo primero que le pide el proveedor cuando algo falla.
              Y al lado la versión: sin ella, «no veo los cambios» no se
              puede contestar sin adivinar si es que no se ha desplegado, si
              es la caché del aparato o si es otra cosa */}
          <p className="tv-pie tv-pie-mac">
            MAC: {macDelAparato()} · versión {process.env.NEXT_PUBLIC_BUILD || "?"}
          </p>
        </div>
      </div>
    );
  }

  /*
   * La portada de cine y de series.
   *
   * El banner se monta con la carátula del destacado tres veces, y es a
   * propósito: un panel Xtream solo manda imágenes verticales, así que
   * estirar una a lo ancho de la pantalla da una mancha gigante y borrosa.
   * Va de fondo muy ampliada y desenfocada —ahí lo borroso es el efecto—,
   * entera y en su proporción a la derecha, y con dos velos encima para
   * poder leer el texto y fundirla con el fondo.
   */
  if (enPortada) {
    const ultima = filasALaVista.length;
    return (
      <div className="tv-app tv-con-carril">
        <nav className="tv-carril" aria-label="Secciones">
          {CARRIL.map((d, i) => (
            <button
              key={d.id}
              className={`tv-carril-item ${focoCarril === i ? "foco" : ""} ${pantalla === d.id ? "activo" : ""}`}
              onMouseEnter={() => { conElMando.current = false; setFocoCarril(i); }}
              onMouseLeave={() => setFocoCarril(null)}
              onClick={() => { setFocoCarril(null); elegirDestino(d.id); }}
            >
              <span className="tv-carril-icono"><Icon name={d.icono} size={34} /></span>
              <span className="tv-carril-txt">{d.titulo}</span>
            </button>
          ))}
        </nav>

        <div className="tv-cuerpo tv-cuerpo-portada" ref={listaRef}>
          {cargando && <p className="tv-cargando">Cargando…</p>}
          {error && <p className="tv-activar-error">{error}</p>}

          {destacado && (
            <section className="tv-banner" data-fila="-1" data-foco={focoFila === -1 ? "1" : undefined}>
              {destacado.fondo && !rotas[destacado.fondo] ? (
                /* Con fondo apaisado de verdad, el banner es lo que se
                   espera: la imagen de lado a lado y el texto encima. Lo de
                   las tres capas era el apaño para cuando lo único que hay
                   es una carátula vertical */
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  className="tv-banner-fondo"
                  src={destacado.fondo}
                  alt=""
                  onError={() => marcarRota(destacado.fondo || "")}
                />
              ) : (
                imgSrc(destacado.imagen) && (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="tv-banner-mancha" src={imgSrc(destacado.imagen)} alt="" aria-hidden="true" />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      className="tv-banner-arte"
                      src={imgSrc(destacado.imagen)}
                      alt=""
                      onError={() => marcarRota(destacado.imagen)}
                    />
                  </>
                )
              )}
              <span className="tv-banner-velo" aria-hidden="true" />
              <div className="tv-banner-txt">
                <h2 className="tv-banner-t">{destacado.nombre}</h2>
                {datosDe(destacado) && <p className="tv-banner-datos">{datosDe(destacado)}</p>}
                {destacado.sinopsis && <p className="tv-banner-sinopsis">{destacado.sinopsis}</p>}
                <button
                  className={`tv-banner-ver ${focoFila === -1 ? "foco" : ""}`}
                  onMouseEnter={() => { conElMando.current = false; setFocoFila(-1); }}
                  onClick={() => abrirTitulo(destacado)}
                >
                  <Icon name="play" size={24} />
                  {destacado.esSerie ? "Ver la serie" : "Reproducir"}
                </button>
              </div>
            </section>
          )}

          {filasALaVista.map((f, fi) => (
            <section className="tv-carrusel" key={`${f.titulo}-${fi}`}>
              <h3 className="tv-carrusel-t">{f.titulo}</h3>
              <div className={`tv-carrusel-tira ${f.numerada ? "numerada" : ""}`}>
                {f.items.map((t, ci) => {
                  const puesto = focoFila === fi && focoCol === ci;
                  return (
                    <button
                      key={t.id}
                      className={`tv-poster ${puesto ? "foco" : ""}`}
                      data-fila={fi}
                      data-col={ci}
                      data-foco={puesto ? "1" : undefined}
                      onMouseEnter={() => { conElMando.current = false; setFocoFila(fi); setFocoCol(ci); }}
                      onClick={() => abrirTitulo(t)}
                    >
                      <span className="tv-poster-marco">
                        {/* El título detrás del hueco: una carátula que no
                            llega deja un cuadro gris igual a todos los demás,
                            y el nombre de debajo no se lee a tres metros */}
                        <span className="tv-poster-ph">{t.nombre}</span>
                        {imgSrc(t.imagen) && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={imgSrc(t.imagen)}
                            alt=""
                            loading="lazy"
                            onError={() => marcarRota(t.imagen)}
                          />
                        )}
                        {f.numerada && <span className="tv-poster-num">{ci + 1}</span>}
                      </span>
                      <span className="tv-poster-nombre">{t.nombre}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}

          {!cargando && !filasALaVista.length && !error && (
            <p className="tv-cargando">Tu proveedor no ha enviado nada en esta sección.</p>
          )}

          <button
            className={`tv-vertodas ${focoFila === ultima ? "foco" : ""}`}
            data-foco={focoFila === ultima ? "1" : undefined}
            onMouseEnter={() => { conElMando.current = false; setFocoFila(ultima); }}
            onClick={verCarpetas}
          >
            Ver todas las carpetas  ›
          </button>

          {/* Condición de TMDB para usar su API, y no es negociable. Solo
              sale cuando de verdad se está usando: una instalación sin clave
              no enseña nada de esto */}
          {Object.keys(meta).length > 0 && (
            <p className="tv-tmdb">
              Fichas e imágenes de TMDB. Este producto usa la API de TMDB pero no está
              avalado ni certificado por TMDB.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="tv-app tv-con-carril">
      {/* El carril: cambiar de sección sin volver a la portada. Con el mando
          se entra con ◀ desde la primera columna y se sale con ▶ */}
      <nav className="tv-carril" aria-label="Secciones">
        {CARRIL.map((d, i) => (
          <button
            key={d.id}
            className={`tv-carril-item ${focoCarril === i ? "foco" : ""} ${pantalla === d.id ? "activo" : ""}`}
            onMouseEnter={() => { conElMando.current = false; setFocoCarril(i); }}
            onMouseLeave={() => setFocoCarril(null)}
            onClick={() => { setFocoCarril(null); elegirDestino(d.id); }}
          >
            <span className="tv-carril-icono"><Icon name={d.icono} size={34} /></span>
            <span className="tv-carril-txt">{d.titulo}</span>
          </button>
        ))}
      </nav>
      <div className="tv-cuerpo">
      <header className="tv-cabecera">
        <h2>{serieAbierta || carpetaAbierta || TITULOS[pantalla]}</h2>
        {(serieAbierta || carpetaAbierta) && <span className="tv-cabecera-de">{TITULOS[pantalla]}</span>}
        <span className="tv-cabecera-pista">◀ para las secciones · ATRÁS para volver</span>
      </header>

      {/*
        La cabecera viva del directo: el canal que tienes debajo del foco,
        en grande y con lo que están echando.

        Una lista de nombres de canal no dice nada —«AXN HD» no es una razón
        para quedarse— y con un mando asomarse a un canal y volver cuesta
        cuatro pulsaciones. Aquí se ve sin entrar: el logotipo grande, qué
        dan ahora, cuánto le queda y qué viene después.
      */}
      {enDirecto && canalMirado && (
        <section className="tv-ahora">
          <span className="tv-ahora-logo">
            {imgSrc(canalMirado.logo) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imgSrc(canalMirado.logo)}
                alt=""
                onError={(e) => ((e.target as HTMLImageElement).style.visibility = "hidden")}
              />
            ) : (
              <Icon name="tv" size={40} />
            )}
          </span>
          <div className="tv-ahora-txt">
            <p className="tv-ahora-canal">
              {canalMirado.numero ? <span className="tv-ahora-num">{canalMirado.numero}</span> : null}
              {canalMirado.nombre}
            </p>
            {guiaMirada?.ahora ? (
              <>
                <p className="tv-ahora-prog">
                  <span className="tv-punto" aria-hidden="true" />
                  {guiaMirada.ahora}
                  {queda ? <span className="tv-ahora-queda">{queda}</span> : null}
                </p>
                {avance !== null && (
                  <span className="tv-ahora-barra" aria-hidden="true">
                    <span style={{ width: `${avance}%` }} />
                  </span>
                )}
                {guiaMirada.luego && <p className="tv-ahora-luego">Después · {guiaMirada.luego}</p>}
              </>
            ) : (
              <p className="tv-ahora-prog tv-ahora-singuia">Tu proveedor no manda la guía de este canal</p>
            )}
          </div>
        </section>
      )}
      {cargando && <p className="tv-cargando">Cargando…</p>}
      {error && <p className="tv-activar-error">{error}</p>}
      <div className={`tv-lista ${rejilla ? "tv-rejilla" : ""}`} ref={listaRef}>
        {filas.map((f, i) =>
          /* Una película se elige por la carátula, no leyendo su nombre en
             una lista: se pinta grande y con el título debajo */
          rejilla ? (
            <button
              key={f.id}
              data-i={i}
              className={`tv-poster ${foco === i ? "foco" : ""}`}
              onMouseEnter={() => { conElMando.current = false; setFoco(i); }}
              onClick={f.abrir}
            >
              <span className="tv-poster-marco">
                {imgSrc(f.logo) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={imgSrc(f.logo)}
                    alt=""
                    loading="lazy"
                    onError={(e) => ((e.target as HTMLImageElement).style.visibility = "hidden")}
                  />
                ) : (
                  <span className="tv-poster-ph">{f.nombre.trim().slice(0, 1).toUpperCase()}</span>
                )}
              </span>
              <span className="tv-poster-nombre">{f.nombre}</span>
            </button>
          ) : (
            <button
              key={f.id}
              data-i={i}
              className={`tv-fila ${foco === i ? "foco" : ""} ${f.carpeta ? "tv-carpeta" : ""}`}
              onMouseEnter={() => { conElMando.current = false; setFoco(i); }}
              onClick={f.abrir}
            >
              <span className="tv-fila-n">{String(i + 1).padStart(3, "0")}</span>
              {f.carpeta ? (
                <span className="tv-fila-ph"><Icon name={f.icono || "globe"} size={20} /></span>
              ) : imgSrc(f.logo) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imgSrc(f.logo)} alt="" loading="lazy" onError={(e) => ((e.target as HTMLImageElement).style.visibility = "hidden")} />
              ) : (
                <span className="tv-fila-ph">{f.nombre.trim().slice(0, 1).toUpperCase()}</span>
              )}
              <span className="tv-fila-txt">
                <span className="tv-fila-nombre">{f.nombre}</span>
                {/* Qué echan ahora: con un mando, asomarse a un canal y
                    volver cuesta cuatro pulsaciones, así que sin esto se
                    elige a ciegas por el nombre */}
                {f.epgId && epgAhora[f.epgId]?.ahora && (
                  <span className="tv-fila-ahora">
                    <span className="tv-punto" aria-hidden="true" />
                    {epgAhora[f.epgId].ahora}
                  </span>
                )}
              </span>
            </button>
          ),
        )}
        {!cargando && !filas.length && !error && <p className="tv-cargando">Aquí no hay nada todavía.</p>}
      </div>
      </div>
    </div>
  );
}

const TITULOS: Record<string, string> = {
  directo: "TV en directo",
  cine: "Películas",
  series: "Series",
};

const DESTINOS: { id: Pantalla; titulo: string; icono: IconName; pie: string }[] = [
  { id: "directo", titulo: "TV en directo", icono: "tv", pie: "Canales y qué echan ahora" },
  { id: "cine", titulo: "Películas", icono: "film", pie: "Estrenos y lo mejor valorado" },
  { id: "series", titulo: "Series", icono: "series", pie: "Temporadas y episodios" },
  { id: "salir", titulo: "Salir", icono: "power", pie: "Desactivar esta tele" },
];

/*
 * Los mismos destinos, de canto y con «Inicio» delante, para el carril de
 * las listas. Los nombres van cortos: en una columna de 9vw, «TV en
 * directo» se parte en tres líneas y deja de leerse a tres metros.
 */
const CARRIL: { id: Pantalla; titulo: string; icono: IconName }[] = [
  { id: "portada", titulo: "Inicio", icono: "casa" },
  { id: "directo", titulo: "Directo", icono: "tv" },
  { id: "cine", titulo: "Cine", icono: "film" },
  { id: "series", titulo: "Series", icono: "series" },
  { id: "salir", titulo: "Salir", icono: "power" },
];

function sitio(): string {
  if (typeof window === "undefined") return "";
  return window.location.host;
}
