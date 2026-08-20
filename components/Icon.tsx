/**
 * Iconos de línea en SVG.
 *
 * Se dibujan a mano en vez de usar emojis (que cada sistema pinta a su manera
 * y restan seriedad a una herramienta de trabajo) y sin librería externa, para
 * no cargar peso ni depender de fuentes de iconos en los navegadores de TV.
 */

export type IconName =
  | "users"
  | "handshake"
  | "globe"
  | "sparkle"
  | "card"
  | "play"
  | "power"
  | "tv"
  | "building"
  | "search"
  | "plus"
  | "upload"
  | "pencil"
  | "trash"
  | "copy"
  | "check"
  | "eye"
  | "eyeOff"
  | "back"
  | "cerrar"
  | "device"
  | "clock"
  | "shield"
  | "list"
  | "lock"
  | "unlock"
  | "external"
  | "chevronRight"
  | "alert"
  | "film"
  | "series"
  | "star"
  | "recargar"
  | "casa"
  | "balon"
  | "silbato"
  | "casco"
  | "guante"
  | "bebe"
  | "calendario"
  | "musica"
  | "noticias"
  | "libro"
  | "antena"
  | "rejilla"
  | "chart";

const PATHS: Record<IconName, React.ReactNode> = {
  users: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  handshake: (
    <>
      <path d="m11 17 2 2a1 1 0 1 0 3-3" />
      <path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.9-3.9a2 2 0 0 1 0-2.8l.4-.4a2 2 0 0 1 2.8 0L21 8" />
      <path d="m21 3-2 2M3 8l3.6-3.6a2 2 0 0 1 2.8 0l.4.4a2 2 0 0 1 0 2.8L7 11a2 2 0 0 0 0 2.8l1.2 1.2" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18" />
    </>
  ),
  sparkle: (
    <>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
      <path d="M12 8.5 13.6 12 12 15.5 10.4 12 12 8.5Z" />
    </>
  ),
  card: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
    </>
  ),
  play: <path d="M6 4.5v15l13-7.5-13-7.5Z" />,
  power: (
    <>
      <path d="M12 3v9" />
      <path d="M18.4 6.6a9 9 0 1 1-12.8 0" />
    </>
  ),
  tv: (
    <>
      <rect x="2" y="4" width="20" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </>
  ),
  building: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="1" />
      <path d="M9 8h1M14 8h1M9 12h1M14 12h1M10 21v-4h4v4" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  upload: (
    <>
      <path d="M12 16V4M8 8l4-4 4 4" />
      <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </>
  ),
  pencil: (
    <>
      <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z" />
      <path d="m14 6 4 4" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16M10 11v6M14 11v6" />
      <path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M9 7V4h6v3" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </>
  ),
  check: <path d="m4 12 5 5L20 6" />,
  eye: (
    <>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M10.6 6.2A9.9 9.9 0 0 1 12 6c6.4 0 10 6 10 6a17 17 0 0 1-3 3.6M6.6 6.7A17 17 0 0 0 2 12s3.6 6 10 6c1.6 0 3-.3 4.2-.9" />
      <path d="M3 3l18 18M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </>
  ),
  back: <path d="M19 12H5M11 6l-6 6 6 6" />,
  cerrar: <path d="M18 6 6 18M6 6l12 12" />,
  device: (
    <>
      <rect x="2" y="5" width="14" height="10" rx="1.5" />
      <path d="M6 19h8" />
      <rect x="17.5" y="10" width="4.5" height="9" rx="1" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5.5l3.5 2" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3l8 3v6c0 4.5-3.2 8.3-8 9.5-4.8-1.2-8-5-8-9.5V6l8-3Z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  list: (
    <>
      <path d="M8 6h13M8 12h13M8 18h13" />
      <path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
    </>
  ),
  chart: (
    <>
      <path d="M3 3v16.5a1.5 1.5 0 0 0 1.5 1.5H21" />
      <path d="M7.5 15.5v2M12 10.5v7M16.5 6.5v11" />
    </>
  ),
  lock: (
    <>
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </>
  ),
  unlock: (
    <>
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 7.5-2" />
    </>
  ),
  external: (
    <>
      <path d="M14 4h6v6M20 4l-8 8" />
      <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </>
  ),
  chevronRight: <path d="m9 6 6 6-6 6" />,
  alert: (
    <>
      <path d="M12 4 2.5 20h19L12 4Z" />
      <path d="M12 10v4M12 17.5h.01" />
    </>
  ),
  film: (
    /*
     * La tira de película, con las perforaciones separadas.
     *
     * La versión anterior metía tres líneas horizontales en ocho unidades de
     * alto: en el carril de la tele, a 22 px, quedaban a tres píxeles unas de
     * otras y el icono se veía como una mancha. Con dos perforaciones por
     * lado y seis unidades entre ellas se sigue leyendo como carrete y cada
     * trazo se distingue.
     */
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M8 4v16M16 4v16" />
      <path d="M3 9h5M3 15h5M16 9h5M16 15h5" />
    </>
  ),
  series: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="m7.5 4 4.5 3 4.5-3" />
      <path d="m10.5 11.5 4 2.5-4 2.5v-5Z" />
    </>
  ),
  star: <path d="m12 3.5 2.6 5.6 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.9l6-.8L12 3.5Z" />,
  casa: (
    /*
     * La casa, de una sola línea.
     *
     * Antes eran tejado y paredes por separado y no se encontraban en el
     * mismo punto: la esquina quedaba con dos trazos cruzados y a tamaño de
     * carril parecía un borrón. Ahora es un contorno continuo y la puerta.
     */
    <>
      <path d="m3 10.5 9-7.5 9 7.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V10.5Z" />
      <path d="M9.5 21v-6.5h5V21" />
    </>
  ),
  recargar: (
    <>
      <path d="M20 12a8 8 0 1 1-2.6-5.9" />
      <path d="M20 4v4.5h-4.5" />
    </>
  ),

  /*
   * Los de las carpetas de canales.
   *
   * Una lista de proveedor trae sesenta carpetas y la mitad empiezan por la
   * misma palabra: «DAZN - MOTO GP», «DAZN | EVENTOS», «DAZN - F1». Leídas
   * en una columna son la misma mancha de texto. Con un casco, un
   * calendario y otro casco delante, se distinguen sin leer.
   */
  balon: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m12 7.5 3.6 2.6-1.4 4.2H9.8L8.4 10.1 12 7.5Z" />
      <path d="M12 3.5v4M4.4 9.6l4 .5M19.6 9.6l-4 .5M7.2 19.4l2.6-4.5M16.8 19.4l-2.6-4.5" />
    </>
  ),
  silbato: (
    <>
      <path d="M2.5 9h9.5a5.5 5.5 0 1 1 0 11H8A5.5 5.5 0 0 1 2.5 14.5V9Z" />
      <circle cx="12" cy="14.5" r="1.8" />
      <path d="M12.5 9V7a2 2 0 0 1 2-2h5" />
    </>
  ),
  casco: (
    <>
      <path d="M3 13a9 9 0 0 1 18 0v3a2 2 0 0 1-2 2h-8a8 8 0 0 1-8-8v3Z" />
      <path d="M4.5 13h9a3 3 0 0 0 3-3v-.6" />
    </>
  ),
  guante: (
    <>
      <path d="M5 10.5A5.5 5.5 0 0 1 10.5 5h2A5.5 5.5 0 0 1 18 10.5V13a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3v-2.5Z" />
      <path d="M5 12.5h3.5" />
      <path d="M7.5 16v1.5A1.5 1.5 0 0 0 9 19h5a1.5 1.5 0 0 0 1.5-1.5V16" />
    </>
  ),
  bebe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9 10.5h.01M15 10.5h.01" />
      <path d="M9.5 15a3.5 3.5 0 0 0 5 0" />
    </>
  ),
  calendario: (
    <>
      <rect x="3.5" y="5" width="17" height="16" rx="2" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
      <path d="M12 14h.01" />
    </>
  ),
  musica: (
    <>
      <path d="M9 18V6l11-2v12" />
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="17.5" cy="16" r="2.5" />
    </>
  ),
  noticias: (
    <>
      <path d="M3 6h13v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6Z" />
      <path d="M16 10h4v9a2 2 0 0 1-4 0" />
      <path d="M6 9.5h7M6 13h7M6 16.5h4" />
    </>
  ),
  libro: (
    <>
      <path d="M4 4.5h5a3 3 0 0 1 3 3v12a2.5 2.5 0 0 0-2.5-2.5H4v-12Z" />
      <path d="M20 4.5h-5a3 3 0 0 0-3 3v12a2.5 2.5 0 0 1 2.5-2.5H20v-12Z" />
    </>
  ),
  rejilla: (
    <>
      <rect x="3" y="3.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="3.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="3" y="13" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="13" width="7.5" height="7.5" rx="1.5" />
    </>
  ),
  antena: (
    <>
      <path d="M12 13v8M8.5 21h7" />
      <circle cx="12" cy="10" r="2" />
      <path d="M8.1 13.9a5.5 5.5 0 0 1 0-7.8M15.9 6.1a5.5 5.5 0 0 1 0 7.8" />
      <path d="M5.3 16.7a9.5 9.5 0 0 1 0-13.4M18.7 3.3a9.5 9.5 0 0 1 0 13.4" />
    </>
  ),
};

export default function Icon({
  name,
  size = 18,
  className,
  style,
}: {
  name: IconName;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
