import Link from "next/link";

/**
 * La página que no está.
 *
 * Sin esto sale la de fábrica de Next: «404 — This page could not be found»
 * en inglés, sobre blanco y sin una sola salida. En un producto que está
 * entero en castellano y en oscuro, eso no se lee como «te has equivocado de
 * dirección», se lee como «esto no es donde creías» — y quien llega aquí es
 * casi siempre un cliente con un enlace viejo de su proveedor.
 *
 * Con las dos salidas que de verdad se usan: al reproductor si ya tiene su
 * lista, y a la portada si no.
 */
export const metadata = { title: "Página no encontrada · TOTALplayer" };

export default function NoEncontrada() {
  return (
    <div className="auth-wrap escena">
      <div className="card auth-card" style={{ textAlign: "center" }}>
        <h1>Aquí no hay nada</h1>
        <p className="auth-sub">
          La dirección no existe o ha dejado de existir. Si has llegado desde un enlace de tu proveedor,
          pídele el bueno.
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <Link className="btn btn-primary" href="/player">
            Ir al reproductor
          </Link>
          <Link className="btn btn-ghost" href="/">
            Volver al principio
          </Link>
        </div>
      </div>
    </div>
  );
}
