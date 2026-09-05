/**
 * ¿Esto se está viendo dentro de una de nuestras aplicaciones?
 *
 * La pregunta decide una sola cosa, y es grande: quien entra con el usuario
 * que le dio su proveedor ve la tele, o ve un cartel que le manda a las
 * aplicaciones. La razón del cartel es que en una página web no hay forma de
 * reproducir un vídeo sin que su dirección quede al alcance de F12, y en
 * Xtream esa dirección lleva dentro el servidor, el usuario y la contraseña
 * del proveedor. Dentro de un envoltorio no hay inspector que abrir.
 *
 * Ninguna de las dos señales es una cerradura y no pretenden serlo: una
 * cadena de agente se copia en diez segundos y `?app=1` se escribe a mano.
 * Lo que de verdad protege es que ni el catálogo, ni las carátulas, ni la
 * M3U llevan ya dirección alguna dentro. Esto solo evita que el camino corto
 * sea abrir la aplicación en el portátil.
 */

/**
 * La marca que las aplicaciones de Android añaden a su agente.
 *
 * Va aquí y no solo `?app=1` porque un APK ya instalado no se actualiza
 * cuando nosotros desplegamos: el de un cliente que se lo bajó el mes pasado
 * sigue pidiendo la dirección de siempre, y tiene que seguir entrando.
 */
const NUESTRAS = /totalplayerapp/i;

/**
 * Los televisores que se identifican como tales.
 *
 * Cubre a quien entra por el navegador de su propia tele, sin envoltorio de
 * por medio: ahí tampoco hay inspector.
 */
const TELEVISORES =
  /tizen|web0s|webos|smart-?tv|smarttv|hbbtv|netcast|viera|bravia|aft[a-z]|android tv|googletv|crkey/i;

/** Un televisor, con o sin envoltorio. Lo que puede abrir `/tv`. */
export function enUnTelevisor(agente: string, app?: string | string[]): boolean {
  return app === "1" || NUESTRAS.test(agente) || TELEVISORES.test(agente);
}

/**
 * Cualquiera de nuestros envoltorios. Lo que puede abrir `/player`.
 *
 * El del móvil es un WebView alrededor de esta misma página: si aquí se le
 * enseñara el cartel de «instálate la aplicación», el cliente lo leería
 * dentro de la aplicación que acaba de instalarse.
 */
export function enUnaAplicacion(agente: string, app?: string | string[]): boolean {
  return enUnTelevisor(agente, app);
}
