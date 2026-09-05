"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";
import type { Fuente } from "@/lib/xtream";

/**
 * Ajustes.
 *
 * Es el punto 7 de `docs/REDISEÑO.md` y lo que faltaba para que el cliente
 * pudiera arreglar sus cosas sin llamar a nadie. Cuatro bloques, y los
 * cuatro nacieron de algo que hoy acaba en una llamada al proveedor:
 *
 * - **Idioma**: el reproductor recuerda en qué idioma se ve. Está bien
 *   hasta el día que se eligió mal y ya no hay forma de deshacerlo.
 * - **Seguir viendo**: con la tele compartida, hay quien no quiere que lo
 *   suyo se quede puesto en la pantalla de inicio.
 * - **Aparatos**: el cupo. Es la llamada más frecuente que recibe un
 *   proveedor, y casi siempre por la propia tele del cliente.
 * - **Conexión**: cuando algo no va, saber si el que falla es el proveedor
 *   o este aparato. El servidor ya lo sabe distinguir —`/api/diag`— pero
 *   eso vivía escondido detrás de un botón de error.
 */

/** Un aparato de la cuenta, como lo manda /api/customer/cuenta */
interface Aparato {
  id: number;
  llave: string;
  nombre: string;
  plataforma: string;
  visto: number;
}

const PLATAFORMA: Record<string, string> = {
  web: "Navegador",
  tv: "Televisor",
  android: "Android",
  ios: "iPhone o iPad",
  windows: "Windows",
  mac: "Mac",
};

/** «Hace 3 días», que es como se reconoce el aparato propio. */
function haceCuanto(cuando: number): string {
  if (!cuando) return "";
  const min = Math.round((Date.now() - cuando) / 60000);
  if (min < 2) return "ahora mismo";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} ${h === 1 ? "hora" : "horas"}`;
  const d = Math.round(h / 24);
  return `hace ${d} ${d === 1 ? "día" : "días"}`;
}

/* Las mismas llaves que usa el reproductor. Ver components/player/VideoPlayer.tsx */
const K_AUDIO = "xp.idiomaAudio.v1";
const K_SUBS = "xp.idiomaSubs.v1";
const SIN_SUBS = "\u0000ninguno";

function leer(clave: string): string {
  try {
    return localStorage.getItem(clave) || "";
  } catch {
    return "";
  }
}

export default function Ajustes({
  marca,
  soporte,
  esCliente,
  creds,
  onCerrar,
}: {
  marca: string;
  soporte?: string;
  /** Los aparatos son cosa de quien tiene cuenta con un proveedor */
  esCliente: boolean;
  /**
   * De qué lista se habla, en el lenguaje del servidor.
   *
   * La de un cliente de proveedor va por su número y el servidor resuelve
   * el resto; la que uno se pega en su navegador viaja con sus datos,
   * porque de esa el servidor no sabe nada. Ver `credsOf` en PlayerApp.
   */
  creds: Fuente | null;
  onCerrar: () => void;
}) {
  const [audio, setAudio] = useState("");
  const [subs, setSubs] = useState("");
  const [aparatos, setAparatos] = useState<Aparato[] | null>(null);
  const [cerrando, setCerrando] = useState("");
  const [vistosBorrados, setVistosBorrados] = useState(false);
  const [probando, setProbando] = useState(false);
  const [veredicto, setVeredicto] = useState("");
  /* El veredicto es lo último del cuadro y en una pantalla normal cae por
     debajo del borde: se enseña solo, que si no parece que no ha pasado nada */
  const elVeredicto = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    setAudio(leer(K_AUDIO));
    setSubs(leer(K_SUBS));
  }, []);

  useEffect(() => {
    if (!esCliente) return;
    fetch("/api/customer/cuenta")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setAparatos(d?.dispositivos || []))
      .catch(() => setAparatos([]));
  }, [esCliente]);

  // Con el teclado se cierra como cualquier cuadro, y con el mando también:
  // «atrás» en un televisor llega como Escape
  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
    };
    window.addEventListener("keydown", alPulsar);
    return () => window.removeEventListener("keydown", alPulsar);
  }, [onCerrar]);

  function olvidarIdioma() {
    try {
      localStorage.removeItem(K_AUDIO);
      localStorage.removeItem(K_SUBS);
    } catch {
      /* almacenamiento bloqueado */
    }
    setAudio("");
    setSubs("");
  }

  async function borrarVistos() {
    await fetch("/api/vistos?todo=1", { method: "DELETE" }).catch(() => {});
    try {
      localStorage.removeItem("xp.vistos.v1");
    } catch {
      /* almacenamiento bloqueado */
    }
    setVistosBorrados(true);
  }

  async function cerrarAparato(a: Aparato) {
    setCerrando(a.llave);
    const res = await fetch(`/api/customer/cuenta?llave=${encodeURIComponent(a.llave)}`, {
      method: "DELETE",
    }).catch(() => null);
    setCerrando("");
    if (res && res.ok) setAparatos((antes) => (antes || []).filter((x) => x.llave !== a.llave));
  }

  /**
   * Probar el proveedor desde el servidor.
   *
   * Distingue los dos fallos que por fuera se ven idénticos: que el
   * proveedor no conteste a nuestro servidor —bloquea las IPs de centros de
   * datos— o que conteste perfectamente y lo que no puede sea este aparato.
   * Sin esto, las dos cosas se cuentan igual: «no se ve».
   */
  const probar = useCallback(async () => {
    setProbando(true);
    setVeredicto("");
    try {
      const r = await fetch("/api/diag/proveedor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(creds || {}),
      }).then((x) => x.json());
      setVeredicto(r.veredicto || "No se pudo comprobar ahora mismo. Inténtalo en un minuto.");
    } catch {
      setVeredicto("No se pudo comprobar ahora mismo. Inténtalo en un minuto.");
    } finally {
      setProbando(false);
    }
  }, [creds]);

  useEffect(() => {
    if (veredicto) elVeredicto.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [veredicto]);

  const nombreIdioma = (v: string) => (v === SIN_SUBS ? "Sin subtítulos" : v);

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onCerrar()}>
      <div className="modal pa-ajustes" role="dialog" aria-modal="true" aria-label="Ajustes">
        <button className="ficha-cerrar" onClick={onCerrar} aria-label="Cerrar">
          <Icon name="cerrar" size={18} />
        </button>
        <h2>Ajustes</h2>
        <p className="modal-sub">Lo tuyo, en {marca}.</p>

        <section className="ajustes-bloque">
          <h3><Icon name="subtitulos" size={16} /> Idioma</h3>
          {audio || subs ? (
            <>
              <p className="ajustes-dato">
                {audio && <span>Audio: <b>{nombreIdioma(audio)}</b></span>}
                {subs && <span>Subtítulos: <b>{nombreIdioma(subs)}</b></span>}
              </p>
              <p className="ajustes-pie">
                Cada vídeo se pone solo en lo último que elegiste.
              </p>
              <button className="btn btn-ghost btn-sm" onClick={olvidarIdioma}>
                Olvidar y volver a preguntar
              </button>
            </>
          ) : (
            <p className="ajustes-pie">
              Todavía no has elegido idioma en ningún vídeo. Cuando lo hagas, el resto se pondrá
              igual.
            </p>
          )}
        </section>

        <section className="ajustes-bloque">
          <h3><Icon name="clock" size={16} /> Seguir viendo</h3>
          {vistosBorrados ? (
            <p className="ajustes-pie">Borrado. La fila desaparecerá al volver a entrar.</p>
          ) : (
            <>
              <p className="ajustes-pie">
                Guardamos por dónde ibas para que puedas seguir donde lo dejaste, también desde
                otro aparato.
              </p>
              <button className="btn btn-ghost btn-sm" onClick={borrarVistos}>
                Borrar lo que llevo visto
              </button>
            </>
          )}
        </section>

        {esCliente && (
          <section className="ajustes-bloque">
            <h3><Icon name="device" size={16} /> Aparatos</h3>
            {aparatos === null ? (
              <p className="ajustes-pie">Mirando…</p>
            ) : aparatos.length === 0 ? (
              <p className="ajustes-pie">No hay ninguno abierto ahora mismo.</p>
            ) : (
              <ul className="ajustes-aparatos">
                {aparatos.map((a) => (
                  <li key={a.llave || a.id}>
                    <span className="ajustes-aparato-que">
                      <b>{PLATAFORMA[a.plataforma] || a.nombre}</b>
                      <span>{haceCuanto(a.visto)}</span>
                    </span>
                    <button
                      className="btn btn-ghost btn-sm"
                      disabled={cerrando === a.llave}
                      onClick={() => cerrarAparato(a)}
                    >
                      {cerrando === a.llave ? "Cerrando…" : "Cerrar"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {/* Que cerrar el de aquí te echa a ti: dicho antes y no después */}
            <p className="ajustes-pie">
              Cerrar uno libera su sitio. Si cierras este, tendrás que volver a entrar.
            </p>
          </section>
        )}

        <section className="ajustes-bloque">
          <h3><Icon name="antena" size={16} /> Conexión</h3>
          <p className="ajustes-pie">
            Si algo no se ve, esto dice quién falla: tu proveedor o este aparato.
          </p>
          <button className="btn btn-ghost btn-sm" onClick={probar} disabled={probando}>
            {probando ? "Comprobando…" : "Comprobar mi conexión"}
          </button>
          {veredicto && <p className="ajustes-veredicto" ref={elVeredicto}>{veredicto}</p>}
        </section>

        {soporte && (
          <p className="ajustes-soporte">
            ¿Sigue sin ir? Escribe a <strong>{soporte}</strong>
          </p>
        )}
      </div>
    </div>
  );
}
