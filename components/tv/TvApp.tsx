"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Icon, { IconName } from "@/components/Icon";
import {
  type Descarga,
  comoVa,
  encargarDescarga,
  falloDelEnvoltorio,
  envoltorioSinPuente,
  leerDescargas,
  quitarDescarga,
  sePuedeDescargar,
  tamanoLegible,
} from "@/components/tv/descargas";
import VideoPlayer, { PlaySource } from "@/components/player/VideoPlayer";
import { parseM3U } from "@/lib/m3u";
import { imgSrc } from "@/lib/img";
import { indiceEnAntena, momento } from "@/lib/epg";
import { duracionDe, minutosDe, tituloDeEpisodio } from "@/lib/episodios";
import { iconoDeCategoria } from "@/lib/categorias";
import { enCristiano } from "@/lib/errores";
import {
  type Actor,
  FilaPortada,
  MetaTitulo,
  Titulo,
  anioDe,
  armarPortada,
  candidatosDestacado,
  conMeta,
  datosDe,
  llaveTmdb,
  sinRepetir,
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
  XtreamVodInfo,
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

type Pantalla =
  | "perfiles"
  | "portada"
  | "directo"
  | "cine"
  | "series"
  | "descargas"
  | "ficha"
  | "viendo"
  | "salir";

/** Una persona de la casa. Lo mismo que en el reproductor web. */
interface Perfil {
  id: number;
  name: string;
  avatar: string;
  kids: boolean;
}

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
  /**
   * Lo que hay dentro de una carpeta, sin abrirla.
   *
   * Sirve para enseñar de qué va una carpeta antes de entrar: recorriendo la
   * lista de carpetas del directo, la mitad derecha va enseñando qué echan en
   * el primer canal de cada una. Sin esto habría que entrar para saberlo, que
   * es justo lo que se quería evitar.
   */
  hijos?: Fila[];
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
/**
 * Cuántas veces se ha puesto cada canal en este aparato.
 *
 * Es la única cuenta de «lo más visto» que se puede dar sin mentir: nadie
 * nos dice qué está viendo el resto del mundo. Se queda en el televisor, no
 * viaja a ningún sitio, y es lo que llena la primera fila de la portada del
 * directo.
 */
const K_VISTOS = "xp.tvVistos.v1";

interface SesionGuardada {
  marca: string;
  /*
   * El logotipo del proveedor, si lo tiene.
   *
   * Aquí no vale poner el nuestro por defecto: esto es marca blanca, y el
   * cliente de un proveedor no ha oído hablar de TOTALplayer. Su logotipo
   * encima del nombre de otro sería colarse en una casa ajena. Solo cuando
   * la marca es la nuestra se usa nuestro icono.
   */
  logo: string;
  /** El mosaico que el proveedor haya puesto de fondo. Vacío: se dibuja uno */
  fondo: string;
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
  /** De qué va. Vacío en la mayoría de paneles, que solo mandan el título. */
  resumen: string;
}

/**
 * Un programa de la parrilla larga.
 *
 * `Guia` contesta a «qué dan ahora» y vale para la línea de debajo de cada
 * canal. Esto contesta a la otra pregunta que se hace con el mando en la
 * mano —«¿y luego?»—, que necesita la tarde entera y no dos títulos.
 */
interface Programa {
  titulo: string;
  desde: number;
  hasta: number;
}

/** «21:30». Vacío si el panel no manda horas, que también pasa. */
function horaCorta(ms: number): string {
  if (!ms) return "";
  return new Date(ms).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

/** El panel manda la hora de dos maneras y a veces de ninguna. */
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
  const [logo, setLogo] = useState("");
  const [fondoMarca, setFondoMarca] = useState("");
  const [caduca, setCaduca] = useState(0);
  const [soporte, setSoporte] = useState("");
  const [lista, setLista] = useState<Lista | null>(null);

  const [pantalla, setPantalla] = useState<Pantalla>("portada");
  /**
   * Quién está viendo.
   *
   * En el reproductor web esto existía desde el principio y en la televisión
   * no, y es donde más falta hace: la tele del salón la usan cuatro personas
   * y lo que has dejado a medias no es lo mismo para todas. Se pregunta al
   * encender, y solo si hay más de uno —a quien vive solo no se le mete un
   * paso de más—, y se puede cambiar desde la barra de arriba en cualquier
   * momento.
   */
  const [perfiles, setPerfiles] = useState<Perfil[]>([]);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [perfilesPedidos, setPerfilesPedidos] = useState(false);
  /** Si el plan del cliente deja crear más perfiles de los que ya tiene */
  const [cabenMas, setCabenMas] = useState(false);
  const [filas, setFilas] = useState<Fila[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [foco, setFoco] = useState(0);
  const [viendo, setViendo] = useState<{ source: PlaySource; epgId?: string } | null>(null);
  /** Serie abierta: sus episodios sustituyen a la lista mientras dure */
  const [serieAbierta, setSerieAbierta] = useState<string>("");
  /*
   * La ficha de un título: de qué va antes de ponerlo.
   *
   * Una serie se abría en una lista plana con todas las temporadas seguidas
   * —«T1 · E1», «T1 · E2»… hasta la séptima—, y una película se ponía a
   * reproducir directamente al pulsarla. En las dos faltaba lo mismo: la
   * pregunta que se hace cualquiera delante de un título que no conoce, que
   * es de qué va y si le apetece. El reproductor web sí lo enseñaba; la
   * tele, que es donde se elige a tres metros y sin teclado, no.
   */
  const [ficha, setFicha] = useState<Ficha | null>(null);
  /* Se lee al arrancar y se mantiene aquí: preguntarle al almacenamiento en
     cada pintada es leer y parsear en mitad del render */
  const [miLista, setMiLista] = useState<string[]>([]);
  /* Dónde está el foco dentro de la ficha. Son tres zonas y no una lista:
     el botón de arriba, la fila de temporadas y la de episodios */
  const [fichaZona, setFichaZona] = useState<
    "boton" | "guardar" | "bajar" | "temporadas" | "episodios"
  >("boton");
  const [fichaTemp, setFichaTemp] = useState(0);

  /* Mi lista vive en el aparato: se lee una vez al arrancar y se mantiene
     aquí. Preguntarle al almacenamiento en cada pintada sería leer y parsear
     en mitad del render */
  useEffect(() => {
    setMiLista(leerMiLista());
  }, []);
  const [fichaEp, setFichaEp] = useState(0);
  /** Carpeta abierta dentro de una sección (null = viendo las carpetas) */
  const [carpetaAbierta, setCarpetaAbierta] = useState<string>("");
  /**
   * Todos los canales del panel, en plano y sin agrupar.
   *
   * La pantalla del directo enseña dos cosas a la vez —la lista de la
   * izquierda y las filas de la derecha— y las dos salen de aquí. Sin esto,
   * al entrar en una categoría `filas` pasaba a ser solo la de esa categoría
   * y las filas de abajo se quedaban con lo que hubiera dentro, que es
   * justo lo contrario de lo que hacen: enseñar lo que hay fuera.
   */
  const [canales, setCanales] = useState<Fila[]>([]);
  /**
   * Las carpetas del directo, guardadas aparte.
   *
   * `filas` se las lleva por delante en cuanto se abre una —pasa a contener
   * sus canales—, y la fila de carpetas de la derecha tiene que seguir ahí
   * para poder saltar de una a otra sin volver al índice.
   */
  const [carpetasDirecto, setCarpetasDirecto] = useState<Fila[]>([]);
  /**
   * En qué mitad de la pantalla del directo está el foco.
   *
   * Va aparte del número de foco por lo mismo que la barra de secciones: son
   * dos sitios distintos y cada uno recuerda por dónde iba. Con un solo
   * número, ir a la derecha y volver perdía el canal en el que estabas.
   */
  const [zonaDir, setZonaDir] = useState<"canales" | "derecha">("canales");
  const [poniendoLista, setPoniendoLista] = useState(false);
  const [haciendoLogin, setHaciendoLogin] = useState(false);
  const [entrando, setEntrando] = useState(false);
  /** Arrancamos con lo de la última vez porque no hubo forma de preguntar */
  const [sinRed, setSinRed] = useState(false);
  /** Lo último que se estaba viendo, para volver con un solo OK */
  const [ultimo, setUltimo] = useState<UltimoCanal | null>(null);
  /** Cuántas veces se ha puesto cada canal aquí. Ver `K_VISTOS`. */
  const [vistos, setVistos] = useState<Record<string, number>>({});
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

  /*
   * Descargas: solo donde el envoltorio sabe hacerlas.
   *
   * Se pregunta en un efecto y no al pintar porque la respuesta la da
   * `window`, que en el servidor no existe: mirándolo durante el render, el
   * HTML que manda el servidor y el que dibuja el navegador no coincidirían y
   * React tira la página abajo y la vuelve a pintar. Un fotograma con tres
   * accesos en vez de cuatro es más barato que eso.
   */
  const [conDescargas, setConDescargas] = useState(false);
  /** Programa nativo, pero de antes de que existieran las descargas */
  const [programaViejo, setProgramaViejo] = useState(false);
  /** El identificador de lo que se está resolviendo, mientras se resuelve */
  const [preparando, setPreparando] = useState("");
  /** En la pantalla de descargas: 0 es verla, 1 es quitarla del aparato */
  const [descargaCol, setDescargaCol] = useState(0);
  const [descargas, setDescargas] = useState<Descarga[]>([]);
  useEffect(() => {
    setConDescargas(sePuedeDescargar());
    setProgramaViejo(envoltorioSinPuente());
    setDescargas(leerDescargas());
  }, []);
  /*
   * Y mientras baje algo, se vuelve a preguntar.
   *
   * El envoltorio no avisa: son cuatro envoltorios distintos y cada uno
   * tendría que saber cómo llamar a la web. Preguntar cada segundo y medio
   * cuesta menos que eso, y en cuanto no hay nada bajando y no se está
   * mirando la pantalla de descargas, se deja de preguntar.
   */
  const bajandoAlgo = descargas.some((d) => d.estado === "bajando");
  const enDescargas = pantalla === "descargas";
  useEffect(() => {
    if (!conDescargas) return;
    if (!bajandoAlgo && !enDescargas) return;
    const t = setInterval(() => setDescargas(leerDescargas()), 1500);
    return () => clearInterval(t);
  }, [conDescargas, bajandoAlgo, enDescargas]);

  /**
   * Y justo después de encargar algo, se pregunta un rato pase lo que pase.
   *
   * Aquí había un punto muerto y era el que hacía que pulsar «Descargar» no
   * hiciera nada visible. El reloj de arriba solo corre si YA hay algo
   * bajando; saber si lo hay se pregunta con `lista()`; y `lista()` tiene que
   * ser síncrona —el puente de Android no sabe devolver una promesa—, así que
   * lo que devuelve es la respuesta anterior y pide la siguiente. Nada más
   * encargar, esa respuesta anterior todavía está vacía: el reloj no
   * arrancaba, la lista no se volvía a pedir nunca y el botón se quedaba
   * como si no hubieras pulsado.
   *
   * Con esto se pregunta cada segundo durante quince, que es de sobra para
   * que el envoltorio conteste; para entonces ya hay algo «bajando» y el
   * reloj de arriba toma el relevo.
   */
  const [reciénEncargado, setReciénEncargado] = useState(0);
  useEffect(() => {
    if (!reciénEncargado) return;
    const t = setInterval(() => {
      setDescargas(leerDescargas());
      /* Y de paso se le pregunta qué se le ha roto: si el encargo no llegó a
         empezar no habrá fila ninguna que mirar, y sin esto la pantalla se
         quedaba como si no hubieras pulsado */
      const roto = falloDelEnvoltorio();
      if (roto) {
        setError(roto);
        setReciénEncargado(0);
      }
    }, 1000);
    const fin = setTimeout(() => setReciénEncargado(0), 15000);
    return () => { clearInterval(t); clearTimeout(fin); };
  }, [reciénEncargado]);
  /* Al entrar en la pantalla, lo último que haya: si no, se ve la foto de
     hace un rato hasta que salte el primer aviso del reloj */
  useEffect(() => {
    if (enDescargas) setDescargas(leerDescargas());
  }, [enDescargas]);

  /* Los accesos que se enseñan. Donde no se puede guardar nada, «Descargas»
     no aparece: ni en la portada, ni en el menú lateral */
  const destinos = useMemo(
    () => DESTINOS.filter((d) => d.id !== "descargas" || conDescargas),
    [conDescargas]
  );
  const carril = useMemo(
    () => CARRIL.filter((d) => d.id !== "descargas" || conDescargas),
    [conDescargas]
  );

  /*
   * Y en cuanto el ratón se va, el resaltado se va con él.
   *
   * El foco es uno solo y lo comparten el mando y el puntero, así que al
   * apartar el ratón de una fila la última carátula por la que había pasado
   * se quedaba encendida para siempre, como si estuviera seleccionada. En
   * una tele no pasa —no hay puntero— pero en el navegador y en el
   * ejecutable se ve todo el rato.
   *
   * No se borra el foco, que es lo que el mando necesita para saber dónde
   * seguir: se deja de pintar. Cualquier tecla o cualquier nuevo `enter` del
   * ratón lo vuelve a encender donde estaba.
   */
  const [ratonFuera, setRatonFuera] = useState(false);
  /**
   * Si la barra de secciones enseña los nombres o solo los iconos.
   *
   * Con el mando basta `focoCarril`: estar dentro de la barra ya es motivo
   * para abrirla. Con el ratón hace falta esto aparte, porque el puntero
   * puede estar sobre la barra sin estar sobre ningún icono —entre dos, o
   * sobre la marca— y ahí también tiene que estar abierta.
   */
  const [navAbierta, setNavAbierta] = useState(false);
  /**
   * Mientras la barra se está desplegando, el ratón no manda.
   *
   * Al abrirse, los nombres empujan y los iconos —que van centrados— se
   * corren de sitio. Con el puntero quieto, eso solo significa una cosa: el
   * icono que tenía debajo se va y llega otro, así que el resaltado saltaba
   * a un sitio en el que nadie ha puesto el ratón, y de rebote podía volver
   * a moverse. Visto desde fuera, la barra daba un respingo al rozarla.
   *
   * Se ignoran los avisos del ratón durante lo que dura la animación. Lo que
   * mueves tú sigue mandando; lo que se mueve solo, no.
   */
  const recolocando = useRef(false);
  const finRecolocar = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abrirNav = () => {
    if (navAbierta) return;
    recolocando.current = true;
    if (finRecolocar.current) clearTimeout(finRecolocar.current);
    finRecolocar.current = setTimeout(() => { recolocando.current = false; }, 120);
    setNavAbierta(true);
  };
  /** Pinta el aro solo si además el puntero sigue dentro. */
  const foc = (activo: boolean) => (activo && !ratonFuera ? "foco" : "");
  const conElRaton = () => {
    conElMando.current = false;
    setRatonFuera(false);
  };
  const ratonSeVa = () => setRatonFuera(true);

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
  /*
   * La portada de inicio: lo que hay en las tres secciones, a la vez.
   *
   * Antes esta pantalla era un lanzador —tres tarjetas con el nombre de cada
   * sección— y no enseñaba ni un título. Encender la tele y que lo primero
   * que veas sea un menú es hacerte elegir antes de haber visto nada. Ahora
   * es una portada: qué hay en directo, qué series y qué películas, y los
   * tres accesos arriba para ir a la sección entera.
   */
  const [filasInicio, setFilasInicio] = useState<FilaPortada[]>([]);
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

  /*
   * Las filas del inicio, ya limpias.
   *
   * Mismo criterio que en la portada de cine: en un escaparate, el título
   * cuya carátula no llega a cargar se cae de la fila. El proveedor dice que
   * tiene imagen y luego su servidor devuelve un 404, y lo que quedaba en
   * pantalla era el icono de imagen rota del navegador repetido cuatro veces
   * seguidas — que se lee como que la aplicación está estropeada.
   *
   * Los canales no: ahí no hay escaparate que elegir, está lo que se emite.
   * Un canal sin logotipo se conoce por su número y su nombre.
   */
  const filasInicioALaVista: FilaPortada[] = filasInicio
    .map((f) => {
      const items = f.items.map(mejor);
      return f.escaparate
        ? { ...f, items: items.filter((t) => !rotas[t.imagen]).slice(0, 12) }
        : { ...f, items };
    })
    .filter((f) => f.items.length >= (f.escaparate ? 4 : 1));

  /*
   * Y «Mi lista», la primera de todas cuando hay algo dentro.
   *
   * Va montada aquí y no en `armarPortada` porque lo guardado son
   * identificadores: los títulos con su carátula y su forma de abrirse están
   * en el catálogo que ya se ha cargado, y cruzarlos es esto. Guardar el
   * título entero habría dejado dos versiones de lo mismo, y la copia se
   * queda vieja en cuanto el proveedor le cambia la imagen.
   *
   * Primera porque es lo único de la portada que has elegido tú: el resto
   * son filas que decide el catálogo. Y sin filtrar por carátula —al revés
   * que los escaparates—: lo has guardado tú, así que sale aunque el
   * proveedor no le haya puesto imagen.
   */
  const guardados = (() => {
    if (!miLista.length || !filasPortada.length) return null;
    const porId = new Map<string, Titulo>();
    for (const f of filasPortada) for (const t of f.items) if (!porId.has(t.id)) porId.set(t.id, t);
    const items = miLista.map((id) => porId.get(id)).filter((t): t is Titulo => Boolean(t)).map(mejor);
    return items.length ? { titulo: "Mi lista", items } : null;
  })();
  const filasConLista: FilaPortada[] = guardados ? [guardados, ...filasALaVista] : filasALaVista;

  useEffect(() => {
    setUltimo(leer<UltimoCanal>(K_ULTIMO));
    setVistos(leer<Record<string, number>>(K_VISTOS) || {});
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
        setLogo(guardada.logo || "");
        setFondoMarca(guardada.fondo || "");
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
      branding?: { support?: string; logo?: string; fondo?: string };
      playlist: { type: "xtream" | "m3u"; url: string; username?: string; password?: string };
    };
    const nueva: SesionGuardada = {
      marca: respuesta.brand || "TOTALplayer",
      logo: respuesta.branding?.logo || "",
      fondo: respuesta.branding?.fondo || "",
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
    setLogo(nueva.logo);
    setFondoMarca(nueva.fondo);
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

  /** Qué puesta en marcha es la buena. Ver `verEsto`. */
  const zapeo = useRef(0);

  const reproducir = useCallback((source: PlaySource, epgId?: string) => {
    setViendo({ source, epgId });
    setPantalla("viendo");
    /* En una tele se vuelve casi siempre a lo mismo. Guardarlo cuesta una
       línea y ahorra recorrer otra vez carpeta, categoría y canal */
    const ultimoCanal: UltimoCanal = { nombre: source.name, source };
    setUltimo(ultimoCanal);
    guardar(K_ULTIMO, ultimoCanal);
    /*
     * Y una raya en la pared por cada canal que se pone.
     *
     * Solo el directo —de ahí que se cuente por `epgId`, que es lo único que
     * llevan los canales—: una película se ve una vez y contarla no dice
     * nada, mientras que en la tele se vuelve a los mismos cuatro canales
     * todos los días. Eso es lo que llena «Los que más ves».
     */
    if (epgId) {
      setVistos((antes) => {
        const clave = `live-${epgId}`;
        const siguiente = { ...antes, [clave]: (antes[clave] || 0) + 1 };
        guardar(K_VISTOS, siguiente);
        return siguiente;
      });
    }
  }, []);

  /**
   * Poner un canal es dos cosas, y hasta ahora se hacían en el orden malo.
   *
   * La dirección de un canal no la tiene el aparato: se le pide al servidor,
   * que a su vez se la pide al panel del proveedor. Eso es un viaje de ida y
   * vuelta —medio segundo con suerte, tres o cuatro con un panel lento— y
   * hasta ahora ese viaje se hacía ANTES de cambiar de pantalla: pulsabas OK
   * sobre un canal y no pasaba absolutamente nada, ni un rótulo ni una
   * ruleta, hasta que el enlace llegaba. Con la lista todavía delante, lo que
   * parece es que el mando no ha respondido, y lo normal es volver a pulsar.
   *
   * Ahora se entra primero —con el nombre del canal en pantalla y la ruleta
   * girando— y el enlace se pide desde dentro. Tarda lo mismo, pero se ve lo
   * que está pasando, y ese es justo el trozo de espera que se sentía como
   * «no funciona» en vez de como «está cargando».
   */
  /*
   * Los enlaces de directo ya resueltos, para no volver a pedirlos.
   *
   * Poner un canal son tres viajes seguidos: pedirle al servidor la
   * dirección, bajar el manifiesto y bajar el primer trozo. El primero no
   * depende del proveedor, solo de nosotros, y su respuesta vale doce horas
   * (lo que dura el vale). Pidiéndolo mientras el foco pasa por encima —que
   * con un mando es justo lo que se hace antes de pulsar— cuando llega el OK
   * ya está resuelto, y zapear deja de tener ese tirón.
   */
  const enlacesLive = useRef<Map<string, Promise<Omit<PlaySource, "name" | "kind">>>>(new Map());

  const enlaceLive = useCallback(
    (streamId: string | number) => {
      const llave = String(streamId);
      let ya = enlacesLive.current.get(llave);
      if (!ya) {
        ya = pedirEnlace({ ...creds!, clase: "live", id: llave });
        /* Un fallo no se guarda: si el servidor contestó mal una vez, el
           siguiente intento vuelve a preguntar en vez de heredar el error */
        ya.catch(() => enlacesLive.current.delete(llave));
        enlacesLive.current.set(llave, ya);
      }
      return ya;
    },
    [creds]
  );

  /** Se llama cuando el foco pasa por un canal: para cuando se pulse, ya está. */
  const precargarLive = useCallback(
    (streamId?: string) => {
      if (!streamId || !creds) return;
      enlaceLive(streamId).catch(() => {});
    },
    [creds, enlaceLive]
  );

  const verEsto = useCallback(
    (
      nombre: string,
      kind: PlaySource["kind"],
      pedir: () => Promise<Omit<PlaySource, "name" | "kind">>,
      epgId?: string
    ) => {
      /*
       * Cada puesta en marcha lleva número, y solo la última manda.
       *
       * Pedir el enlace tarda, y en ese rato caben dos cosas muy normales:
       * salir con ATRÁS, o zapear al canal de al lado. Sin este número, el
       * enlace del canal que ya no quieres llega después y se pone encima
       * del que sí: sales del vídeo y el vídeo vuelve solo, o pones el 5 y
       * acabas viendo el 4.
       */
      const mio = ++zapeo.current;
      /* Sin dirección todavía: el reproductor sabe esperarla sin dar error
         —ver `buildAttempts`— y mientras tanto enseña «Conectando con…» */
      reproducir({ url: "", name: nombre, kind }, epgId);
      pedir()
        .then((donde) => {
          if (mio !== zapeo.current) return;
          const source: PlaySource = { ...donde, name: nombre, kind };
          setViendo((antes) => (antes ? { ...antes, source } : antes));
          /* Lo de «seguir viendo» se guarda con la dirección ya resuelta: sin
             esto quedaría guardado el hueco vacío y el atajo no llevaría a
             ningún sitio */
          const ultimoCanal: UltimoCanal = { nombre, source };
          setUltimo(ultimoCanal);
          guardar(K_ULTIMO, ultimoCanal);
        })
        .catch((e) => {
          if (mio !== zapeo.current) return;
          setViendo(null);
          setPantalla(ultimaLista.current);
          setError(enCristiano(e, "No se pudo abrir"));
        });
    },
    [reproducir]
  );
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
        const dentro = suyos.map(aFila);
        return {
          id: `cat-${clave}`,
          nombre: `${titulo}  (${suyos.length})`,
          logo: "",
          carpeta: true,
          icono: iconoDeCategoria(titulo),
          hijos: dentro,
          abrir: () => entrarEnCarpeta(titulo, dentro),
        };
      });
    },
    [entrarEnCarpeta]
  );

  /**
   * Qué hacer al pulsar OK sobre cada título de una portada.
   *
   * La portada trabaja con `Titulo`, que es un dato pelado a propósito —para
   * poder ordenarlo y compararlo sin arrastrar media aplicación detrás—, así
   * que las acciones se guardan aparte y se buscan por identificador.
   *
   * Y van en DOS libretas, no en una.
   *
   * Estaban en una sola, y entrar en Cine la reescribía entera: al volver al
   * inicio, las tarjetas de «En directo ahora» y «Series destacadas» ya no
   * tenían acción y pulsarlas no hacía absolutamente nada. Las de películas
   * sí, porque el identificador es el mismo y las acababa de escribir cine.
   * Un fallo redondo: la pantalla se veía bien y no respondía.
   *
   * La del inicio se escribe una vez y no la toca nadie; la de la sección se
   * rehace en cada carga, que es lo que tiene que hacer. Al pulsar se mira
   * primero la de la sección —si estás dentro de una, manda ella— y si no
   * está, la del inicio.
   */
  const acciones = useRef(new Map<string, () => void | Promise<void>>());
  const accionesInicio = useRef(new Map<string, () => void | Promise<void>>());

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

  /* La portada se pide al entrar y no se vuelve a pedir: el catálogo no
     cambia mientras estás mirándolo, y tres peticiones cada vez que se vuelve
     al inicio son tres esperas para ver lo mismo */
  useEffect(() => {
    if (pantalla !== "portada" || !creds || lista?.tipo !== "xtream") return;
    if (filasInicio.length || cargando) return;
    void cargarInicio();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pantalla, creds, lista]);

  /*
   * Y al cambiar de pantalla, la barra se cierra.
   *
   * Se abre con el ratón encima y se cierra al salir de ella, pero al irse
   * al inicio —que no la lleva— el `<nav>` se desmonta con el puntero dentro
   * y ese «salir» no llega a ocurrir nunca. Resultado: quedaba marcada como
   * abierta para siempre, y al volver a entrar en cualquier sección aparecía
   * desplegada con el ratón en la otra punta de la pantalla.
   */
  useEffect(() => {
    setNavAbierta(false);
  }, [pantalla]);

  /**
   * La dirección con la que se guarda, que no es siempre la que se reproduce.
   *
   * Reproducir lo hace el navegador, que lleva su sesión puesta; guardar lo
   * hace un proceso del aparato, que no la tiene. Cuando el servidor manda
   * las dos, para guardar vale la suya. Ver `/api/tele/ver`.
   */
  const dondeGuardar = (e: { url: string; paraGuardar?: string }) => e.paraGuardar || e.url;

  const abrirTitulo = useCallback((t: Titulo) => {
    (acciones.current.get(t.id) || accionesInicio.current.get(t.id))?.();
  }, []);

  /*
   * Y en cuanto la portada está en pie, se le pregunta a TMDB por lo que se
   * ve. No por el catálogo: por los títulos de las filas, que son ciento y
   * pico. El servidor los tiene guardados de la primera vez que alguien —de
   * cualquier proveedor— abrió una portada con ellos.
   */
  useEffect(() => {
    /* A TMDB no se le pregunta por canales de televisión: «La 1» no es una
       película y lo que devolvería sería ruido —o peor, la carátula de otra
       cosa con ese nombre— */
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
          setCanales(
            canales.map((c, i) => ({
              id: `m3u-plano-${i}`,
              nombre: c.name || `Canal ${i + 1}`,
              logo: c.logo || "",
              abrir: () => reproducir({ url: c.url, name: c.name || "", kind: "auto" }),
            }))
          );
          const carpetasM3u = [...porGrupo.entries()].map(([grupo, suyos]) => ({
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
          }));
          setFilas(carpetasM3u);
          setCarpetasDirecto(carpetasM3u);
          return;
        }
        if (!creds) return;
        if (destino === "directo") {
          const [cats, canales] = await Promise.all([
            xtreamApi<XtreamCategory[]>(creds, "get_live_categories"),
            xtreamApi<XtreamLiveStream[]>(creds, "get_live_streams"),
          ]);
          /*
           * Un canal sin nombre se enseña, no se esconde.
           *
           * Hay paneles que mandan canales con `name: null`. Se caían de la
           * lista entera, y desde el sofá eso es un canal que el proveedor
           * vende y que en su televisor no existe —aunque al pulsarlo se
           * pondría—. Con su número al lado, decir que no tiene nombre basta
           * para saber cuál es.
           */
          const limpios = (Array.isArray(canales) ? canales : []).map((c) => ({
            ...c,
            name: (typeof c.name === "string" ? c.name : "").trim() || "Canal sin nombre",
          }));
          const verCanal = (c: XtreamLiveStream) => () =>
            verEsto(
              c.name,
              "hls",
              () => enlaceLive(c.stream_id),
              String(c.stream_id)
            );
          const aFila = (c: XtreamLiveStream): Fila => ({
            id: `live-${c.stream_id}`,
            nombre: c.name,
            logo: c.stream_icon || "",
            epgId: String(c.stream_id),
            numero: Number(c.num) || 0,
            abrir: verCanal(c),
          });
          const carpetas = carpetasDe(cats, limpios, (c) => c.category_id, aFila);
          setFilas(carpetas);
          setCarpetasDirecto(carpetas);
          /* Y en plano, sin agrupar: es de donde salen la lista de la
             izquierda y las filas de la derecha */
          setCanales(limpios.map(aFila));
          /*
           * El directo entra en la lista, no en una portada de carátulas.
           *
           * Tenía la suya, con banner y filas de tarjetas anchas, copiada de
           * la de cine. Y en cine funciona: una película se elige por el
           * cartel, que es una imagen distinta por título y hecha para
           * venderla. Un canal no tiene cartel. Tiene un logotipo —cuadrado,
           * con el fondo transparente y a menudo en mala calidad— que
           * estirado a tamaño de tarjeta queda como una mancha, así que la
           * portada gastaba media pantalla en imágenes que no dicen nada y
           * dejaba ocho canales a la vista donde caben veinte.
           *
           * Lo que sirve para elegir canal es la lista: número, logotipo
           * pequeño, nombre y qué están dando. Se lee de un vistazo, se
           * recorre con el mando de arriba abajo sin pensar, y es la forma
           * que tiene una guía de televisión desde que existen.
           *
           * Cine y series conservan su portada: ahí las carátulas sí son el
           * argumento para quedarse.
           */
        } else if (destino === "cine") {
          const [cats, pelis] = await Promise.all([
            xtreamApi<XtreamCategory[]>(creds, "get_vod_categories"),
            xtreamApi<XtreamVodStream[]>(creds, "get_vod_streams"),
          ]);
          const limpias = (Array.isArray(pelis) ? pelis : []).filter(
            (v) => typeof v.name === "string" && v.name.trim()
          );
          /* Poner la película, cuando ya se ha decidido ponerla */
          const ponerPeli = (v: XtreamVodStream) => () =>
            verEsto(v.name, "video", () =>
              pedirEnlace({
                ...creds,
                clase: "movie",
                id: String(v.stream_id),
                ext: v.container_extension || "mp4",
              })
            );
          /*
           * Y antes, su ficha.
           *
           * Pulsar una carátula arrancaba el vídeo directamente. Con una
           * película que ya conoces está bien; con una que no —que son casi
           * todas las de un catálogo de miles— es entrar a ciegas y salir a
           * los veinte segundos, y en el camino se ha abierto una conexión
           * contra el panel del proveedor para nada.
           */
          const verPeli = (v: XtreamVodStream) => async () => {
            const suyo = mejor({
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
            });
            abrirFicha({
              id: `vod-${v.stream_id}`,
              nombre: v.name,
              volverA: "cine",
              esSerie: false,
              cartel: imgSrc(suyo.imagen) || "",
              fondo: suyo.fondo || "",
              sinopsis: suyo.sinopsis || "",
              datos: datosDe(suyo),
              anio: suyo.anio || "",
              duracion: "",
              genero: suyo.generos || "",
              nota: suyo.nota ? String(suyo.nota) : "",
              votos: suyo.votos || 0,
              categoria: nombreDeCategoria(cats, v.category_id),
              reparto: "",
              direccion: "",
              temporadas: [],
              episodios: {},
              reproducir: ponerPeli(v),
              enlace: async () =>
                dondeGuardar(
                  await pedirEnlace({
                    ...creds,
                    clase: "movie",
                    id: String(v.stream_id),
                    ext: v.container_extension || "mp4",
                  })
                ),
            });
            /* El detalle del panel —reparto, dirección y la sinopsis cuando
               TMDB no la tiene— por debajo y sin bloquear la pantalla */
            try {
              const info = await xtreamApi<XtreamVodInfo>(creds, "get_vod_info", { vod_id: String(v.stream_id) });
              setFicha((antes) =>
                antes && antes.nombre === v.name
                  ? {
                      ...antes,
                      sinopsis: antes.sinopsis || String(info.info?.plot ?? info.info?.description ?? ""),
                      duracion: duracionDe(info.info?.duration, info.info?.duration_secs),
                      genero: antes.genero || String(info.info?.genre ?? ""),
                      nota: antes.nota || String(info.info?.rating ?? ""),
                      reparto: String(info.info?.cast ?? info.info?.actors ?? ""),
                      direccion: String(info.info?.director ?? ""),
                    }
                  : antes
              );
            } catch {
              /* Sin detalle no pasa nada: la ficha ya tiene lo que trae la
                 lista y el botón de reproducir sigue donde estaba */
            }
          };
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
              abrir: () => abrirSerie(s, nombreDeCategoria(cats, s.category_id)),
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
            limpias.map((s) => () => abrirSerie(s, nombreDeCategoria(cats, s.category_id)))
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

  /*
   * Abrir la ficha: primero lo que ya se sabe, después lo que haya que pedir.
   *
   * La ficha se pinta con lo que trae la lista —cartel, título, y lo que
   * TMDB ya haya dado— y por debajo se pide el detalle al panel. Al revés
   * —esperar a tener todo y entonces cambiar de pantalla— se pulsa OK y no
   * pasa nada durante un segundo largo, que es exactamente el problema que
   * ya arreglamos al poner un canal.
   */
  const abrirFicha = useCallback((f: Ficha) => {
    setFicha(f);
    setFichaZona("boton");
    setFichaTemp(0);
    setFichaEp(0);
    setPantalla("ficha");
  }, []);

  /*
   * El reparto con cara y nombre, del título abierto.
   *
   * El panel manda una lista de nombres separados por comas; las caras las
   * sabe TMDB. Se piden al abrir la ficha —una petición, y la respuesta se
   * guarda en el servidor para todos los clientes de todos los proveedores—
   * porque es la única pantalla donde el reparto se mira: en una fila de
   * carátulas no se ve, y pedirlo para los ciento cincuenta títulos de una
   * portada sería pagar por lo que nadie mira.
   *
   * Se vacía al cambiar de ficha: sin eso, al abrir la segunda película se
   * quedaría un instante el reparto de la primera.
   */
  const [repartoTmdb, setRepartoTmdb] = useState<Actor[]>([]);
  useEffect(() => {
    setRepartoTmdb([]);
    if (!ficha) return;
    let vivo = true;
    fetch(`/api/reparto?mac=${encodeURIComponent(macDelAparato())}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre: ficha.nombre, anio: ficha.anio, serie: ficha.esSerie }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (vivo && Array.isArray(d?.reparto)) setRepartoTmdb(d.reparto);
      })
      /* Sin caras, los nombres del panel. Nunca es motivo para dejar una
         pantalla a medias */
      .catch(() => {});
    return () => {
      vivo = false;
    };
    /* Por identificador y no por el objeto entero: la ficha se completa sola
       —con los episodios, y con lo que sepa TMDB— y con el objeto en la
       lista el reparto se volvería a pedir en cada retoque, vaciando la fila
       de caras por el camino */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ficha?.id]);

  /*
   * Y el fondo apaisado, la sinopsis en español y la nota de verdad.
   *
   * Se pedían solo para los títulos de la portada, y el abridor de cada
   * carátula se monta con lo que se supiera en ese momento: la misma
   * película abierta desde su carpeta, desde la rejilla o desde una búsqueda
   * salía con otra ficha —sin fondo, con la sinopsis del panel y con la nota
   * que el proveedor haya puesto a mano—. Dos fichas distintas de lo mismo
   * según por dónde se llegara.
   *
   * Si ya se sabe, se pone; y si no, se pregunta por esa sola. Es una fila
   * que el servidor tiene guardada —la misma que acaba de mirar para el
   * reparto—, así que no cuesta una petición a TMDB más.
   */
  useEffect(() => {
    if (!ficha) return;
    const abierta = ficha.id;
    const ponerlo = (m: MetaTitulo) =>
      setFicha((antes) =>
        antes && antes.id === abierta
          ? {
              ...antes,
              cartel: antes.cartel || m.cartel,
              fondo: antes.fondo || m.fondo,
              sinopsis: antes.sinopsis || m.sinopsis,
              genero: antes.genero || m.generos,
              nota: m.nota > 0 ? String(Math.round(m.nota * 10) / 10) : antes.nota,
              votos: m.votos || antes.votos,
              anio: antes.anio || m.anio,
            }
          : antes
      );

    const quien = { nombre: ficha.nombre, anio: ficha.anio, serie: ficha.esSerie };
    const sabido = meta[llaveTmdb({ nombre: ficha.nombre, anio: ficha.anio, esSerie: ficha.esSerie })];
    if (sabido) {
      ponerlo(sabido);
      return;
    }

    let vivo = true;
    fetch(`/api/meta?mac=${encodeURIComponent(macDelAparato())}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ titulos: [quien] }),
    })
      .then((r) => r.json())
      .then((d) => {
        const m = Array.isArray(d?.meta) ? (d.meta[0] as MetaTitulo | undefined) : undefined;
        if (!vivo || !m) return;
        setMeta((antes) => (antes[m.llave] ? antes : { ...antes, [m.llave]: m }));
        ponerlo(m);
      })
      /* Sin TMDB, la ficha se queda con lo del panel, que es lo que hacía */
      .catch(() => {});
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ficha?.id, meta]);

  /* La carpeta llega como parámetro porque aquí no hay categorías: se
     conocen en la carga de la sección, que es quien monta los abridores */
  /**
   * La ficha de una película.
   *
   * Estaba dentro de `cargar`, atada a la carga de la sección de cine. La
   * portada de inicio enseña películas sin haber entrado en cine, así que
   * necesita poder abrir la ficha por su cuenta: es la misma función, y por
   * eso ahora vive aquí y no dentro de aquel cierre.
   */
  /**
   * Lo que se enseña al encender: una fila de cada sección.
   *
   * Son tres peticiones al panel en vez de ninguna, y merecen la pena: sin
   * ellas la primera pantalla es un menú con tres palabras y no se ve un solo
   * título hasta después de elegir. Se piden a la vez y la pantalla se pinta
   * en cuanto llegan; si alguna falla, las otras dos salen igual.
   *
   * Los canales van con su logotipo y lo que dan ahora, no con carátula: un
   * canal no tiene cartel, y esa es la razón por la que su fila se ve
   * distinta a las otras dos por mucho que se quiera que se vean iguales.
   */
  const cargarInicio = useCallback(async () => {
    if (!creds || lista?.tipo !== "xtream") return;
    setCargando(true);
    const filas: FilaPortada[] = [];
    const nuevas = new Map<string, () => void | Promise<void>>();

    const [canales, pelis, series] = await Promise.all([
      xtreamApi<XtreamLiveStream[]>(creds, "get_live_streams").catch(() => []),
      xtreamApi<XtreamVodStream[]>(creds, "get_vod_streams").catch(() => []),
      xtreamApi<XtreamSeries[]>(creds, "get_series").catch(() => []),
    ]);

    /* En directo: los primeros del panel, que es el orden que ha puesto el
       proveedor —sus destacados delante— y no uno inventado por nosotros */
    const enDirecto = (Array.isArray(canales) ? canales : [])
      .map((c) => ({
        ...c,
        name: (typeof c.name === "string" ? c.name : "").trim() || "Canal sin nombre",
      }))
      .slice(0, 14)
      .map((c) => {
        nuevas.set(`live-${c.stream_id}`, () =>
          verEsto(
            c.name,
            "hls",
            () => enlaceLive(c.stream_id),
            String(c.stream_id)
          )
        );
        return {
          id: `live-${c.stream_id}`,
          nombre: c.name,
          imagen: c.stream_icon || "",
          anio: "",
          nota: "",
          alta: 0,
          sinopsis: "",
          generos: "",
          esSerie: false,
          categoria: String(c.category_id ?? ""),
          epgId: String(c.stream_id),
          numero: Number(c.num) || 0,
        } as Titulo;
      });
    if (enDirecto.length) filas.push({ titulo: "En directo ahora", items: enDirecto, anchas: true });

    /*
     * Sin carátula no entra en el escaparate.
     *
     * Aquí no se enseña «el catálogo», se enseñan doce de entre miles: hay
     * candidatos de sobra y un hueco gris con el nombre escrito dentro no
     * vende nada. En la lista de una carpeta sería otra cosa —ahí están los
     * títulos que hay, y esconder la mitad porque el proveedor no les puso
     * imagen es quitarle catálogo al cliente—, pero un escaparate se elige.
     */
    const conCaratula = (x: { cover?: string; stream_icon?: string }) =>
      Boolean((x.cover || x.stream_icon || "").trim());

    /*
     * Y se ordena por año, de lo más nuevo a lo más viejo.
     *
     * Iba por nota, que era lo que había, y lo que había estaba mal: medio
     * catálogo trae la nota puesta a 10 a mano por el proveedor, así que
     * ordenar por ella no ordena nada —salían quince empatados a 10— y lo
     * que se colaba arriba era lo peor cuidado: títulos repetidos tres
     * veces, carteles que no cargan y una película de 1928 encabezando
     * «destacadas». La fecha, en cambio, es un dato de verdad.
     *
     * De desempate, cuándo lo dio de alta el proveedor: dos películas del
     * mismo año se ordenan por la que acaba de llegar.
     */
    const porNuevo = (a: Titulo, b: Titulo) =>
      Number(b.anio || 0) - Number(a.anio || 0) || b.alta - a.alta;

    const seriesDestacadas = (Array.isArray(series) ? series : [])
      .filter((x) => typeof x.name === "string" && x.name.trim() && conCaratula(x))
      .map((x) => {
        nuevas.set(`serie-${x.series_id}`, () => abrirSerie(x));
        return {
          id: `serie-${x.series_id}`,
          nombre: x.name,
          imagen: x.cover || "",
          anio: anioDe(x.releaseDate ?? x.release_date),
          nota: String(x.rating ?? ""),
          alta: Number(x.last_modified) || 0,
          sinopsis: String(x.plot ?? ""),
          generos: String(x.genre ?? ""),
          esSerie: true,
          categoria: String(x.category_id ?? ""),
        } as Titulo;
      })
      .sort(porNuevo);
    /* Sin repetir: un panel trae «7:07» tres veces —en HD, en 4K y suelta— y
       la fila enseñaba las tres seguidas como si fueran tres series */
    const seriesLimpias = sinRepetir(seriesDestacadas).slice(0, 30);
    if (seriesLimpias.length)
      filas.push({ titulo: "Series destacadas", items: seriesLimpias, escaparate: true });

    const pelisDestacadas = (Array.isArray(pelis) ? pelis : [])
      .filter((x) => typeof x.name === "string" && x.name.trim() && conCaratula(x))
      .map((x) => {
        nuevas.set(`vod-${x.stream_id}`, () => abrirPelicula(x));
        return {
          id: `vod-${x.stream_id}`,
          nombre: x.name,
          imagen: x.stream_icon || "",
          anio: anioDe(x.year ?? x.releasedate),
          nota: String(x.rating ?? ""),
          alta: Number(x.added) || 0,
          sinopsis: String(x.plot ?? ""),
          generos: String(x.genre ?? ""),
          esSerie: false,
          categoria: String(x.category_id ?? ""),
        } as Titulo;
      })
      .sort(porNuevo);
    const pelisLimpias = sinRepetir(pelisDestacadas).slice(0, 30);
    if (pelisLimpias.length)
      filas.push({ titulo: "Películas destacadas", items: pelisLimpias, escaparate: true });

    /* En su propia libreta: la de la sección se rehace cada vez que se entra
       en una, y hasta ahora se llevaba estas por delante */
    accionesInicio.current = nuevas;
    setFilasInicio(filas);
    setCargando(false);
  }, [creds, lista]);

  async function abrirPelicula(v: XtreamVodStream, carpeta = "") {
    if (!creds) return;
    const suyo = mejor({
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
    });
    const ext = v.container_extension || "mp4";
    abrirFicha({
      id: `vod-${v.stream_id}`,
      nombre: v.name,
      volverA: "cine",
      esSerie: false,
      cartel: imgSrc(suyo.imagen) || "",
      fondo: suyo.fondo || "",
      sinopsis: suyo.sinopsis || "",
      datos: datosDe(suyo),
      anio: suyo.anio || "",
      duracion: "",
      genero: suyo.generos || "",
      nota: suyo.nota ? String(suyo.nota) : "",
      votos: suyo.votos || 0,
      categoria: carpeta,
      reparto: "",
      direccion: "",
      temporadas: [],
      episodios: {},
      reproducir: () =>
        verEsto(v.name, "video", () =>
          pedirEnlace({ ...creds, clase: "movie", id: String(v.stream_id), ext })
        ),
      enlace: async () =>
        dondeGuardar(await pedirEnlace({ ...creds, clase: "movie", id: String(v.stream_id), ext })),
    });
    /* El detalle del panel —reparto, dirección y la sinopsis cuando TMDB no
       la tiene— por debajo y sin bloquear la pantalla */
    try {
      const info = await xtreamApi<XtreamVodInfo>(creds, "get_vod_info", { vod_id: String(v.stream_id) });
      setFicha((antes) =>
        antes && antes.nombre === v.name
          ? {
              ...antes,
              sinopsis: antes.sinopsis || String(info.info?.plot ?? info.info?.description ?? ""),
              duracion: duracionDe(info.info?.duration, info.info?.duration_secs),
              genero: antes.genero || String(info.info?.genre ?? ""),
              nota: antes.nota || String(info.info?.rating ?? ""),
              reparto: String(info.info?.cast ?? info.info?.actors ?? ""),
              direccion: String(info.info?.director ?? ""),
            }
          : antes
      );
    } catch {
      /* Sin detalle no pasa nada: la ficha ya tiene lo que trae la lista */
    }
  }

  async function abrirSerie(s: XtreamSeries, carpeta = "") {
    if (!creds) return;
    const suyo = mejor({
      id: `serie-${s.series_id}`,
      nombre: s.name,
      imagen: s.cover || "",
      anio: anioDe(s.releaseDate ?? s.release_date),
      nota: String(s.rating ?? ""),
      alta: 0,
      sinopsis: String(s.plot ?? ""),
      generos: String(s.genre ?? ""),
      esSerie: true,
      categoria: String(s.category_id ?? ""),
    });
    abrirFicha({
      id: `serie-${s.series_id}`,
      nombre: s.name,
      volverA: "series",
      esSerie: true,
      cartel: imgSrc(suyo.imagen) || "",
      fondo: suyo.fondo || "",
      sinopsis: suyo.sinopsis || "",
      datos: datosDe(suyo),
      anio: suyo.anio || "",
      duracion: "",
      genero: suyo.generos || "",
      nota: suyo.nota ? String(suyo.nota) : "",
      votos: suyo.votos || 0,
      categoria: carpeta,
      reparto: "",
      direccion: "",
      temporadas: [],
      episodios: {},
      reproducir: () => {},
    });
    setCargando(true);
    try {
      const info = await xtreamApi<XtreamSeriesInfo>(creds, "get_series_info", { series_id: String(s.series_id) });
      const porTemporada: Record<string, Episodio[]> = {};
      for (const [temporada, lista] of Object.entries(info.episodes || {})) {
        porTemporada[temporada] = (lista || []).map((ep) => {
          /* Sin el nombre de la serie ni el «S01E03» delante: estás dentro
             de la serie y el número va en la propia fila. También en el
             rótulo de «estás viendo», que si no dice la serie dos veces */
          const titulo = tituloDeEpisodio(ep.title || "", s.name) || `Episodio ${ep.episode_num}`;
          return {
            id: `ep-${ep.id}`,
            numero: String(ep.episode_num ?? ""),
            titulo,
            imagen: imgSrc(ep.info?.movie_image || "") || "",
            duracion: minutosDe(ep.info?.duration || ""),
            sinopsis: String(ep.info?.plot ?? ""),
            abrir: () =>
              verEsto(`${s.name} — ${titulo}`, "video", () =>
                pedirEnlace({
                  ...creds,
                  clase: "series",
                  id: ep.id,
                  ext: ep.container_extension || "mp4",
                })
              ),
            /* La misma dirección que usa `abrir`, pero devuelta en vez de
               puesta: guardarlo en el aparato y verlo son lo mismo con dos
               finales distintos */
            enlace: async () =>
              dondeGuardar(
                await pedirEnlace({
                  ...creds,
                  clase: "series",
                  id: ep.id,
                  ext: ep.container_extension || "mp4",
                })
              ),
          };
        });
      }
      /* En orden de número y no como los mande el panel: hay paneles que
         devuelven la 10 antes que la 2 porque ordenan por texto */
      const temporadas = Object.keys(porTemporada).sort((a, b) => Number(a) - Number(b));
      const primero = porTemporada[temporadas[0]]?.[0];
      setFicha((antes) =>
        antes && antes.nombre === s.name
          ? {
              ...antes,
              sinopsis: antes.sinopsis || String(info.info?.plot ?? ""),
              /* En una serie, la duración es la del episodio: decir «45 min»
                 a secas de una serie de siete temporadas no significa nada */
              /* «45 min/ep» y no «45 min»: decir «45 min» a secas de una
                 serie de siete temporadas no significa nada. Y es como lo
                 dicen la web y el aparato, que es lo mismo mirado en otra
                 pantalla */
              duracion: minutosDe(String(info.info?.episode_run_time ?? "")).replace(/ min$/, " min/ep"),
              genero: antes.genero || String(info.info?.genre ?? ""),
              nota: antes.nota || String(info.info?.rating ?? ""),
              reparto: String(info.info?.cast ?? ""),
              direccion: String(info.info?.director ?? ""),
              temporadas,
              episodios: porTemporada,
              reproducir: primero ? primero.abrir : () => {},
            }
          : antes
      );
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
    /* Volver al inicio desde la barra deja lo mismo que ATRÁS: sin la lista
       de la sección anterior debajo y con el foco en la pestaña de la que se
       sale, no en la fila 47 de una lista que ya no está */
    if (destino === "portada") {
      const vengoDe = destinos.findIndex((d) => d.id === pantalla);
      setFoco(vengoDe >= 0 ? vengoDe : 0);
      setFocoFila(-1);
      setFocoCol(vengoDe >= 0 ? vengoDe : 0);
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
  /* «Todos»: quita el filtro de carpeta sin salir de la pantalla del directo
     ni volver a pedirle nada al panel — los canales en plano ya están */
  function quitarCarpeta() {
    /* De vuelta arriba, el foco se queda en la carpeta de la que sales: si no,
       salir de la carpeta 40 te deja en la 1 y hay que volver a bajar */
    const vengoDe = carpetasDirecto.findIndex((c) => c.nombre.startsWith(carpetaAbierta));
    setCarpetaAbierta("");
    setVista("portada");
    /* Y `filas` vuelve a ser el índice de carpetas, que es lo que era antes
       de entrar en una: si no, el catálogo entero enseñaba los canales de la
       carpeta que se acababa de soltar */
    if (carpetasDirecto.length) setFilas(carpetasDirecto);
    setFoco(vengoDe >= 0 ? vengoDe : 0);
    setZonaDir("canales");
  }

  function verCarpetas() {
    setVista("carpetas");
    setFoco(0);
  }

  function ir(destino: Pantalla) {
    setPantalla(destino);
    setFocoCarril(null);
    /* El directo se abre siempre por la lista de canales, no por la mitad
       derecha: es donde se elige */
    setZonaDir("canales");
    /* Cine y series siempre abren por la portada, aunque la última vez se
       saliera desde la lista de carpetas: al entrar se pregunta «qué veo», no
       «en qué carpeta estaba» */
    setVista("portada");
    setFilasPortada([]);
    setCandidatos([]);
    setFoco(0);
    setDescargaCol(0);
    /* Las descargas ya están en el aparato: no hay nada que pedirle al panel
       del proveedor, y pedírselo sería esperar a una respuesta que no cambia
       nada de lo que se va a enseñar */
    if (destino !== "portada" && destino !== "viendo" && destino !== "descargas") cargar(destino);
  }

  /**
   * ATRÁS deshace un paso cada vez, en el orden en que se entró:
   * vídeo → episodios → carpeta → carpetas de la sección → portada.
   */
  function atras() {
    if (pantalla === "viendo") {
      /* Y el enlace que venga de camino, que no vuelva a abrir el vídeo:
         saliste, y llegar tarde no le da derecho a entrar */
      zapeo.current++;
      setViendo(null);
      /* Vuelve a la ficha si se entró desde una ficha —que es como se ve el
         episodio siguiente sin volver a buscar la serie— y si no, a la lista
         de la que se salió */
      setPantalla(ficha ? "ficha" : filas.length ? ultimaLista.current : "portada");
      return;
    }
    /* De la ficha se vuelve a donde se entró —la portada de cine o la de
       series—, no al menú: si no, ATRÁS se salta un paso */
    if (pantalla === "ficha" && ficha) {
      const vuelta = ficha.volverA;
      setFicha(null);
      setPantalla(vuelta);
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
      /* En el directo, subir un piso no es volver a cargar la sección: los
         canales en plano y las carpetas ya están en la mano, y pedírselos otra
         vez al panel son ocho mil canales por una tecla de ATRÁS */
      if (pantalla === "directo" && carpetasDirecto.length) {
        quitarCarpeta();
        return;
      }
      setCarpetaAbierta("");
      cargar(pantalla);
      return;
    }
    /* Y de la lista de carpetas se vuelve a la portada, que es de donde se
       entró: si no, ATRÁS se saltaba un paso y salía al menú */
    if (
      vista === "carpetas" &&
      (pantalla === "cine" || pantalla === "series" ||
        /* El directo solo tiene pantalla propia si se han podido armar los
           canales en plano; si no, no hay a dónde volver y ATRÁS tiene que
           salir al inicio de una vez */
        (pantalla === "directo" && canales.length > 0))
    ) {
      setVista("portada");
      return;
    }
    /* De vuelta en el inicio, el foco se queda en la pestaña de la que
       sales. Si no, hereda la posición que tuviera la lista —la carátula 14,
       por ejemplo— y el inicio aparece con una pestaña cualquiera encendida.
       Va en `focoFila`/`focoCol` porque así se recorre el inicio: la fila −1
       son las pestañas y la columna, cuál de ellas. */
    const vengoDe = destinos.findIndex((d) => d.id === pantalla);
    setFocoFila(-1);
    setFocoCol(vengoDe >= 0 ? vengoDe : 0);
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
    /*
     * Menos al ponerse a ver, que es cuando más falta hacen.
     *
     * Poner un canal cambia la pantalla a «viendo», y esto se vaciaba
     * también ahí: la guía del canal que acabas de poner se borraba en el
     * mismo momento de entrar, y el rótulo decía «tu proveedor no manda la
     * guía de este canal» justo del canal cuya guía se estaba leyendo en la
     * lista un segundo antes. Se limpia al cambiar de carpeta o de sección,
     * que es cuando de verdad deja de valer.
     */
    if (pantalla === "viendo") return;
    setEpgAhora({});
    if (!creds || lista?.tipo !== "xtream") return;
    if (pantalla !== "directo" && pantalla !== "portada") return;
    /*
     * De dónde salen los canales que hay que consultar.
     *
     * En el directo, de la carpeta abierta —fuera de ella lo que se ve son
     * carpetas, que no tienen guía—. En la portada de inicio, de la fila «en
     * directo ahora», que sin la guía sería una fila de logotipos sin decir
     * qué dan, que es justo lo que no sirve para elegir.
     */
    const ids = (
      pantalla === "portada"
        ? filasInicio.flatMap((f) => f.items.map((t) => t.epgId))
        : pantalla === "directo"
          ? (carpetaAbierta ? filas : canales).map((f) => f.epgId)
          : filas.map((f) => f.epgId)
    )
      .filter((id): id is string => Boolean(id))
      .slice(0, 40);
    if (!ids.length) return;

    let cancelado = false;
    (async () => {
      for (let i = 0; i < ids.length && !cancelado; i += 6) {
        const tanda = ids.slice(i, i + 6);
        const hechas = await Promise.all(
          tanda.map(async (id) => {
            const vacia: Guia = { ahora: "", luego: "", desde: 0, hasta: 0, resumen: "" };
            try {
              const res = await xtreamApi<{
                epg_listings?: {
                  title?: string;
                  description?: string;
                  start?: string;
                  end?: string;
                  start_timestamp?: string | number;
                  stop_timestamp?: string | number;
                }[];
              }>(creds, "get_short_epg", { stream_id: id, limit: "2" });
              const listado = res.epg_listings || [];
              if (!listado.length) return [id, vacia] as const;
              /* El que está en antena, no el primero de la lista: la regla
                 vive en lib/epg.ts y la comparte con el reproductor web */
              const horas = listado.map((e) => ({
                titulo: decodeBase64Maybe(e.title) || "",
                resumen: decodeBase64Maybe(e.description) || "",
                desde: momento(e.start_timestamp ?? e.start),
                hasta: momento(e.stop_timestamp ?? e.end),
              }));
              const i = indiceEnAntena(listado);
              return [
                id,
                {
                  ahora: horas[i].titulo,
                  luego: horas[i + 1]?.titulo || "",
                  desde: horas[i].desde,
                  hasta: horas[i].hasta,
                  resumen: horas[i].resumen,
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
  }, [pantalla, filas, filasInicio, canales, carpetaAbierta, lista]);

  const ultimaLista = useRef<Pantalla>("directo");
  useEffect(() => {
    if (pantalla === "directo" || pantalla === "cine" || pantalla === "series") ultimaLista.current = pantalla;
  }, [pantalla]);

  /*
   * Las dos filas de la derecha del directo.
   *
   * «En vivo ahora» son canales que sí tienen guía: la tarjeta enseña el
   * programa, y sin guía la tarjeta no diría nada que la lista de la
   * izquierda no diga ya. «Destacados» son los que más pones en este
   * aparato —una raya en la pared por cada vez, ver `K_VISTOS`—, y en un
   * aparato recién estrenado, los primeros que manda el panel.
   */
  /*
   * La primera fila de la derecha son las carpetas, y es lo que hacía falta.
   *
   * Estuvo «En vivo ahora», una fila de tarjetas con el canal y su programa,
   * y sobraba: eso mismo lo dice ya la lista de la izquierda, canal por
   * canal y sin gastar media pantalla. Lo que no había manera de hacer era
   * lo único que de verdad se hace aquí a menudo —cambiar de carpeta—, que
   * costaba ir al índice completo, elegir y volver.
   *
   * Ahora se cambia de carpeta sin salir de la pantalla: se pulsa y la lista
   * de la izquierda se filtra. «Todos» quita el filtro.
   */
  /*
   * Y cuándo se enseña esta pantalla en vez del índice de categorías.
   *
   * Hace falta la lista en plano, que solo se arma con una lista Xtream o un
   * M3U ya leído: mientras carga, o si el proveedor no manda nada, se cae a
   * la lista de siempre en vez de enseñar una pantalla vacía con dos
   * carruseles sin nada dentro.
   */
  const dirEnPortada =
    pantalla === "directo" && canales.length > 0 && (vista === "portada" || Boolean(carpetaAbierta));

  /**
   * Crear un perfil desde la tele.
   *
   * Solo estaba en el reproductor web, así que quien entra por la televisión
   * —que es el caso normal en el salón— no tenía manera de añadir a nadie:
   * veía un perfil, el suyo, y ahí se acababa. El nombre se pide con el
   * teclado del aparato, que es lo que hay: escribir con el mando es
   * incómodo, pero se hace una vez y la alternativa es no poder hacerlo.
   */
  const [creandoPerfil, setCreandoPerfil] = useState(false);
  const [nombreNuevo, setNombreNuevo] = useState("");
  async function crearPerfil(e?: React.FormEvent) {
    e?.preventDefault();
    const nombre = nombreNuevo.trim();
    if (!nombre) return;
    try {
      const r = await fetch("/api/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nombre }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(d.error || "No se ha podido crear el perfil");
        return;
      }
      const otra = await fetch("/api/profiles", { cache: "no-store" }).then((x) => x.json());
      setPerfiles(Array.isArray(otra.profiles) ? otra.profiles : []);
      setCabenMas(Boolean(otra.canAddMore));
      setCreandoPerfil(false);
      setNombreNuevo("");
      setError("");
    } catch (x) {
      setError(enCristiano(x, "No se ha podido crear el perfil"));
    }
  }

  const elegirPerfil = useCallback(async (p: Perfil) => {
    setPerfil(p);
    setPantalla("portada");
    setFoco(0);
    setFocoFila(-1);
    setFocoCol(0);
    /* Y se le dice al servidor, que es quien guarda lo que va viendo cada
       uno. Si falla, se sigue: haberlo elegido en la pantalla ya vale para
       esta sesión */
    try {
      await fetch("/api/profiles", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId: p.id }),
      });
    } catch {
      /* Ver arriba */
    }
  }, []);

  /* ---------- El mando ---------- */

  /* Una lista de películas o de series se enseña en carátulas grandes; los
     canales, las carpetas y los episodios, en filas con su nombre. Basta con
     que algo de lo que hay pida carátula: nunca se mezclan las dos cosas. */
  const rejilla = filas.length > 0 && filas.some((f) => f.caratula);

  /* ---------- La cabecera viva del directo ---------- */

  /*
   * El canal que hay debajo del foco, con su guía.
   *
   * Solo en el directo: en cine y series manda la portada de carátulas.
   */
  const enDirecto = pantalla === "directo";
  /* Una lista de carpetas se pinta distinta que una de canales: son cajas
     cortas, y estiradas al ancho entero desperdician la pantalla */
  const soloCarpetas = filas.length > 0 && filas.every((f) => f.carpeta);

  /*
   * Qué se baja desde la ficha que haya abierta.
   *
   * En una película, la película. En una serie, el episodio que tengas
   * elegido: bajar «la serie» son cuarenta ficheros y varios gigas, y eso no
   * es una decisión que se tome sin querer con un botón.
   *
   * Va aquí y no dentro del render porque lo necesitan los dos: el botón que
   * se pulsa con el ratón y la tecla OK del mando, que se atiende arriba.
   */
  const epsDeLaFicha = ficha ? ficha.episodios[ficha.temporadas[fichaTemp]] || [] : [];
  const bajable = (() => {
    if (!ficha) return null;
    if (ficha.temporadas.length) {
      const ep = epsDeLaFicha[fichaEp];
      if (!ep?.enlace) return null;
      return {
        id: ep.id,
        nombre: `${ficha.nombre} · ${ep.numero}`,
        cartel: ep.imagen || ficha.cartel,
        enlace: ep.enlace,
      };
    }
    if (!ficha.enlace) return null;
    return { id: ficha.id, nombre: ficha.nombre, cartel: ficha.cartel, enlace: ficha.enlace };
  })();
  const yaBajado = bajable ? descargas.find((d) => d.id === bajable.id) : undefined;
  const bajarEsto = async () => {
    if (!bajable) return;
    /* El mismo botón pone y quita: si guardar es un botón y borrar es ir a
       ajustes, el disco se llena y no se vacía nunca */
    if (yaBajado) {
      quitarDescarga(bajable.id);
      setDescargas(leerDescargas());
      return;
    }
    /* «Preparando…» en cuanto se pulsa: resolver la dirección contra el panel
       del proveedor tarda, y un botón que no hace nada durante dos segundos
       se pulsa otra vez */
    setPreparando(bajable.id);
    try {
      const url = await bajable.enlace();
      /* Sin dirección no hay descarga, y se dice: callarse aquí deja el
         botón como si no hubieras pulsado */
      if (!url) throw new Error("Tu proveedor no ha dado la dirección de este vídeo");
      const roto = encargarDescarga({ id: bajable.id, nombre: bajable.nombre, cartel: bajable.cartel, url });
      if (roto) throw new Error(roto);
      setDescargas(leerDescargas());
      setReciénEncargado(Date.now());
    } catch (e) {
      setError(enCristiano(e, "No se ha podido empezar la descarga"));
    } finally {
      setPreparando("");
    }
  };
  /*
   * La lista de la izquierda: los canales de la categoría abierta, y si no
   * hay ninguna abierta, todos.
   *
   * Antes el directo entraba por una lista de carpetas y no enseñaba un solo
   * canal hasta que elegías una. Eso es hacer elegir antes de haber visto
   * nada: se entra a ver la tele, no a administrar categorías. Ahora la
   * categoría es un filtro que se aplica encima, no una puerta que hay que
   * abrir primero.
   */
  /*
   * La columna de la izquierda tiene dos pisos, y se entra por el de arriba.
   *
   * Estuvo enseñando los canales en plano, todos: con un proveedor de verdad
   * eso son ocho mil filas seguidas y encontrar uno es imposible, con mando y
   * con ratón. Ahora arriba están las carpetas —que es como el proveedor ha
   * ordenado su catálogo— y dentro de cada una, sus canales. ATRÁS sube un
   * piso, igual que en el resto de la aplicación.
   */
  const canalesVista = carpetaAbierta ? filas : carpetasDirecto;
  /*
   * Y la mitad derecha enseña algo aunque estés en el piso de las carpetas:
   * lo que echan en el primer canal de la que tienes debajo del foco. Así
   * recorrer carpetas ya dice de qué va cada una, en vez de dejar media
   * pantalla en negro hasta que entras.
   */
  const enCarpetas = enDirecto && !carpetaAbierta;
  const canalMirado = enDirecto
    ? enCarpetas
      ? canalesVista[foco]?.hijos?.[0]
      : canalesVista[foco]
    : undefined;
  const guiaMirada = canalMirado?.epgId ? epgAhora[canalMirado.epgId] : undefined;

  /*
   * Y en cuanto el foco se posa en un canal, se le pide su dirección.
   *
   * Con un mando, entre que el foco llega a un canal y se pulsa OK pasa
   * siempre algo de tiempo —se lee el nombre, se mira qué echan—. Ese rato
   * estaba desaprovechado y es justo lo que dura el viaje que hace falta
   * hacer antes de poder empezar. La guía de ese canal ya se pide así.
   */
  useEffect(() => {
    /* `canalMirado` ya resuelve los dos casos —dentro de una carpeta, el
       canal enfocado; fuera, el primero de la carpeta enfocada—, así que no
       hace falta distinguirlos aquí. Sin `epgId` no es un canal de directo */
    if (!enDirecto) return;
    precargarLive(canalMirado?.epgId);
  }, [enDirecto, canalMirado?.epgId, precargarLive]);

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
  /* El reloj corre donde se enseña una guía, que es la pantalla del directo */
  const conGuiaALaVista = enDirecto;
  useEffect(() => {
    if (!conGuiaALaVista) return;
    const t = setInterval(() => setAhoraMismo(Date.now()), 30000);
    return () => clearInterval(t);
  }, [conGuiaALaVista]);

  const avanceDe = (g?: Guia) => {
    if (!g?.desde || !g.hasta || g.hasta <= g.desde) return null;
    const parte = (ahoraMismo - g.desde) / (g.hasta - g.desde);
    if (parte < 0 || parte > 1) return null;
    return Math.round(parte * 100);
  };

  const quedaDe = (g?: Guia) => {
    if (!g?.hasta) return "";
    const falta = g.hasta - ahoraMismo;
    /* Ya terminó, o falta tanto que la guía se ha quedado vieja: decir
       «quedan» de algo que no está en antena es peor que callarse */
    if (falta <= 0 || falta > 600 * 60000) return "";
    const minutos = Math.round(falta / 60000);
    /*
     * El último minuto se dice con palabras.
     *
     * Redondeando, ese minuto sale como «quedan 0 min», así que la línea
     * desaparecía —y volvía sola un minuto después con el programa
     * siguiente—. Justo en el momento en que más se mira: se está acabando
     * y hay que decidir si se sigue ahí o se cambia.
     */
    if (minutos < 1) return "acaba ya";
    return minutos < 60 ? `quedan ${minutos} min` : `quedan ${Math.floor(minutos / 60)} h ${minutos % 60} min`;
  };

  const avance = avanceDe(guiaMirada);
  const queda = quedaDe(guiaMirada);

  /*
   * Lo que empieza ahora, que es la pregunta con la que se enciende la tele.
   *
   * No «qué canales hay» —eso ya está en la columna de la izquierda— sino
   * «¿qué hago esta noche?»: lo que arranca en la próxima hora y media, en
   * orden de reloj y con su canal al lado. Es un dato que ya tenemos y que no
   * se estaba usando: la guía de cada canal trae qué dan ahora, qué viene
   * después y a qué hora termina lo de ahora, que es exactamente la hora a la
   * que empieza lo siguiente.
   *
   * Aquí estuvo una fila de carpetas, y sobraba: para cambiar de carpeta ya
   * está el índice de abajo a la izquierda, y gastar la mejor fila de la
   * pantalla en repetir una navegación es gastarla en nada.
   */
  const VENTANA_GUIA = 90 * 60 * 1000;
  /*
   * De qué canales hablan las dos filas de la derecha.
   *
   * De los de la carpeta en la que estés —y, si todavía no has entrado en
   * ninguna, de los de la que tengas debajo del foco. Salían de todo el
   * catálogo, así que con «M+ CINE» señalado en la columna, abajo aparecían
   * programas de Antena 3: dos mitades de la misma pantalla hablando de cosas
   * distintas. Ahora recorrer carpetas cuenta de qué va cada una: qué echan y
   * cuáles son sus canales, sin entrar.
   */
  const canalesDeLaVista = carpetaAbierta
    ? filas
    : enCarpetas
      ? canalesVista[foco]?.hijos || []
      : canales;
  /* Y de cuál, para poder decirlo en el rótulo: el nombre de la carpeta lleva
     detrás cuántos canales tiene, y ahí sobra */
  const nombreDeLaVista = carpetaAbierta
    ? carpetaAbierta
    : enCarpetas
      ? (canalesVista[foco]?.nombre || "").replace(/\s*\(\d+\)\s*$/, "").trim()
      : "";
  const filaGuia = useMemo(() => {
    const cuando = ahoraMismo;
    const items = canalesDeLaVista
      .map((c) => {
        const g = c.epgId ? epgAhora[c.epgId] : undefined;
        if (!g?.luego || !g.hasta) return null;
        return { ...c, id: `luego-${c.id}`, empieza: g.hasta, programa: g.luego, canal: c.nombre };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x))
      .filter((x) => x.empieza > cuando && x.empieza - cuando <= VENTANA_GUIA)
      .sort((a, b) => a.empieza - b.empieza)
      .slice(0, 14);
    return { titulo: "Empieza ahora", chips: false, carpetas: false, guia: true, items };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canalesDeLaVista, epgAhora, ahoraMismo]);

  /* Y los destacados, de la carpeta en la que estés: puesto en «Deportes», lo
     que se quiere de un vistazo son los suyos, no los de todo el catálogo */
  const filaDestacados = useMemo(() => {
    const puestos = [...canalesDeLaVista].sort((a, b) => (vistos[b.id] || 0) - (vistos[a.id] || 0));
    return {
      titulo: nombreDeLaVista ? `Destacados de ${nombreDeLaVista}` : "Canales destacados",
      chips: true,
      carpetas: false,
      guia: false,
      items: puestos.slice(0, 14),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canalesDeLaVista, vistos, nombreDeLaVista]);
  /*
   * La parrilla del canal que está bajo el foco.
   *
   * La lista pide dos títulos por canal —lo que dan y lo siguiente— porque
   * pedir más para noventa canales es castigar al panel del proveedor para
   * enseñar algo que no cabe en la fila. Pero del canal que estás mirando sí
   * interesa la tarde entera, y eso es una sola petición: la que llena la
   * columna de la derecha, que hasta ahora enseñaba cuatro datos y dejaba
   * medio televisor en negro.
   */
  const [parrilla, setParrilla] = useState<Programa[]>([]);
  const canalDeLaParrilla = enDirecto ? canalMirado?.epgId : undefined;
  useEffect(() => {
    setParrilla([]);
    if (!canalDeLaParrilla || !creds || lista?.tipo !== "xtream") return;
    let vivo = true;
    /* Con el mando se pasa por diez canales en dos segundos: sin esta espera
       se dispararían diez peticiones y llegaría la del canal por el que
       pasaste, no la del que te has quedado */
    const espera = setTimeout(async () => {
      try {
        const res = await xtreamApi<{
          epg_listings?: {
            title?: string;
            start?: string;
            end?: string;
            start_timestamp?: string | number;
            stop_timestamp?: string | number;
          }[];
        }>(creds, "get_short_epg", { stream_id: canalDeLaParrilla, limit: "10" });
        if (!vivo) return;
        const cuando = Date.now();
        const todos = (res.epg_listings || [])
          .map((e) => ({
            titulo: decodeBase64Maybe(e.title) || "",
            desde: momento(e.start_timestamp ?? e.start),
            hasta: momento(e.stop_timestamp ?? e.end),
          }))
          .filter((e) => e.titulo);
        /* Lo que ya ha terminado no es parrilla, es historia: algunos paneles
           empiezan el listado en el bloque de la hora anterior */
        setParrilla(todos.filter((e) => !e.hasta || e.hasta > cuando));
      } catch {
        if (vivo) setParrilla([]);
      }
    }, 400);
    return () => {
      vivo = false;
      clearTimeout(espera);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canalDeLaParrilla, lista]);

  // Cuántas carátulas ha puesto el navegador por fila, para que baje una fila
  /*
   * Se mide siempre, no solo con carátulas.
   *
   * Antes solo la rejilla de cine podía tener más de una columna, así que
   * fuera de ella se daba por hecho que había una. Ahora las carpetas
   * también van en dos, y la medida vale igual para las dos: se cuentan las
   * celdas que comparten la misma altura, que en una lista en columna es
   * siempre una.
   */
  useEffect(() => {
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
  }, [rejilla, filas, soloCarpetas]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // En un input (el emparejado no tiene, pero por si acaso) manda el input
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      conElMando.current = true;
      /* Se ha tocado el mando: aunque el ratón esté aparcado fuera, el aro
         vuelve a pintarse donde quedó */
      setRatonFuera(false);

      const tecla = normalizarTecla(e);

      if (tecla === "Atras") {
        e.preventDefault();
        /* De «¿quién está viendo?» no se sale hacia atrás: no hay nada
           detrás, y salir dejaría la aplicación sin saber de quién es */
        if (pantalla === "perfiles") return;
        /* Estando en el carril, ATRÁS es salir del carril y no de la
           pantalla: si no, entrar sin querer costaba volver a cargarlo todo */
        if (focoCarrilRef.current !== null) setFocoCarril(null);
        else atras();
        return;
      }
      if (pantalla === "viendo") return;

      /*
       * La ficha se recorre por zonas y no como una columna: el botón de
       * arriba, la fila de temporadas y la lista de episodios. Arriba y
       * abajo saltan de zona; las flechas de lado cambian de temporada, que
       * es lo único que va en horizontal.
       */
      if (pantalla === "ficha" && ficha) {
        const temporadas = ficha.temporadas;
        const eps = ficha.episodios[temporadas[fichaTemp]] || [];
        const esSerie = temporadas.length > 0;
        const enBotones =
          fichaZona === "boton" || fichaZona === "guardar" || fichaZona === "bajar";
        if (tecla === "Abajo") {
          e.preventDefault();
          if (enBotones && esSerie) setFichaZona("temporadas");
          else if (fichaZona === "temporadas") { setFichaZona("episodios"); setFichaEp(0); }
          return;
        }
        if (tecla === "Arriba") {
          e.preventDefault();
          /* Los episodios van en fila: arriba sale de la fila entera, no
             sube de uno en uno como cuando eran una columna */
          if (fichaZona === "episodios") setFichaZona("temporadas");
          else if (fichaZona === "temporadas") setFichaZona("boton");
          return;
        }
        if (tecla === "Izquierda" || tecla === "Derecha") {
          e.preventDefault();
          const salto = tecla === "Derecha" ? 1 : -1;
          /* Los dos botones están uno al lado del otro, así que entre ellos
             se pasa de lado, como se ven */
          if (fichaZona === "boton" && salto > 0) setFichaZona("guardar");
          else if (fichaZona === "guardar" && salto < 0) setFichaZona("boton");
          else if (fichaZona === "guardar" && salto > 0 && conDescargas && bajable)
            setFichaZona("bajar");
          else if (fichaZona === "bajar" && salto < 0) setFichaZona("guardar");
          else if (fichaZona === "temporadas") {
            const n = Math.max(0, Math.min(temporadas.length - 1, fichaTemp + salto));
            setFichaTemp(n);
            setFichaEp(0);
          } else if (fichaZona === "episodios") {
            setFichaEp((i) => Math.max(0, Math.min(eps.length - 1, i + salto)));
          }
          return;
        }
        if (tecla === "Ok") {
          e.preventDefault();
          if (fichaZona === "episodios") eps[fichaEp]?.abrir();
          else if (fichaZona === "guardar") setMiLista(alternarEnMiLista(ficha.id));
          else if (fichaZona === "bajar") void bajarEsto();
          else ficha.reproducir();
          return;
        }
        return;
      }

      /* ¿Quién está viendo?: una fila, y de ella no se sale sin elegir. No
         hay ATRÁS que valga —no hay a dónde volver— y por eso tampoco se
         enseña ninguna salida */
      if (pantalla === "perfiles") {
        /* Mientras se escribe el nombre manda el teclado, no el mando */
        if (creandoPerfil) return;
        const cuantos = perfiles.length + (cabenMas ? 1 : 0);
        if (tecla === "Izquierda" || tecla === "Derecha") {
          e.preventDefault();
          setFoco((f) => {
            const n = f + (tecla === "Derecha" ? 1 : -1);
            return (n + cuantos) % cuantos;
          });
          return;
        }
        if (tecla === "Ok") {
          e.preventDefault();
          if (foco === perfiles.length && cabenMas) { setCreandoPerfil(true); return; }
          const suyo = perfiles[foco];
          if (suyo) void elegirPerfil(suyo);
          return;
        }
        return;
      }

      /* La barra de arriba: mientras el foco está en ella se mueve por sus
         secciones y nada de lo que hay debajo se entera. Se recorre de lado
         porque de lado está pintada, y se sale con ▼, que es por donde se
         ha entrado */
      if (focoCarrilRef.current !== null) {
        if (tecla === "Izquierda" || tecla === "Derecha") {
          e.preventDefault();
          setFocoCarril((f) => {
            const n = (f ?? 0) + (tecla === "Derecha" ? 1 : -1);
            return (n + carril.length) % carril.length;
          });
        } else if (tecla === "Abajo") {
          e.preventDefault();
          setFocoCarril(null);
        } else if (tecla === "Ok") {
          e.preventDefault();
          const destino = carril[focoCarrilRef.current]?.id;
          setFocoCarril(null);
          elegirDestino(destino);
        }
        return;
      }

      /*
       * Las descargas: una columna de fichas, y dos cosas que hacer en cada
       * una.
       *
       * Verla es lo normal y va primero; quitarla del aparato está a su
       * derecha, en la misma fila, porque es lo otro que se hace aquí y
       * esconderlo en un menú de ajustes es lo que hace que un disco se
       * llene y no se vacíe nunca.
       */
      if (enDescargas) {
        const total = descargas.length;
        if (tecla === "Izquierda") {
          e.preventDefault();
          /* Desde la papelera, ◀ vuelve a la ficha; en la ficha ya no hay
             nada más a la izquierda */
          if (descargaCol > 0) setDescargaCol(0);
          return;
        }
        if (tecla === "Arriba" && (!total || foco === 0)) {
          /* Arriba del todo, ▲ sube a la barra de secciones: es donde está */
          e.preventDefault();
          setFocoCarril(Math.max(0, carril.findIndex((d) => d.id === "descargas")));
          return;
        }
        if (!total) return;
        if (tecla === "Derecha") {
          e.preventDefault();
          setDescargaCol(1);
          return;
        }
        if (tecla === "Abajo" || tecla === "Arriba") {
          e.preventDefault();
          const salto = tecla === "Abajo" ? 1 : -1;
          setFoco((f) => Math.max(0, Math.min(total - 1, f + salto)));
          return;
        }
        if (tecla === "Ok") {
          e.preventDefault();
          const d = descargas[foco];
          if (!d) return;
          if (descargaCol === 1) {
            quitarDescarga(d.id);
            setDescargas(leerDescargas());
            setFoco((f) => Math.max(0, Math.min(descargas.length - 2, f)));
          } else if (d.estado === "lista" && d.url) {
            reproducir({ url: d.url, name: d.nombre, kind: "video" });
          }
          return;
        }
        return;
      }

      /*
       * El directo: dos mitades, y el mando pasa de una a otra de lado.
       *
       * A la izquierda la lista de canales, que se recorre de arriba abajo
       * como cualquier guía de televisión. A la derecha lo que dan, que se
       * recorre por filas como la portada de cine. ▶ pegado al borde de la
       * lista pasa a la derecha y ◀ pegado al borde de una fila vuelve a la
       * lista: es lo que se espera de dos columnas puestas una al lado de la
       * otra, y no hay que aprenderse nada nuevo.
       */
      if (dirEnPortada) {
        const dirFilas = [filaGuia, filaDestacados].filter((f) => f.items.length > 1);
        /* La última posición de la columna es «ver todos los canales»: está
           debajo de la lista, así que se llega bajando */
        const ultimoIzq = canalesVista.length;
        /* Y la última de cada fila es su «ver todos», por lo mismo pero de
           lado */
        const anchoDe = (f: number) => (dirFilas[f]?.items.length ?? 0) + 1;

        if (zonaDir === "canales") {
          if (tecla === "Arriba") {
            e.preventDefault();
            if (foco === 0) setFocoCarril(Math.max(0, carril.findIndex((d) => d.id === "directo")));
            else setFoco((f) => Math.max(0, f - 1));
            return;
          }
          if (tecla === "Abajo") {
            e.preventDefault();
            setFoco((f) => Math.min(ultimoIzq, f + 1));
            return;
          }
          if (tecla === "PaginaAbajo" || tecla === "PaginaArriba") {
            e.preventDefault();
            const salto = tecla === "PaginaAbajo" ? 8 : -8;
            setFoco((f) => Math.max(0, Math.min(ultimoIzq, f + salto)));
            return;
          }
          if (tecla === "Derecha") {
            e.preventDefault();
            setZonaDir("derecha");
            setFocoFila(-1);
            setFocoCol(0);
            return;
          }
          if (tecla === "Ok") {
            e.preventDefault();
            if (foco === ultimoIzq) {
              if (carpetaAbierta) quitarCarpeta();
              else verCarpetas();
            } else {
              const cual = canalesVista[foco];
              cual?.abrir();
              /* Al entrar en una carpeta, el foco arriba del todo: lo que se
                 va a hacer es recorrer sus canales desde el principio */
              if (cual?.carpeta) setFoco(0);
            }
            return;
          }
          return;
        }

        // Y en la derecha, por filas
        if (tecla === "Arriba") {
          e.preventDefault();
          if (focoFila <= -1) setFocoCarril(Math.max(0, carril.findIndex((d) => d.id === "directo")));
          else {
            const nueva = focoFila - 1;
            setFocoFila(nueva);
            if (nueva >= 0) setFocoCol((c) => Math.min(c, anchoDe(nueva) - 1));
          }
          return;
        }
        if (tecla === "Abajo") {
          e.preventDefault();
          const nueva = Math.min(dirFilas.length - 1, focoFila + 1);
          setFocoFila(nueva);
          if (nueva >= 0) setFocoCol((c) => Math.min(c, anchoDe(nueva) - 1));
          return;
        }
        if (tecla === "Derecha") {
          e.preventDefault();
          if (focoFila >= 0) setFocoCol((c) => Math.min(anchoDe(focoFila) - 1, c + 1));
          return;
        }
        if (tecla === "Izquierda") {
          e.preventDefault();
          /* Pegado al borde de la fila —y en la cabecera, que no tiene
             columnas— se vuelve a la lista de canales */
          if (focoFila >= 0 && focoCol > 0) setFocoCol((c) => c - 1);
          else setZonaDir("canales");
          return;
        }
        if (tecla === "Ok") {
          e.preventDefault();
          if (focoFila === -1) canalMirado?.abrir();
          else {
            const f = dirFilas[focoFila];
            if (!f) return;
            if (focoCol >= f.items.length) verCarpetas();
            else {
              f.items[focoCol]?.abrir();
              /* Al elegir carpeta, el foco baja a los canales: es lo que se
                 va a hacer justo después, y dejarlo arriba obliga a un ◀ y
                 un ▲ para volver a la lista que se acaba de pedir */
              if (f.carpetas) { setZonaDir("canales"); setFoco(0); }
            }
          }
          return;
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
        const ultima = filasConLista.length; // la de «ver todas las carpetas»
        const primera = destacado ? -1 : 0;
        const anchoDe = (fi: number) => filasConLista[fi]?.items.length ?? 1;

        if (tecla === "Arriba" && focoFila === primera) {
          /* Ya en lo más alto de la página, ▲ sube a la barra de secciones */
          e.preventDefault();
          setFocoCarril(Math.max(0, carril.findIndex((d) => d.id === pantalla)));
          return;
        }
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
          if (focoFila >= 0 && focoFila < ultima && focoCol > 0) setFocoCol((c) => c - 1);
          return;
        }
        if (tecla === "Ok") {
          e.preventDefault();
          if (focoFila === -1 && destacado) abrirTitulo(destacado);
          else if (focoFila === ultima) verCarpetas();
          else {
            const t = filasConLista[focoFila]?.items[focoCol];
            if (t) abrirTitulo(t);
          }
          return;
        }
        return;
      }

      /*
       * ▲ en la primera fila entra en la barra de secciones: es donde está,
       * y es lo que hace cualquier aplicación de televisión.
       *
       * Va ANTES de mirar si hay filas. Mientras una sección carga la lista
       * está vacía, y ahí la barra es lo único a lo que se puede llegar:
       * comprobándolo después, ▲ no hacía nada y el ATRÁS siguiente se
       * llevaba por delante la sección entera.
       */
      if (tecla === "Arriba" && pantalla !== "portada" && (!filas.length || foco < Math.max(1, columnas))) {
        e.preventDefault();
        setFocoCarril(Math.max(0, carril.findIndex((d) => d.id === pantalla)));
        return;
      }

      /*
       * La portada de inicio se recorre como la de cine: por filas.
       *
       * La −1 son los accesos a las secciones —con «Salir» de última columna,
       * que es donde está—, la −2 es «seguir viendo», y de la 0 para abajo el
       * contenido. Es el mismo recorrido que en cine y series, así que el
       * mando se aprende una vez y vale para toda la aplicación.
       */
      if (pantalla === "portada") {
        const accesos = destinos.filter((d) => d.id !== "salir");
        const ultimaFila = filasInicioALaVista.length - 1;
        const primeraFila = ultimo ? -2 : -1;
        const anchoDeFila = (f: number) =>
          f === -1 ? accesos.length + 1 : f === -2 ? 1 : filasInicioALaVista[f]?.items.length ?? 1;

        if (tecla === "Arriba" || tecla === "Abajo") {
          e.preventDefault();
          const salto = tecla === "Abajo" ? 1 : -1;
          /* La −2 va DEBAJO de la −1 en pantalla, así que bajar de los accesos
             lleva a «seguir viendo» y no al revés: el orden de los números no
             es el orden de la pantalla y aquí manda la pantalla */
          const orden = ultimo
            ? [-1, -2, ...filasInicioALaVista.map((_, i) => i)]
            : [-1, ...filasInicioALaVista.map((_, i) => i)];
          const donde = Math.max(0, Math.min(orden.length - 1, orden.indexOf(focoFila) + salto));
          const nueva = orden[donde] ?? -1;
          setFocoFila(nueva);
          setFocoCol((c) => Math.min(c, anchoDeFila(nueva) - 1));
          return;
        }
        if (tecla === "Derecha" || tecla === "Izquierda") {
          e.preventDefault();
          const salto = tecla === "Derecha" ? 1 : -1;
          setFocoCol((c) => Math.max(0, Math.min(anchoDeFila(focoFila) - 1, c + salto)));
          return;
        }
        if (tecla === "Ok") {
          e.preventDefault();
          if (focoFila === -2 && ultimo) reproducir(ultimo.source);
          else if (focoFila === -1) {
            elegirDestino(focoCol >= accesos.length ? "salir" : accesos[focoCol]?.id);
          } else {
            const t = filasInicioALaVista[focoFila]?.items[focoCol];
            if (t) abrirTitulo(t);
          }
          return;
        }
        /* Y con nada elegido todavía, la primera pulsación cae en los accesos */
        if (focoFila < primeraFila) setFocoFila(-1);
        return;
      }

      const total = filas.length;
      if (!total) return;
      const primero = 0;

      /* En una lista todo es una columna y da igual la flecha; en la rejilla
         de carátulas, arriba y abajo saltan una fila entera, que es lo que
         espera cualquiera que haya usado el mando de una tele */
      const cols = columnas;
      const salto = cols > 1 ? cols * 3 : 8;
      const siguiente = (f: number) => (f + 1 > total - 1 ? primero : f + 1);
      const anterior = (f: number) => (f - 1 < primero ? total - 1 : f - 1);

      if (tecla === "Derecha") {
        e.preventDefault();
        setFoco(siguiente);
      } else if (tecla === "Izquierda") {
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
        filas[foco]?.abrir();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pantalla, filas, foco, ultimo, reproducir, columnas, focoCarril, enPortada, filasConLista, destacado, focoFila, focoCol, dirEnPortada, zonaDir, canalesVista, filaGuia, filaDestacados, canalMirado, filasInicioALaVista, perfiles, elegirPerfil, cabenMas, creandoPerfil]);

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
  }, [enPortada, focoFila, focoCol, filasConLista.length]);

  /* Sin banner —ningún título del catálogo trae carátula que cargue— la
     fila −1 no existe y el foco se quedaría en un sitio que no se ve */
  useEffect(() => {
    if (enPortada && !destacado && focoFila === -1) setFocoFila(0);
  }, [enPortada, destacado, focoFila]);

  /*
   * Los perfiles, en cuanto hay sesión.
   *
   * Se piden una vez y no se vuelve a preguntar: la lista de quién vive en
   * esta casa no cambia mientras estás viendo la tele. Si sale uno solo —o
   * ninguno, que es lo que pasa con una lista puesta a pelo por MAC y sin
   * cuenta detrás— esta pantalla no llega a existir.
   */
  useEffect(() => {
    if (sesion !== "dentro" || perfilesPedidos) return;
    setPerfilesPedidos(true);
    (async () => {
      try {
        const r = await fetch("/api/profiles", { cache: "no-store" });
        if (!r.ok) return;
        const d = (await r.json()) as {
          profiles?: Perfil[];
          activeId?: number | null;
          canAddMore?: boolean;
        };
        const suyos = Array.isArray(d.profiles) ? d.profiles : [];
        setPerfiles(suyos);
        setCabenMas(Boolean(d.canAddMore));
        if (suyos.length) setPerfil(suyos.find((p) => p.id === d.activeId) || suyos[0]);
        /*
         * Se pregunta si hay más de uno, o si todavía cabe otro.
         *
         * Lo segundo hacía falta: el tope viene puesto a uno de fábrica, así
         * que a casi nadie le salía nunca esta pantalla —ni la forma de crear
         * el segundo perfil, que solo está aquí—. Con hueco para más, se
         * enseña aunque de momento haya uno: es donde se crean.
         *
         * Con el tope en uno de verdad no aparece, y es lo correcto:
         * preguntar «¿quién eres?» cuando solo puede haber uno es un paso de
         * más para no elegir nada.
         */
        if (suyos.length > 1 || (d.canAddMore && suyos.length >= 1)) {
          setPantalla("perfiles");
          setFoco(Math.max(0, suyos.findIndex((p) => p.id === d.activeId)));
        }
      } catch {
        /* Sin perfiles se ve la tele igual: no es una puerta, es una comodidad */
      }
    })();
  }, [sesion, perfilesPedidos]);

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
          <Cargando texto="Encendiendo…" />
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
  /* Solo en la aplicación de Windows: en una tele, decir «Alt+F4» sobra y
     encima confunde, que ahí no hay teclado */
  const enWindows = typeof navigator !== "undefined" && /Windows/i.test(navigator.userAgent);

  if (sesion === "sin-sesion" || caducado) {
    if (haciendoLogin) {
      return (
        <div className="tv-app tv-centro tv-lienzo" style={fondoMarca ? { backgroundImage: `url(${JSON.stringify(fondoMarca).slice(1, -1)})` } : undefined}>
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
        <div className="tv-app tv-centro tv-lienzo" style={fondoMarca ? { backgroundImage: `url(${JSON.stringify(fondoMarca).slice(1, -1)})` } : undefined}>
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
      <div className="tv-app tv-centro tv-lienzo" style={fondoMarca ? { backgroundImage: `url(${JSON.stringify(fondoMarca).slice(1, -1)})` } : undefined}>
        <div className="tv-activar">
          <div className="tv-marca">
            {/* El logotipo del proveedor si lo tiene; el nuestro solo cuando
                la marca es la nuestra. Ver `SesionGuardada.logo` */}
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="tv-marca-logo" src={imgSrc(logo) || logo} alt="" />
            ) : marca === "TOTALplayer" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="tv-marca-logo" src="/icono-192.png" alt="" />
            ) : null}
            <span>{marca}</span>
          </div>

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
              que se vean como dos opciones y no como una principal y un resto.
              El número va en su círculo y no como «1 ·» en el rótulo: a tres
              metros, un punto y una cifra pequeña no se leen como un paso */}
          <div className="tv-dos-caminos">
            <div className="tv-camino">
              <p className="tv-camino-t">
                <span className="tv-camino-n">1</span>
                Con tu proveedor
              </p>
              <p className="tv-camino-txt">Pásale esta MAC y te activa la tele:</p>
              <p className="tv-camino-txt tv-camino-nota">Es el número con el que tu proveedor reconoce este aparato.</p>
              <div className="tv-dato">{macDelAparato()}</div>
            </div>
            <div className="tv-camino">
              <p className="tv-camino-t">
                <span className="tv-camino-n">2</span>
                Tú mismo, desde el móvil
              </p>
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

          {/*
            Cómo se sale, escrito.

            En un televisor no hace falta: se pulsa el botón de inicio del
            mando y ya. En Windows sí, y por dos motivos: las versiones
            antiguas de la aplicación abrían a pantalla completa y sin marco
            —sin aspa, sin barra de tareas, sin menú—, y aunque a partir de
            ahora la ventana lleva su marco, quien tenga instalada una de
            aquellas necesita saber que la salida es Alt+F4.
          */}
          {enWindows && (
            <p className="tv-activar-nota tv-salida">
              Para cerrar la aplicación, el aspa de la ventana o <b>Alt + F4</b>.
              Con <b>F11</b> se pasa a pantalla completa y se vuelve.
            </p>
          )}
        </div>
      </div>
    );
  }

  /*
   * La ficha: de qué va esto, antes de ponerlo.
   *
   * El fondo apaisado ocupa la pantalla entera y el texto va encima, sobre
   * un velo que baja de la izquierda. Es la forma que tienen todas las
   * aplicaciones de televisión de enseñar un título, y no por copiarse: a
   * tres metros, una columna de datos sobre fondo liso obliga a leer, y una
   * imagen grande con cuatro líneas encima se entiende de un vistazo.
   *
   * Cuando no hay fondo apaisado —que es lo normal en un panel IPTV, donde
   * solo viene la carátula vertical— se usa la propia carátula difuminada
   * detrás y entera a un lado. Estirar una imagen vertical a lo ancho de una
   * tele da una mancha de píxeles, y eso se lee como que la aplicación está
   * rota, no como que falta una imagen.
   */
  if (pantalla === "ficha" && ficha) {
    const eps = ficha.episodios[ficha.temporadas[fichaTemp]] || [];
    const esSerie = ficha.temporadas.length > 0;
    const enMiLista = miLista.includes(ficha.id);
    return (
      <div className={`tv-app tv-ficha ${esSerie ? "con-episodios" : ""}`}>
        {ficha.fondo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="tv-ficha-fondo" src={ficha.fondo} alt="" onError={() => marcarRota(ficha.fondo)} />
        ) : (
          ficha.cartel && (
            <>
              {/*
                Sin fondo apaisado, el cartel hace las dos cosas.
                Difuminado detrás pone el color, y entero a la derecha pone
                la imagen. Con solo lo primero —que es como se quedó al
                rehacer esta pantalla— la ficha era una mancha de color sin
                forma y un texto en la esquina: parecía que no había cargado
                nada. Y esto no es el caso raro, es el normal: un panel
                Xtream manda carátulas verticales y el fondo apaisado solo
                aparece cuando TMDB reconoce el título.
              */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="tv-ficha-mancha" src={ficha.cartel} alt="" aria-hidden="true" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="tv-ficha-arte"
                src={ficha.cartel}
                alt=""
                onError={(e) => ((e.target as HTMLImageElement).style.visibility = "hidden")}
              />
            </>
          )
        )}
        <span className="tv-ficha-velo" aria-hidden="true" />

        <div className="tv-ficha-cuerpo">
          {/*
            El texto a la izquierda, sobre el velo, y la imagen respirando a
            la derecha. El cartel vertical que había aquí en su propia caja
            competía con el fondo —dos veces la misma imagen, una grande y
            otra pequeña— y comía el ancho que ahora usa la sinopsis.
          */}
          <div className="tv-ficha-txt">
            {/* De dónde vienes. Sin esto la ficha aparece flotando y no se
                sabe si se llegó de una fila, de una carpeta o de una búsqueda */}
            <p className="tv-ficha-camino">
              {TITULOS[ficha.volverA]}
              {ficha.categoria && (
                <>
                  <span className="tv-ficha-camino-sep">›</span>
                  {ficha.categoria}
                </>
              )}
            </p>
            <h2 className="tv-ficha-t">{ficha.nombre}</h2>

            {/*
              La ficha técnica en cajas, y no en una línea con puntos.
              Con «2026 · ★ 7.5 · Suspense, Drama» todo pesa igual y no se
              distingue el año de la nota ni del género. Cada dato en su
              caja se lee de un vistazo y, sobre todo, el que no venga
              simplemente no está: nada de huecos ni de ceros inventados.
            */}
            <p className="tv-ficha-fila-datos">
              {ficha.anio && <span className="tv-ficha-dato">{ficha.anio}</span>}
              {esSerie && (
                <span className="tv-ficha-dato">
                  {ficha.temporadas.length} {ficha.temporadas.length === 1 ? "temporada" : "temporadas"}
                </span>
              )}
              {ficha.duracion && <span className="tv-ficha-dato">{ficha.duracion}</span>}
              {ficha.nota && (
                <span className="tv-ficha-nota">
                  <Icon name="star" size={18} />
                  {ficha.nota.replace(".", ",")}
                  {/* Cuánta gente la ha votado. Un 9,4 con doce votos y un
                      8,1 con doce mil no dicen lo mismo; sin el número, la
                      nota sola invita a fiarse de cualquiera de los dos */}
                  {ficha.votos > 0 && (
                    <small>según {ficha.votos.toLocaleString("es-ES")} valoraciones</small>
                  )}
                </span>
              )}
            </p>

            {ficha.sinopsis && <p className="tv-ficha-sinopsis">{ficha.sinopsis}</p>}
            {/*
              Y aquí la acción, justo después de saber de qué va.
              Estaba debajo de los créditos, o sea que para darle a
              reproducir había que pasar la vista por el reparto entero. Lo
              que se hace en esta pantalla es ponerlo; el reparto y la
              dirección se leen si acaso, y por eso van al final.
            */}
            <div className="tv-ficha-acciones" onMouseLeave={ratonSeVa}>
              <button
                className={`tv-ficha-ver ${foc(fichaZona === "boton")}`}
                onMouseEnter={() => { conElRaton(); setFichaZona("boton"); }}
                onClick={() => ficha.reproducir()}
              >
                <Icon name="play" size={26} />
                {esSerie ? "Ver el primer episodio" : "Reproducir"}
              </button>
              {/*
                Guardar para luego.
                Un catálogo de miles de títulos se recorre una vez y lo que
                te llamó la atención se pierde: sin un sitio donde dejarlo,
                la única forma de volver a encontrarlo es acordarse del
                nombre exacto y buscarlo.
              */}
              <button
                className={`tv-ficha-guardar ${foc(fichaZona === "guardar")} ${
                  enMiLista ? "puesto" : ""
                }`}
                onMouseEnter={() => { conElRaton(); setFichaZona("guardar"); }}
                onClick={() => setMiLista(alternarEnMiLista(ficha.id))}
              >
                <Icon name={enMiLista ? "check" : "plus"} size={22} />
                {enMiLista ? "En mi lista" : "Mi lista"}
              </button>
              {/*
                Y guardarlo en el aparato, donde se pueda.
                En un navegador este botón no existe: lo que hay ahí es
                almacenamiento del sitio, que el navegador borra cuando le
                hace falta espacio, y prometer «lo tienes guardado» para que
                desaparezca solo es peor que no ofrecerlo.
              */}
              {conDescargas && bajable && (
                <button
                  className={`tv-ficha-guardar ${foc(fichaZona === "bajar")} ${
                    yaBajado?.estado === "lista" ? "puesto" : ""
                  }`}
                  onMouseEnter={() => { conElRaton(); setFichaZona("bajar"); }}
                  onClick={bajarEsto}
                >
                  <Icon
                    name={yaBajado?.estado === "lista" ? "papelera" : "bajar"}
                    size={22}
                  />
                  {preparando === bajable.id
                    ? "Preparando…"
                    : yaBajado?.estado === "lista"
                      ? "Quitar del aparato"
                      : yaBajado?.estado === "bajando"
                        ? `Bajando ${comoVa(yaBajado.parte, yaBajado.bytes)}`
                        : esSerie
                          ? "Descargar episodio"
                          : "Descargar"}
                </button>
              )}
            </div>
            {/*
              Y si el programa es de antes de que esto existiera, se dice —en
              una línea y en pequeño, debajo.

              Callarse es indistinguible de «esto no se puede hacer», y no es
              eso: el puente va compilado dentro del programa y esa versión no
              lo trae. Pero tampoco es una acción: no hay nada que pulsar, así
              que puesto del tamaño de un botón y en la misma fila competía
              con «Reproducir» por el mismo sitio y con la misma voz.
            */}
            {programaViejo && bajable && (
              <p className="tv-ficha-viejo">
                Para descargar, actualiza el programa desde tu web
              </p>
            )}

            {/*
              El reparto con la cara de cada uno, y si TMDB no conoce el
              título, los nombres del panel en una línea como hasta ahora.
              Una lista de nombres se lee como una ficha técnica: no dice
              nada hasta que reconoces uno, y para reconocerlo hay que
              leerlos todos. Desde el sofá, eso es no leerlo.
            */}
            {repartoTmdb.length > 0 ? (
              <div className="tv-ficha-reparto">
                <p className="tv-ficha-reparto-t">Reparto</p>
                <ul className="tv-ficha-caras">
                  {repartoTmdb.map((a) => (
                    <li key={`${a.nombre}-${a.personaje}`}>
                      <span className="tv-ficha-cara">
                        {a.foto ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={a.foto} alt="" loading="lazy" />
                        ) : (
                          /* Sin retrato, sus iniciales: un círculo vacío en
                             medio de una fila de caras se lee como una
                             imagen que no ha cargado */
                          <span className="tv-ficha-cara-ph">
                            {a.nombre
                              .split(/\s+/)
                              .slice(0, 2)
                              .map((x: string) => x[0])
                              .join("")
                              .toUpperCase()}
                          </span>
                        )}
                      </span>
                      <span className="tv-ficha-cara-n">{a.nombre}</span>
                      {a.personaje && <span className="tv-ficha-cara-pj">{a.personaje}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              ficha.reparto && (
                <p className="tv-ficha-credito">
                  <span>Reparto</span> <b>{ficha.reparto}</b>
                </p>
              )
            )}
            {ficha.direccion && (
              <p className="tv-ficha-credito">
                <span>Dirección</span> <b>{ficha.direccion}</b>
              </p>
            )}
            {ficha.genero && (
              <p className="tv-ficha-credito">
                <span>Género</span> <b>{ficha.genero}</b>
              </p>
            )}
          </div>

          {esSerie && (
            <div className="tv-ficha-serie">
              {/* Las temporadas, en fila. Con siete temporadas en una lista
                  plana, llegar a la última costaba doscientas pulsaciones */}
              <div className="tv-ficha-temporadas" onMouseLeave={ratonSeVa}>
                {ficha.temporadas.map((t, i) => (
                  <button
                    key={t}
                    className={`tv-ficha-temporada ${i === fichaTemp ? "activa" : ""} ${
                      foc(fichaZona === "temporadas" && i === fichaTemp)
                    }`}
                    onMouseEnter={() => { conElRaton(); setFichaZona("temporadas"); setFichaTemp(i); setFichaEp(0); }}
                    onClick={() => { setFichaTemp(i); setFichaEp(0); }}
                  >
                    Temporada {t}
                  </button>
                ))}
              </div>

              {/*
                Los episodios se miran, no se leen.
                Eran una columna de títulos —«1 Piloto», «2 Segundo»— y de un
                título no se decide nada. Con su fotograma, cuánto dura y una
                línea de qué pasa, se elige de un vistazo; y en fila, porque
                una tele es ancha y así caben cinco sin tapar la ficha.
              */}
              <div className="tv-ficha-episodios" ref={listaRef} onMouseLeave={ratonSeVa}>
                {eps.map((ep, i) => (
                  <button
                    key={ep.id}
                    data-i={i}
                    className={`tv-ficha-ep ${foc(fichaZona === "episodios" && i === fichaEp)}`}
                    onMouseEnter={() => { conElRaton(); setFichaZona("episodios"); setFichaEp(i); }}
                    onClick={ep.abrir}
                  >
                    <span className="tv-ficha-ep-foto">
                      {ep.imagen ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={ep.imagen} alt="" loading="lazy" onError={(e) => ((e.target as HTMLImageElement).style.visibility = "hidden")} />
                      ) : (
                        /* Sin fotograma, el número en grande: un hueco gris
                           parece un fallo, y esto se lee como una decisión */
                        <span className="tv-ficha-ep-n">{ep.numero}</span>
                      )}
                      {ep.duracion && <span className="tv-ficha-ep-min">{ep.duracion}</span>}
                    </span>
                    <span className="tv-ficha-ep-cab">
                      T{ficha.temporadas[fichaTemp]}: E{ep.numero}
                    </span>
                    <span className="tv-ficha-ep-t">{ep.titulo}</span>
                    {ep.sinopsis && <span className="tv-ficha-ep-p">{ep.sinopsis}</span>}
                  </button>
                ))}
              </div>
            </div>
          )}
          {cargando && <Cargando />}
          {error && <p className="tv-activar-error">{error}</p>}
        </div>
        <p className="tv-ficha-pie">Pulsa ATRÁS para volver</p>
      </div>
    );
  }

  if (pantalla === "viendo" && viendo) {
    /* Lo que se está viendo, encima y sin estorbar: en una tele no hay barra
       de título ni pestaña que lo diga, y a los dos minutos ya no te acuerdas
       de en qué canal entraste */
    const guiaDeEsto = viendo.epgId ? epgAhora[viendo.epgId] : undefined;
    const avanceDeEsto = avanceDe(guiaDeEsto);
    const quedaDeEsto = quedaDe(guiaDeEsto);
    return (
      <div className="tv-app tv-viendo">
        <VideoPlayer source={viendo.source} controles={false} />
        {/*
          La guía del canal que suena, no solo su nombre.

          Antes esto era una línea: el nombre y, con suerte, el título de lo
          que estaban dando. Sirve para saber dónde has entrado y para nada
          más. Las dos preguntas que se hacen de verdad viendo la tele son
          «¿cuánto le queda a esto?» y «¿qué ponen después?», y para
          contestarlas había que salir del canal, buscarlo en la lista y
          volver a entrar — cuatro pulsaciones de mando para un dato que
          estaba pedido y guardado desde que se abrió la lista.

          Es la misma guía que se ve al pasar por encima de un canal en la
          lista, con la misma barra y el mismo «Después». Que la información
          cambie de forma según desde dónde se mire obliga a aprenderla dos
          veces.
        */}
        <div className={`tv-viendo-canal ${osd ? "" : "ido"}`}>
          <p className="tv-viendo-fila">
            {/* El punto rojo es «esto se está emitiendo ahora». En una
                película guardada en el disco no significa nada */}
            {viendo.epgId && <span className="tv-punto" aria-hidden="true" />}
            <span className="tv-viendo-nombre">{viendo.source.name}</span>
          </p>
          {guiaDeEsto?.ahora ? (
            <>
              <p className="tv-viendo-prog">
                {guiaDeEsto.ahora}
                {quedaDeEsto ? <span className="tv-viendo-queda">{quedaDeEsto}</span> : null}
              </p>
              {avanceDeEsto !== null && (
                <span className="tv-viendo-barra" aria-hidden="true">
                  <span style={{ width: `${avanceDeEsto}%` }} />
                </span>
              )}
              {guiaDeEsto.luego && <p className="tv-viendo-luego">Después · {guiaDeEsto.luego}</p>}
            </>
          ) : viendo.epgId ? (
            /* Sin guía se dice, y se dice de quién depende: el reproductor no
               la inventa, la manda el panel del proveedor.

               Y solo en un canal. Una película descargada no tiene guía ni
               puede tenerla, así que debajo de su título salía «Tu proveedor
               no manda la guía de este canal» — que además de no venir a
               cuento la llamaba canal. */
            <p className="tv-viendo-prog tv-viendo-singuia">
              Tu proveedor no manda la guía de este canal
            </p>
          ) : null}
        </div>
        <p className={`tv-viendo-pie ${osd ? "" : "ido"}`}>Pulsa ATRÁS para volver</p>
      </div>
    );
  }

  /*
   * ---------- ¿Quién está viendo? ----------
   *
   * La misma pregunta que hace cualquier televisión al encender, y por el
   * mismo motivo: lo que has dejado a medias, lo que tienes en tu lista y lo
   * que te suena de haber visto no es lo mismo para las cuatro personas que
   * comparten el aparato del salón.
   *
   * Solo sale con más de un perfil. A quien vive solo no se le mete un paso
   * de más para contestar algo que ya se sabe.
   */
  if (pantalla === "perfiles") {
    return (
      <div className="tv-app tv-centro tv-lienzo" style={fondoMarca ? { backgroundImage: `url(${JSON.stringify(fondoMarca).slice(1, -1)})` } : undefined}>
        <div className="tv-perfiles">
          <h1>¿Quién está viendo?</h1>
          <div className="tv-perfiles-fila" onMouseLeave={ratonSeVa}>
            {perfiles.map((p, i) => (
              <button
                key={p.id}
                data-i={i}
                className={`tv-perfil ${foc(foco === i)}`}
                data-foco={foco === i ? "1" : undefined}
                onMouseEnter={() => { conElRaton(); setFoco(i); }}
                onClick={() => void elegirPerfil(p)}
              >
                <span
                  className="tv-perfil-cara"
                  style={{ background: COLORES_PERFIL[i % COLORES_PERFIL.length] }}
                >
                  {p.name.trim().slice(0, 1).toUpperCase() || "?"}
                </span>
                <span className="tv-perfil-nombre">{p.name}</span>
                {p.kids && <span className="tv-perfil-nota">Infantil</span>}
              </button>
            ))}
            {/* Y uno más, si el plan del cliente deja. Va al final de la fila
                y con la misma forma que los demás: es una cosa más de las que
                hay aquí, no un ajuste escondido en otro sitio */}
            {cabenMas && (
              <button
                className={`tv-perfil tv-perfil-nuevo ${foc(foco === perfiles.length)}`}
                data-foco={foco === perfiles.length ? "1" : undefined}
                onMouseEnter={() => { conElRaton(); setFoco(perfiles.length); }}
                onClick={() => setCreandoPerfil(true)}
              >
                <span className="tv-perfil-cara">
                  <Icon name="plus" size={44} />
                </span>
                <span className="tv-perfil-nombre">Nuevo perfil</span>
              </button>
            )}
          </div>

          {creandoPerfil && (
            <form className="tv-perfil-form" onSubmit={crearPerfil}>
              <input
                name="perfil"
                autoFocus
                value={nombreNuevo}
                onChange={(ev) => setNombreNuevo(ev.target.value)}
                placeholder="¿Cómo se llama?"
                maxLength={24}
                aria-label="Nombre del perfil"
              />
              <button className="tv-boton" type="submit">Crear</button>
              <button
                className="tv-boton tv-boton-suave"
                type="button"
                onClick={() => { setCreandoPerfil(false); setNombreNuevo(""); }}
              >
                Cancelar
              </button>
            </form>
          )}
          {error && <p className="tv-activar-error">{error}</p>}

          <p className="tv-perfiles-pista">
            Puedes cambiar de perfil cuando quieras, desde la barra de arriba.
          </p>
        </div>
      </div>
    );
  }

  /*
   * La portada de inicio, como el mockup.
   *
   * Arriba la marca; debajo los accesos a las tres secciones en botones
   * grandes —el abierto con su aro de color—; y debajo, lo que hay: una fila
   * en directo, una de series y una de películas.
   *
   * Antes esto era un lanzador: tres tarjetas con el nombre de cada sección y
   * ni un solo título a la vista. Encender la tele y que lo primero sea un
   * menú es hacer elegir antes de haber visto nada.
   *
   * Se recorre igual que la portada de cine: la fila −1 son los accesos y de
   * ahí para abajo el contenido, así que el mando funciona igual en las dos y
   * no hay que aprenderlo dos veces.
   */
  if (pantalla === "portada") {
    const accesos = destinos.filter((d) => d.id !== "salir");
    return (
      <div className="tv-app tv-inicio">
        <header className="tv-inicio-cab">
          <div className="tv-marca">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="tv-marca-logo" src={imgSrc(logo) || logo} alt="" />
            ) : marca === "TOTALplayer" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="tv-marca-logo" src="/icono-192.png" alt="" />
            ) : null}
            <span>{marca}</span>
          </div>
          {/* Salir arriba a la derecha y en fino: es una puerta, no un
              destino, y con los accesos en el centro competía con ellos */}
          <button
            className={`tv-inicio-salir ${foc(focoFila === -1 && focoCol === accesos.length)}`}
            onMouseEnter={() => { conElRaton(); setFocoFila(-1); setFocoCol(accesos.length); }}
            onClick={() => elegirDestino("salir")}
          >
            <Icon name="power" size={20} />
            Salir
          </button>
        </header>

        {sinRed && (
          <p className="tv-sinred" role="status">
            Sin conexión: estás viendo lo de la última vez. Se reintenta solo.
          </p>
        )}

        <div className="tv-pestanas" onMouseLeave={ratonSeVa}>
          {accesos.map((d, i) => (
            <button
              key={d.id}
              className={`tv-pestana ${foc(focoFila === -1 && focoCol === i)}`}
              onMouseEnter={() => { conElRaton(); setFocoFila(-1); setFocoCol(i); }}
              onClick={() => elegirDestino(d.id)}
            >
              <Icon name={d.icono} size={30} />
              {d.titulo}
            </button>
          ))}
        </div>

        {ultimo && (
          <button
            className={`tv-seguir ${foc(focoFila === -2)}`}
            onMouseEnter={() => { conElRaton(); setFocoFila(-2); }}
            onClick={() => reproducir(ultimo.source)}
          >
            <Icon name="play" size={26} />
            <span>
              Seguir viendo
              <b>{ultimo.nombre}</b>
            </span>
          </button>
        )}

        <div className="tv-cuerpo-portada" ref={listaRef}>
          {filasInicioALaVista.map((f, fi) => (
            <section className="tv-carrusel" key={f.titulo}>
              <h3 className="tv-carrusel-t">{f.titulo}</h3>
              <div className="tv-carrusel-tira anchas" onMouseLeave={ratonSeVa}>
                {f.items.map((t0, ci) => {
                  const t = mejor(t0);
                  const puesto = focoFila === fi && focoCol === ci;
                  const guia = t.epgId ? epgAhora[t.epgId] : undefined;
                  return (
                    <button
                      key={t.id}
                      className={`tv-tarjeta ${foc(puesto)}`}
                      data-fila={fi}
                      data-foco={puesto ? "1" : undefined}
                      onMouseEnter={() => { conElRaton(); setFocoFila(fi); setFocoCol(ci); }}
                      onClick={() => abrirTitulo(t)}
                    >
                      <span className="tv-tarjeta-marco">
                        {/*
                          Apaisada siempre, y de verdad.

                          Un panel Xtream manda carátulas verticales y
                          logotipos cuadrados; el apaisado solo existe cuando
                          TMDB reconoce el título, y no reconoce todos.

                          Con fondo de TMDB, el fondo. Sin él y siendo una
                          película o una serie, la carátula RECORTADA a lo
                          ancho —no encogida en medio de un rectángulo, que
                          es lo que hacía y dejaba un cartel pequeño flotando
                          con dos franjas borrosas a los lados—. Se recorta
                          por el centro y algo por encima, que es donde está
                          la cara y no el título impreso al pie.

                          Recortar no es estirar: estirada una vertical a
                          16:9 queda como una mancha de píxeles; recortada se
                          ve como cualquier escaparate de televisión.

                          Un canal es el único caso que sigue yendo centrado:
                          su imagen es un logotipo, y un logotipo recortado
                          deja media letra.
                        */}
                        {t.fondo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img className="tv-tarjeta-ancha" src={t.fondo} alt="" loading="lazy" onError={() => marcarRota(t.fondo || "")} />
                        ) : imgSrc(t.imagen) ? (
                          <>
                            {/*
                              La mancha desenfocada, solo detrás de un
                              logotipo centrado, que es donde queda hueco que
                              rellenar. Detrás de una carátula recortada no se
                              ve —la imagen tapa el marco entero— y costaba
                              cara: un desenfoque de cuarenta píxeles se
                              vuelve a calcular en cada fotograma mientras la
                              tarjeta crece, catorce veces por fila, y eso es
                              lo que hacía que el efecto fuera a tirones.
                            */}
                            {t.epgId && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img className="tv-tarjeta-mancha" src={imgSrc(t.imagen)} alt="" aria-hidden="true" />
                            )}
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              className={t.epgId ? "tv-tarjeta-centro" : "tv-tarjeta-recorte"}
                              src={imgSrc(t.imagen)}
                              alt=""
                              loading="lazy"
                              onError={() => marcarRota(t.imagen)}
                            />
                          </>
                        ) : (
                          <span className="tv-tarjeta-ph">{t.nombre}</span>
                        )}
                        {t.epgId && (
                          <span className="tv-vivo">
                            <span className="tv-punto" aria-hidden="true" />
                            EN VIVO
                          </span>
                        )}
                      </span>
                      <span className="tv-tarjeta-t">{t.nombre}</span>
                      {/* Debajo, lo que distingue una tarjeta de otra: en un
                          canal, qué dan ahora; en un título, año y género */}
                      <span className="tv-tarjeta-sub">
                        {guia?.ahora || datosDe(t) || "\u00a0"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
          {cargando && !filasInicioALaVista.length && <Cargando />}
          {!cargando && !filasInicioALaVista.length && (
            <p className="tv-vacio">
              Elige arriba qué quieres ver.
            </p>
          )}
        </div>

        <p className="tv-pie">
          {caduca ? `Tu acceso vence el ${new Date(caduca).toLocaleDateString("es-ES")}` : "Acceso sin fecha de fin"}
          {soporte ? ` · Soporte: ${soporte}` : ""}
          {" · "}<span className="tv-pie-mac">MAC: {macDelAparato()}</span> · versión{" "}
          {process.env.NEXT_PUBLIC_BUILD || "?"}
        </p>
      </div>
    );
  }


  /*
   * La barra de arriba: la marca, las secciones y la puerta de salida.
   *
   * Antes esto era un carril de iconos pegado al borde izquierdo. Funcionaba,
   * pero se comía ancho justo en el lado por el que empieza a leerse la
   * pantalla, y obligaba a un gesto propio —◀ para entrar en él— que no se
   * parece a nada de lo que hace el resto de la aplicación. Arriba y en
   * horizontal se lee de una pasada, deja la pantalla entera al contenido y
   * se entra con ▲ desde la primera fila, que es hacia donde está.
   *
   * El foco vive en `focoCarril` igual que antes: es «el foco está en el
   * menú, en la posición N», y eso no cambia porque el menú se haya puesto
   * de lado.
   */
  const navItems = carril.filter((d) => d.id !== "salir");
  const iSalir = carril.length - 1;
  const barraNav = (
    <nav
      className={`tv-nav ${navAbierta || focoCarril !== null ? "abierta" : ""}`}
      aria-label="Secciones"
      /*
       * Abrir y cerrar van los dos en la barra, no en cada icono.
       *
       * Puestos en los iconos, al mover el ratón de «Directo» a «Series» el
       * de salida cerraba la barra un instante antes de que el de entrada la
       * volviera a abrir: pasar de una sección a otra era un parpadeo. Y de
       * paso, así el puntero puede estar entre dos iconos o sobre la marca
       * sin que la barra se cierre en la mano.
       */
      onMouseEnter={abrirNav}
      onMouseLeave={() => { setNavAbierta(false); setFocoCarril(null); }}
    >
      <div className="tv-nav-marca">
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="tv-marca-logo" src={imgSrc(logo) || logo} alt="" />
        ) : marca === "TOTALplayer" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="tv-marca-logo" src="/icono-192.png" alt="" />
        ) : null}
        <span>{marca}</span>
      </div>
      {/*
        Y soltar el foco va aquí, en el grupo de iconos, no en cada icono ni
        en la barra entera.

        En cada icono, pasar de «Directo» a «Series» lo apagaba un instante
        antes de que el de al lado lo encendiera: un parpadeo por cada icono
        que cruzabas. Y solo en la barra no bastaba: al mover el ratón de un
        icono a la marca —que también es barra— el foco se quedaba pegado al
        icono, y a partir de ahí las flechas movían el menú en vez de la
        lista, con el mando aparentemente roto. Saliendo del grupo se suelta;
        moviéndose dentro de él, no.
      */}
      <div className="tv-nav-items" onMouseLeave={() => { if (!recolocando.current) setFocoCarril(null); }}>
        {navItems.map((d, i) => (
          <button
            key={d.id}
            className={`tv-nav-item ${focoCarril === i ? "foco" : ""} ${pantalla === d.id ? "activo" : ""}`}
            onMouseEnter={() => { if (recolocando.current) return; conElRaton(); setFocoCarril(i); }}
            onClick={() => { setFocoCarril(null); elegirDestino(d.id); }}
          >
            <span className="tv-nav-icono"><Icon name={d.icono} size={26} /></span>
            <span className="tv-nav-txt">{d.titulo}</span>
          </button>
        ))}
      </div>
      {/*
        Quién está viendo, a la derecha y siempre a la vista.

        Que se pregunte al encender no basta: la tele del salón cambia de
        manos a media tarde y nadie va a apagarla y encenderla para decirlo.
        Va con su color, que es como se reconoce el suyo de un vistazo desde
        el sofá, y solo aparece cuando hay más de uno.
      */}
      {perfiles.length > 1 && (
        <button
          className="tv-nav-perfil"
          onClick={() => { setFocoCarril(null); setPantalla("perfiles"); setFoco(Math.max(0, perfiles.findIndex((p) => p.id === perfil?.id))); }}
          title="Cambiar de perfil"
        >
          <span
            className="tv-nav-cara"
            style={{
              background:
                COLORES_PERFIL[
                  Math.max(0, perfiles.findIndex((p) => p.id === perfil?.id)) % COLORES_PERFIL.length
                ],
            }}
          >
            {(perfil?.name || "?").trim().slice(0, 1).toUpperCase()}
          </span>
          <span className="tv-nav-txt">{perfil?.name || "Perfil"}</span>
        </button>
      )}

      {/* Salir al otro extremo: es una puerta, no una sección, y en medio de
          las demás pesaba lo mismo que entrar en el cine */}
      <button
        className={`tv-nav-salir ${focoCarril === iSalir ? "foco" : ""}`}
        onMouseEnter={() => { if (recolocando.current) return; conElRaton(); setFocoCarril(iSalir); }}
        onMouseLeave={() => setFocoCarril(null)}
        onClick={() => { setFocoCarril(null); elegirDestino("salir"); }}
      >
        <span className="tv-nav-icono"><Icon name="power" size={24} /></span>
        <span className="tv-nav-txt">Salir</span>
      </button>
    </nav>
  );

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
    const ultima = filasConLista.length;
    return (
      <div className="tv-app tv-con-nav">
        {barraNav}

        <div className="tv-cuerpo tv-cuerpo-portada" ref={listaRef}>
          {cargando && <Cargando />}
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
                  className={`tv-banner-ver ${foc(focoFila === -1)}`}
                  onMouseEnter={() => { conElRaton(); setFocoFila(-1); }}
                  onClick={() => abrirTitulo(destacado)}
                >
                  <Icon name="play" size={24} />
                  {destacado.esSerie ? "Ver la serie" : "Reproducir"}
                </button>
              </div>
            </section>
          )}

          {filasConLista.map((f, fi) => (
            <section className="tv-carrusel" key={`${f.titulo}-${fi}`}>
              <h3 className="tv-carrusel-t">{f.titulo}</h3>
              <div
                className={`tv-carrusel-tira ${f.numerada ? "numerada" : ""} ${f.anchas ? "anchas" : ""}`}
                onMouseLeave={ratonSeVa}
              >
                {f.items.map((t, ci) => {
                  const puesto = focoFila === fi && focoCol === ci;
                  /*
                   * Un canal no lleva cartel: lleva logotipo.
                   *
                   * Metido en una carátula de 2:3 queda un dibujo pequeño
                   * flotando en un rectángulo vacío, y veinte de esos son
                   * veinte rectángulos vacíos. En tarjeta apaisada el
                   * logotipo llena lo suyo y debajo cabe qué están dando,
                   * que es la razón por la que alguien entra aquí.
                   */
                  if (f.anchas) {
                    const g = t.epgId ? epgAhora[t.epgId] : undefined;
                    const parte = avanceDe(g);
                    return (
                      <button
                        key={t.id}
                        className={`tv-canal ${foc(puesto)}`}
                        data-fila={fi}
                        data-col={ci}
                        data-foco={puesto ? "1" : undefined}
                        onMouseEnter={() => { conElRaton(); setFocoFila(fi); setFocoCol(ci); }}
                        onClick={() => abrirTitulo(t)}
                      >
                        <span className="tv-canal-marco">
                          <span className="tv-canal-ph">{t.nombre}</span>
                          {imgSrc(t.imagen) && !rotas[t.imagen] && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={imgSrc(t.imagen)}
                              alt=""
                              loading="lazy"
                              onError={() => marcarRota(t.imagen)}
                            />
                          )}
                          {f.numerada && <span className="tv-poster-num">{ci + 1}</span>}
                          {parte !== null && (
                            <span className="tv-canal-barra" aria-hidden="true">
                              <i style={{ width: `${parte}%` }} />
                            </span>
                          )}
                        </span>
                        <span className="tv-canal-nombre">
                          {t.numero ? <b>{t.numero}</b> : null}
                          {t.nombre}
                        </span>
                        {/* El hueco se reserva siempre: sin esto, las
                            tarjetas cuya guía llega más tarde crecen solas y
                            la fila entera da un salto debajo del foco */}
                        <span className="tv-canal-prog">{g?.ahora || ""}</span>
                      </button>
                    );
                  }
                  return (
                    <button
                      key={t.id}
                      className={`tv-poster ${foc(puesto)}`}
                      data-fila={fi}
                      data-col={ci}
                      data-foco={puesto ? "1" : undefined}
                      onMouseEnter={() => { conElRaton(); setFocoFila(fi); setFocoCol(ci); }}
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

          {!cargando && !filasConLista.length && !error && (
            <p className="tv-vacio">Tu proveedor no ha enviado nada en esta sección.</p>
          )}

          <button
            className={`tv-vertodas ${foc(focoFila === ultima)}`}
            data-foco={focoFila === ultima ? "1" : undefined}
            onMouseEnter={() => { conElRaton(); setFocoFila(ultima); }}
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

  /*
   * ---------- TV en directo ----------
   *
   * La pantalla entera en una: a la izquierda los canales, a la derecha lo
   * que están dando en el que tienes debajo del foco.
   *
   * Antes esto eran dos pantallas seguidas: una lista de carpetas, y dentro
   * de cada una la lista de canales. Encender la tele y que lo primero sea
   * un índice de categorías es hacer administrar antes de dejar ver, y
   * además desperdiciaba la pantalla: un televisor es ancho, no alto, y
   * había medio ancho en negro mientras la lista se estiraba de borde a
   * borde para escribir «Deportes (4)».
   *
   * Aquí la categoría es un filtro que se pone encima —«Ver todos los
   * canales» lleva al índice completo— y la mitad derecha se gana para lo
   * único que de verdad decide si te quedas en un canal: qué echan ahora.
   */
  if (dirEnPortada) {
    const dirFilas = [filaGuia, filaDestacados].filter((f) => f.items.length > 1);
    return (
      <div className="tv-app tv-con-nav">
        {barraNav}
        <div className="tv-directo">
          {/*
            La columna de canales.

            Cada fila lleva su distintivo a la izquierda —el logotipo, y si
            no hay, el número—, el nombre, qué dan debajo y la marca de
            directo. Es la forma que tiene una guía de televisión desde que
            existen: se recorre de arriba abajo sin leer, buscando el sitio.
          */}
          <aside className="tv-dir-canales">
            <div className="tv-dir-cab">
              {/* Dentro de una carpeta, la cabecera es también la puerta de
                  vuelta: el que ha entrado con el ratón no tiene ATRÁS */}
              {carpetaAbierta ? (
                <button className="tv-dir-volver" onClick={quitarCarpeta}>
                  ‹ <span>{carpetaAbierta}</span>
                </button>
              ) : (
                <h2>Carpetas</h2>
              )}
              <span className="tv-dir-cuenta">{canalesVista.length}</span>
            </div>
            <div className="tv-dir-lista" ref={listaRef} onMouseLeave={ratonSeVa}>
              {canalesVista.map((c, i) => {
                const g = c.epgId ? epgAhora[c.epgId] : undefined;
                const puesto = zonaDir === "canales" && foco === i;
                /* El nombre de una carpeta trae detrás cuántos canales tiene
                   —«Deportes  (12)»—, y el número se lee mejor aparte */
                const parte = c.carpeta ? /^(.*?)\s*\((\d+)\)\s*$/.exec(c.nombre) : null;
                return (
                  <button
                    key={c.id}
                    data-i={i}
                    className={`tv-dir-canal ${c.carpeta ? "es-carpeta" : ""} ${foc(puesto)}`}
                    data-foco={puesto ? "1" : undefined}
                    onMouseEnter={() => { conElRaton(); setZonaDir("canales"); setFoco(i); }}
                    onClick={() => { c.abrir(); if (c.carpeta) setFoco(0); }}
                  >
                    <span className="tv-dir-marca">
                      {c.carpeta ? (
                        <Icon name={c.icono || "list"} size={24} />
                      ) : imgSrc(c.logo) && !rotas[c.logo] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={imgSrc(c.logo)} alt="" loading="lazy" onError={() => marcarRota(c.logo)} />
                      ) : (
                        <b>{c.numero || i + 1}</b>
                      )}
                    </span>
                    <span className="tv-dir-txt">
                      <span className="tv-dir-nombre">{parte ? parte[1] : c.nombre}</span>
                      {/* El hueco se reserva siempre: sin esto, las filas
                          cuya guía llega más tarde crecen solas y la lista
                          entera da un salto debajo del foco */}
                      <span className="tv-dir-prog">
                        {c.carpeta
                          ? c.hijos?.[0]?.nombre || ""
                          : g?.ahora || ""}
                      </span>
                    </span>
                    {c.carpeta ? (
                      <span className="tv-dir-cuantos">{parte ? parte[2] : ""}</span>
                    ) : (
                      <span className="tv-dir-vivo">
                        <span className="tv-punto" aria-hidden="true" />
                        EN VIVO
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <button
              className={`tv-dir-todos ${foc(zonaDir === "canales" && foco === canalesVista.length)}`}
              onMouseEnter={() => { conElRaton(); setZonaDir("canales"); setFoco(canalesVista.length); }}
              onClick={carpetaAbierta ? quitarCarpeta : verCarpetas}
            >
              {carpetaAbierta ? "‹  Volver a las carpetas" : "Ver el catálogo entero  ›"}
            </button>
          </aside>

          <div className="tv-dir-main">
            {/*
              Lo que están dando, en grande.

              Un canal no tiene cartel apaisado: tiene un logotipo cuadrado
              que estirado a lo ancho queda como una mancha. Así que la
              mancha se usa a propósito —muy ampliada y desenfocada, de
              fondo— y el logotipo va entero encima, en su proporción. Lo que
              ocupa el sitio del cartel es el título del programa, que es lo
              que se está eligiendo.
            */}
            {canalMirado && (
              <section
                className="tv-dir-hero"
                data-fila="-1"
                data-foco={zonaDir === "derecha" && focoFila === -1 ? "1" : undefined}
              >
                {imgSrc(canalMirado.logo) && !rotas[canalMirado.logo] && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="tv-dir-hero-mancha" src={imgSrc(canalMirado.logo)} alt="" aria-hidden="true" />
                )}
                <span className="tv-dir-hero-velo" aria-hidden="true" />
                {/* Y el logotipo del canal, entero y a la derecha: es lo
                    único con imagen propia que tiene un canal, y sin él la
                    mitad derecha de la cabecera se queda en negro */}
                <span className="tv-dir-hero-logo" aria-hidden="true">
                  {imgSrc(canalMirado.logo) && !rotas[canalMirado.logo] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imgSrc(canalMirado.logo)} alt="" onError={() => marcarRota(canalMirado.logo)} />
                  ) : (
                    <Icon name="tv" size={120} />
                  )}
                </span>
                <div className="tv-dir-hero-txt">
                  <p className="tv-vivo tv-vivo-suelto">
                    <span className="tv-punto" aria-hidden="true" />
                    EN VIVO
                  </p>
                  <h2 className="tv-dir-hero-t">{guiaMirada?.ahora || canalMirado.nombre}</h2>
                  {guiaMirada?.resumen && <p className="tv-dir-hero-sub">{guiaMirada.resumen}</p>}
                  <p className="tv-dir-hero-datos">
                    {horaCorta(guiaMirada?.desde || 0) && (
                      <span className="tv-dir-hora">
                        <Icon name="clock" size={20} />
                        {horaCorta(guiaMirada?.desde || 0)}
                      </span>
                    )}
                    <span className="tv-dir-chip">
                      {canalMirado.numero ? <b>{canalMirado.numero}</b> : null}
                      {canalMirado.nombre}
                    </span>
                  </p>
                  {avance !== null && (
                    <span className="tv-dir-hero-barra" aria-hidden="true">
                      <i style={{ width: `${avance}%` }} />
                    </span>
                  )}
                  <button
                    className={`tv-dir-ver ${foc(zonaDir === "derecha" && focoFila === -1)}`}
                    onMouseEnter={() => { conElRaton(); setZonaDir("derecha"); setFocoFila(-1); }}
                    onClick={canalMirado.abrir}
                  >
                    <Icon name="play" size={24} />
                    Ver ahora
                  </button>
                </div>
              </section>
            )}

            {/* Y lo que viene después, en una tira: la pregunta que se hace
                con el mando en la mano no es solo «qué dan» sino «¿y luego?»,
                y son datos que ya se han pedido para el canal del foco */}
            {parrilla.length > 1 ? (
              <div className="tv-dir-luego">
                <span className="tv-dir-luego-t">A continuación</span>
                {parrilla.slice(1, 4).map((pr, i) => (
                  <span className="tv-dir-luego-p" key={`${pr.desde}-${i}`}>
                    <b>{horaCorta(pr.desde) || "—"}</b> {pr.titulo}
                  </span>
                ))}
              </div>
            ) : guiaMirada?.luego ? (
              <div className="tv-dir-luego">
                <span className="tv-dir-luego-t">A continuación</span>
                <span className="tv-dir-luego-p">{guiaMirada.luego}</span>
              </div>
            ) : null}

            {dirFilas.map((f, fi) => (
              <section className="tv-carrusel" key={f.titulo}>
                <h3 className="tv-carrusel-t">
                  {f.titulo}
                  <button
                    className={`tv-carrusel-todos ${foc(zonaDir === "derecha" && focoFila === fi && focoCol === f.items.length)}`}
                    onMouseEnter={() => { conElRaton(); setZonaDir("derecha"); setFocoFila(fi); setFocoCol(f.items.length); }}
                    onClick={verCarpetas}
                  >
                    Ver todos  ›
                  </button>
                </h3>
                <div className={`tv-carrusel-tira ${f.chips ? "chips" : "anchas"}`} onMouseLeave={ratonSeVa}>
                  {f.items.map((c, ci) => {
                    const g = c.epgId ? epgAhora[c.epgId] : undefined;
                    const puesto = zonaDir === "derecha" && focoFila === fi && focoCol === ci;
                    /* Los destacados van en pastilla pequeña: aquí se elige
                       por el canal, no por el programa, y una tarjeta
                       apaisada con un logotipo dentro es mucho hueco para
                       decir «Antena 3» */
                    if (f.chips) {
                      /* El nombre de la carpeta lleva detrás cuántos canales
                         tiene —«Deportes  (12)»—, y en una pastilla el número
                         se lee mejor aparte que pegado al nombre */
                      const parte = /^(.*?)\s*\((\d+)\)\s*$/.exec(c.nombre);
                      const nombre = f.carpetas && parte ? parte[1] : c.nombre;
                      const cuantos = f.carpetas && parte ? parte[2] : "";
                      const esLaAbierta = f.carpetas
                        ? c.id === "carpeta-todos"
                          ? !carpetaAbierta
                          : nombre === carpetaAbierta
                        : false;
                      return (
                        <button
                          key={c.id}
                          className={`tv-chip-canal ${f.carpetas ? "tv-chip-carpeta" : ""} ${esLaAbierta ? "activa" : ""} ${foc(puesto)}`}
                          data-fila={fi}
                          data-col={ci}
                          data-foco={puesto ? "1" : undefined}
                          onMouseEnter={() => { conElRaton(); setZonaDir("derecha"); setFocoFila(fi); setFocoCol(ci); }}
                          onClick={() => {
                            if (f.carpetas && c.id === "carpeta-todos") quitarCarpeta();
                            else c.abrir();
                            if (f.carpetas) { setZonaDir("canales"); setFoco(0); }
                          }}
                        >
                          {f.carpetas ? (
                            <>
                              <span className="tv-chip-icono">
                                <Icon name={c.icono || "list"} size={22} />
                              </span>
                              <span className="tv-chip-nombre">{nombre}</span>
                              {cuantos && <span className="tv-chip-cuenta">{cuantos}</span>}
                            </>
                          ) : (
                            <>
                              <span className="tv-chip-logo">
                                {imgSrc(c.logo) && !rotas[c.logo] ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={imgSrc(c.logo)} alt="" loading="lazy" onError={() => marcarRota(c.logo)} />
                                ) : (
                                  <b>{c.numero || ci + 1}</b>
                                )}
                              </span>
                              <span className="tv-chip-nombre">{c.nombre}</span>
                            </>
                          )}
                        </button>
                      );
                    }
                    /*
                      La tarjeta de la guía: manda la hora, no el logotipo.
                      Lo que se está contestando aquí es «¿qué hago esta
                      noche?», y eso se lee por el reloj y por el título del
                      programa; el canal es el dato pequeño de al lado.
                    */
                    const empieza = (c as { empieza?: number }).empieza || 0;
                    const programa = (c as { programa?: string }).programa || "";
                    if (f.guia) {
                      return (
                        <button
                          key={c.id}
                          className={`tv-tarjeta tv-tarjeta-guia ${foc(puesto)}`}
                          data-fila={fi}
                          data-col={ci}
                          data-foco={puesto ? "1" : undefined}
                          onMouseEnter={() => { conElRaton(); setZonaDir("derecha"); setFocoFila(fi); setFocoCol(ci); }}
                          onClick={c.abrir}
                        >
                          <span className="tv-guia-hora">{horaCorta(empieza) || "—"}</span>
                          <span className="tv-guia-t">{programa}</span>
                          <span className="tv-guia-canal">
                            {imgSrc(c.logo) && !rotas[c.logo] ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={imgSrc(c.logo)} alt="" loading="lazy" onError={() => marcarRota(c.logo)} />
                            ) : (
                              <b>{c.numero || ""}</b>
                            )}
                            <span>{c.nombre}</span>
                          </span>
                        </button>
                      );
                    }
                    return (
                      <button
                        key={c.id}
                        className={`tv-tarjeta tv-tarjeta-canal ${foc(puesto)}`}
                        data-fila={fi}
                        data-col={ci}
                        data-foco={puesto ? "1" : undefined}
                        onMouseEnter={() => { conElRaton(); setZonaDir("derecha"); setFocoFila(fi); setFocoCol(ci); }}
                        onClick={c.abrir}
                      >
                        <span className="tv-tarjeta-marco">
                          {imgSrc(c.logo) && !rotas[c.logo] ? (
                            <>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img className="tv-tarjeta-mancha" src={imgSrc(c.logo)} alt="" aria-hidden="true" />
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img className="tv-tarjeta-centro" src={imgSrc(c.logo)} alt="" loading="lazy" onError={() => marcarRota(c.logo)} />
                            </>
                          ) : (
                            <span className="tv-tarjeta-ph">{c.nombre}</span>
                          )}
                          <span className="tv-vivo">
                            <span className="tv-punto" aria-hidden="true" />
                            EN VIVO
                          </span>
                        </span>
                        <span className="tv-tarjeta-t">{g?.ahora || c.nombre}</span>
                        <span className="tv-tarjeta-sub">
                          {c.nombre}
                          {horaCorta(g?.desde || 0) ? ` · ${horaCorta(g?.desde || 0)}` : ""}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>
        {error && <p className="tv-activar-error">{error}</p>}
      </div>
    );
  }


  return (
    <div className="tv-app tv-con-nav">
      {barraNav}
      <div className="tv-cuerpo">
      <header className="tv-cabecera">
        <h2>{serieAbierta || carpetaAbierta || TITULOS[pantalla]}</h2>
        {(serieAbierta || carpetaAbierta) && <span className="tv-cabecera-de">{TITULOS[pantalla]}</span>}
        <span className="tv-cabecera-pista">▲ para las secciones · ATRÁS para volver</span>
      </header>

      {cargando && <Cargando />}
      {error && <p className="tv-activar-error">{error}</p>}
      {/*
        Lo que hay guardado en el aparato.

        Una fila por cosa, con su carátula, en qué va y cuánto ocupa: lo que
        se pregunta aquí es «¿ya la tengo?» y «¿cuánto me está comiendo el
        disco?», y las dos se contestan de un vistazo. Verla y quitarla van en
        la misma fila porque son las dos únicas cosas que se hacen en esta
        pantalla; esconder la segunda en un menú de ajustes es lo que hace que
        un disco se llene y no se vacíe nunca.
      */}
      {enDescargas ? (
        <div className="tv-bajadas" onMouseLeave={ratonSeVa}>
          {!descargas.length && (
            <p className="tv-vacio">
              Todavía no has guardado nada. En la ficha de una película o de un episodio
              tienes el botón de descargar.
            </p>
          )}
          {descargas.map((d, i) => (
            <div className="tv-bajada" key={d.id}>
              <span className="tv-bajada-cartel">
                {imgSrc(d.cartel) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imgSrc(d.cartel)} alt="" />
                ) : (
                  <Icon name="film" size={30} />
                )}
              </span>
              <button
                data-i={i}
                className={`tv-bajada-txt ${foc(foco === i && descargaCol === 0)}`}
                onMouseEnter={() => { conElRaton(); setFoco(i); setDescargaCol(0); }}
                onClick={() =>
                  d.estado === "lista" && d.url
                    ? reproducir({ url: d.url, name: d.nombre, kind: "video" })
                    : undefined
                }
              >
                <span className="tv-bajada-nombre">{d.nombre}</span>
                {d.estado === "bajando" ? (
                  <>
                    <span className="tv-bajada-estado">Bajando · {comoVa(d.parte, d.bytes)}</span>
                    <span className="tv-bajada-barra" aria-hidden="true">
                      <i style={{ width: `${d.parte}%` }} />
                    </span>
                  </>
                ) : d.estado === "fallo" ? (
                  /* Un fallo se dice y se deja a la vista con su papelera al
                     lado: media descarga ocupando disco sin que nadie sepa
                     que está ahí es peor que el fallo */
                  <span className="tv-bajada-estado tv-bajada-fallo">
                    {/* Y por qué: «no se ha podido» a secas no deja arreglar
                        nada, ni a quien lo usa ni a quien lo mantiene */}
                    {d.motivo ? `No se ha podido terminar · ${d.motivo}` : "No se ha podido terminar"}
                  </span>
                ) : (
                  <span className="tv-bajada-estado">
                    En este aparato{tamanoLegible(d.bytes) ? ` · ${tamanoLegible(d.bytes)}` : ""}
                  </span>
                )}
              </button>
              <button
                className={`tv-bajada-quitar ${foc(foco === i && descargaCol === 1)}`}
                aria-label={`Quitar ${d.nombre} del aparato`}
                onMouseEnter={() => { conElRaton(); setFoco(i); setDescargaCol(1); }}
                onClick={() => { quitarDescarga(d.id); setDescargas(leerDescargas()); }}
              >
                <Icon name="papelera" size={24} />
              </button>
            </div>
          ))}
        </div>
      ) : null}
      {enDescargas ? null : (
      <>
      {/*
        Y las carpetas, en dos columnas.

        Una carpeta es un nombre y un número: estirada de borde a borde
        ocupaba mil ochocientos píxeles para escribir «Deportes (4)», y en la
        primera pantalla del directo se veían dos filas y medio televisor en
        negro. En dos columnas caben el doble sin que ninguna deje de leerse
        desde el sofá, y el mando las recorre igual porque el número de
        columnas se mide al pintar.
      */}
      <div
        className={`tv-lista ${rejilla ? "tv-rejilla" : ""} ${soloCarpetas ? "tv-carpetas" : ""}`}
        ref={listaRef}
        onMouseLeave={ratonSeVa}
      >
        {filas.map((f, i) =>
          /* Una película se elige por la carátula, no leyendo su nombre en
             una lista: se pinta grande y con el título debajo */
          rejilla ? (
            <button
              key={f.id}
              data-i={i}
              className={`tv-poster ${foc(foco === i)}`}
              onMouseEnter={() => { conElRaton(); setFoco(i); }}
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
              className={`tv-fila ${foc(foco === i)} ${f.carpeta ? "tv-carpeta" : ""}`}
              onMouseEnter={() => { conElRaton(); setFoco(i); }}
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
        {!cargando && !filas.length && !error && <p className="tv-vacio">Aquí no hay nada todavía.</p>}
      </div>
      </>
      )}
      </div>
    </div>
  );
}

const TITULOS: Record<string, string> = {
  directo: "TV en directo",
  cine: "Películas",
  series: "Series",
  descargas: "Descargas",
};

/**
 * Lo que se enseña de un título antes de ponerlo.
 *
 * `episodios` viene vacío en una película: es lo único que separa una ficha
 * de la otra, y no compensa tener dos pantallas casi iguales por eso.
 */
/**
 * La duración de un episodio, en minutos y corta.
 *
 * Los paneles la mandan de tres formas: «52», «52 min» y «00:52:00». Sin
 * normalizar, la fila de episodios enseña las tres a la vez y parece que
 * cada una mide una cosa distinta. Y si no viene nada, no se pone nada: un
 * «0 min» dice algo falso, y el hueco no dice nada, que es lo correcto.
 */
export interface Episodio {
  id: string;
  numero: string;
  titulo: string;
  /* Lo que hace que una fila de episodios se mire en vez de leerse. Xtream
     los manda en `info.movie_image`; cuando no viene, la fila enseña el
     número en grande y no un hueco */
  imagen: string;
  duracion: string;
  sinopsis: string;
  abrir: () => void;
  /** Dónde está su vídeo, para poder bajarlo. Ver `Ficha.enlace` */
  enlace?: () => Promise<string>;
}
/*
 * Mi lista: lo que has guardado para verlo luego.
 *
 * Se guardan solo los identificadores, no los títulos enteros. El catálogo
 * ya está cargado cuando se pinta la portada, así que con el identificador
 * se recupera el título con su carátula y, sobre todo, con su forma de
 * abrirse; copiando los datos tendríamos dos versiones de lo mismo y la
 * guardada se quedaría vieja en cuanto el proveedor cambiara algo.
 *
 * Vive en el aparato y no en el servidor a propósito: un cliente de
 * proveedor no tiene cuenta nuestra donde colgarlo, y en una tele lo que
 * importa es que esté en ESA tele.
 */
const K_MI_LISTA = "xp.tvMiLista.v1";

function leerMiLista(): string[] {
  try {
    const crudo = JSON.parse(localStorage.getItem(K_MI_LISTA) || "[]");
    return Array.isArray(crudo) ? crudo.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function guardarMiLista(ids: string[]) {
  try {
    localStorage.setItem(K_MI_LISTA, JSON.stringify(ids));
  } catch {
    /* almacenamiento lleno o bloqueado: sin lista, pero sin romper */
  }
}

/** Añade o quita, y devuelve cómo queda. Lo último guardado va primero. */
function alternarEnMiLista(id: string): string[] {
  const ya = leerMiLista();
  const nueva = ya.includes(id) ? ya.filter((x) => x !== id) : [id, ...ya];
  guardarMiLista(nueva);
  return nueva;
}

/**
 * El nombre de la carpeta a la que pertenece un título.
 *
 * El panel manda el número de la categoría en cada título y los nombres
 * aparte, así que hay que cruzarlos. Sirve para el camino de arriba de la
 * ficha —«Series › Suspense»—, que es lo que dice de dónde has salido; sin
 * él, la ficha aparece flotando y no se sabe si vino de una búsqueda, de una
 * fila o de una carpeta.
 */
function nombreDeCategoria(cats: unknown, id: unknown): string {
  if (!Array.isArray(cats)) return "";
  const suya = (cats as XtreamCategory[]).find(
    (c) => String(c.category_id) === String(id ?? "")
  );
  return suya?.category_name || "";
}

export interface Ficha {
  /** El mismo identificador que usa la portada: «vod-123», «serie-45» */
  id: string;
  nombre: string;
  /** De dónde se entró, para que ATRÁS devuelva ahí y no a la portada */
  volverA: Pantalla;
  cartel: string;
  fondo: string;
  sinopsis: string;
  /** Año · nota · géneros, ya montado */
  datos: string;
  /*
   * Y los mismos datos por separado, para poder enseñarlos como lo que son.
   *
   * En una línea sola —«2026 · ★ 7.5 · Suspense, Drama»— todo pesa igual y
   * no se distingue el año de la nota ni del género. Sueltos, cada uno
   * puede ir donde le toca: los de ficha técnica en su fila, la nota
   * destacada, y los géneros junto al reparto y la dirección, que es
   * información de la misma clase.
   */
  anio: string;
  /** «118 min», ya normalizado. Vacío si el panel no lo manda */
  duracion: string;
  genero: string;
  /** La nota, tal cual la manda el panel o TMDB. Vacía si no hay */
  nota: string;
  /** Cuánta gente la ha votado, si viene de TMDB. Cero si no se sabe */
  votos: number;
  /*
   * Si es una serie, dicho desde el primer momento.
   *
   * Se sabía mirando si `temporadas` tenía algo, pero eso llega con
   * `get_series_info`, que es otra petición: hasta entonces una serie se
   * preguntaba a TMDB como si fuera una película —y ahí no está—, y había
   * que volver a preguntar cuando llegaban los episodios.
   */
  esSerie: boolean;
  /** La carpeta del panel de la que viene, para el camino de arriba */
  categoria: string;
  reparto: string;
  direccion: string;
  temporadas: string[];
  episodios: Record<string, Episodio[]>;
  /** Poner la película, o el primer episodio de la serie */
  reproducir: () => void;
  /*
   * Y dónde está el vídeo, para poder bajarlo.
   *
   * Es lo mismo que resuelve `reproducir` por dentro, pero devuelto en vez
   * de puesto: guardar en el aparato y ponerlo son la misma dirección con
   * dos finales distintos. Solo lo tienen las películas; en una serie lo que
   * se baja es un episodio, y cada uno trae el suyo.
   */
  enlace?: () => Promise<string>;
}

/**
 * El mismo «cargando» en todas las pantallas.
 *
 * Era un párrafo de texto grande pegado a la esquina de arriba a la
 * izquierda, distinto en cada sitio y difícil de distinguir de un mensaje de
 * error. Un aro girando centrado en el hueco dice lo mismo sin escribirlo, se
 * lee desde el sofá y no se confunde con contenido.
 *
 * Y los mensajes de «aquí no hay nada» dejan de usar este estilo: no son una
 * espera, son una respuesta, y con la misma pinta parecía que la pantalla
 * seguía cargando para siempre.
 */
function Cargando({ texto = "Cargando…" }: { texto?: string }) {
  return (
    <div className="tv-cargando" role="status">
      <span className="tv-cargando-aro" aria-hidden="true" />
      <span>{texto}</span>
    </div>
  );
}

/** Un color por perfil, en el orden en que están. El mismo que el reproductor. */
const COLORES_PERFIL = ["#e5192b", "#2ecc8f", "#3b82f6", "#f59e0b", "#a855f7"];

const DESTINOS: { id: Pantalla; titulo: string; icono: IconName; pie: string }[] = [
  { id: "directo", titulo: "TV en directo", icono: "tv", pie: "Canales y qué echan ahora" },
  { id: "cine", titulo: "Películas", icono: "film", pie: "Estrenos y lo mejor valorado" },
  { id: "series", titulo: "Series", icono: "series", pie: "Temporadas y episodios" },
  /* Solo sale donde se puede guardar de verdad: en un navegador y en un
     televisor Samsung o LG este acceso no existe. Ver `descargas.ts` */
  { id: "descargas", titulo: "Descargas", icono: "bajar", pie: "Lo que tienes guardado" },
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
  { id: "descargas", titulo: "Descargas", icono: "bajar" },
  { id: "salir", titulo: "Salir", icono: "power" },
];

function sitio(): string {
  if (typeof window === "undefined") return "";
  return window.location.host;
}
