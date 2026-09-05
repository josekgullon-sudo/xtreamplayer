/**
 * El cartel que le sale a un cliente de proveedor en un navegador de a pie.
 *
 * Estaba escrito dos veces —una en `/tv` y otra dentro de `PlayerApp`— con
 * el mismo maquetado y textos distintos. Es la única pantalla que ve quien
 * paga a un proveedor y todavía no ha instalado nada, así que conviene que
 * sea la misma en los dos sitios y que se arregle en uno.
 *
 * Por qué existe: ver `lib/envoltorio.ts`.
 */
export default function SoloApps({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="solo-apps">
      <div className="solo-apps-caja">
        <span className="logo-nombre">
          TOTAL<span className="logo-play">player</span>
        </span>
        <h1>{titulo}</h1>
        <p>{texto}</p>
        <div className="solo-apps-botones">
          <a className="btn btn-primary" href="/apps">
            Ver las aplicaciones
          </a>
          <a className="btn btn-ghost" href="/mi-cuenta">
            Mi cuenta
          </a>
        </div>
      </div>
    </div>
  );
}
