/**
 * Los logotipos de los aparatos donde se ve esto.
 *
 * Dibujados a mano en SVG, en un solo color y del mismo tamaño, por tres
 * motivos: no cargar imágenes de fuera (que es lo que ralentiza una página y
 * lo que un navegador de televisor peor lleva), que se vean igual en claro y
 * en oscuro, y no colgar la marca de nadie de un archivo suyo. Es una lista
 * de compatibilidad: aquí solo se nombra el aparato en el que funciona.
 *
 * Samsung y LG no llevan símbolo, llevan su nombre: sus logotipos son
 * justamente eso, la palabra. Se pintan como texto en su forma —el óvalo y
 * el círculo— desde la página, no aquí.
 */

export type LogoNombre = "android" | "google" | "fuego" | "apple" | "windows" | "linux";

export default function LogoAparato({ nombre, size = 18 }: { nombre: LogoNombre; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
      style={{ flexShrink: 0 }}
    >
      {DIBUJOS[nombre]}
    </svg>
  );
}

const DIBUJOS: Record<LogoNombre, React.ReactNode> = {
  // El muñeco: cúpula con dos ojos calados, antenas, cuerpo y brazos
  android: (
    <>
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M5.9 11.3a6.1 6.1 0 0 1 12.2 0zM9.9 8.9a.72.72 0 1 1 0-1.44.72.72 0 0 1 0 1.44zm4.2 0a.72.72 0 1 1 0-1.44.72.72 0 0 1 0 1.44z"
      />
      <path
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        d="M7.9 6.1 6.7 4.2M16.1 6.1l1.2-1.9"
      />
      <path
        fill="currentColor"
        d="M5.9 12.4h12.2v5.9a1.5 1.5 0 0 1-1.5 1.5H7.4a1.5 1.5 0 0 1-1.5-1.5zM3.3 12.4a1.1 1.1 0 0 1 2.2 0v4.3a1.1 1.1 0 0 1-2.2 0zM18.5 12.4a1.1 1.1 0 0 1 2.2 0v4.3a1.1 1.1 0 0 1-2.2 0z"
      />
    </>
  ),

  // La G de Google TV: el círculo abierto con su barra
  google: (
    <>
      <path
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        d="M17.6 8.2A6.4 6.4 0 1 0 18.4 13"
      />
      <path stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="M12.4 13h6" />
    </>
  ),

  // La llama del Fire TV
  fuego: (
    <path
      fill="currentColor"
      d="M12.4 2.3c3.6 3.5 5.7 6.3 5.7 9.6a6.1 6.1 0 1 1-12.2 0c0-1.8.7-3.5 2-5.1.1 1.4.9 2.3 2 2.3 1.3 0 2.1-1.1 2.1-2.9 0-1.2-.2-2.5-.7-3.9zm-.4 9.9c-1.4 1.4-2.2 2.6-2.2 3.9a2.5 2.5 0 0 0 5 0c0-1.3-.9-2.6-2.8-3.9z"
    />
  ),

  // La manzana de los iPhone, iPad y Mac
  apple: (
    <>
      <path
        fill="currentColor"
        d="M16.1 12.5c0-2 1.5-3 1.6-3.1-.9-1.3-2.2-1.5-2.7-1.5-1.2-.1-2.2.7-2.8.7-.6 0-1.5-.7-2.4-.7-1.3 0-2.4.7-3.1 1.9-1.3 2.3-.3 5.7 1 7.6.6 1 1.4 2 2.4 2 .9 0 1.3-.6 2.4-.6s1.4.6 2.4.6c1 0 1.6-.9 2.2-1.9.7-1.1 1-2.1 1-2.2 0 0-1.9-.7-2-2.8z"
      />
      <path
        fill="currentColor"
        d="M14.3 6.3c.5-.6.8-1.5.7-2.4-.7.1-1.6.5-2.2 1.2-.5.6-.9 1.5-.8 2.3.8.1 1.7-.4 2.3-1.1z"
      />
    </>
  ),

  // Las cuatro hojas de la ventana
  windows: (
    <path
      fill="currentColor"
      d="M3.5 6.3 11 5.2v6.1H3.5zM12.3 5 20.5 3.8v7.5h-8.2zM3.5 12.7H11v6.1L3.5 17.7zM12.3 12.7h8.2v7.5L12.3 19z"
    />
  ),

  // El pingüino, que es como se conoce a Linux
  linux: (
    <>
      <path
        fill="currentColor"
        d="M12 2.6c2 0 3.4 1.6 3.4 3.7 0 .9.3 1.6 1 2.6 1.2 1.7 1.8 3.4 1.8 5.2 0 3.4-2.6 5.8-6.2 5.8s-6.2-2.4-6.2-5.8c0-1.8.6-3.5 1.8-5.2.7-1 1-1.7 1-2.6 0-2.1 1.4-3.7 3.4-3.7z"
      />
      <path fill="var(--bg-elev-2, #22212b)" d="M10.6 5.6a.62.62 0 1 1 0-1.24.62.62 0 0 1 0 1.24zm2.8 0a.62.62 0 1 1 0-1.24.62.62 0 0 1 0 1.24z" />
      <path fill="currentColor" opacity=".55" d="M12 6.1c.9 0 1.6.5 1.6 1s-.7 1-1.6 1-1.6-.5-1.6-1 .7-1 1.6-1z" />
      <path
        fill="currentColor"
        d="M8.8 19.6c-.5.8-1.2 1.3-2 1.5-.6.2-1-.1-.9-.6.1-.4.5-.8 1-1.3.4-.4.7-.9.9-1.4zM15.2 19.6l1 -1.8c.2.5.5 1 .9 1.4.5.5.9.9 1 1.3.1.5-.3.8-.9.6-.8-.2-1.5-.7-2-1.5z"
      />
    </>
  ),
};
