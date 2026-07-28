"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import LogoAparato, { LogoNombre } from "@/components/LogoAparato";

/**
 * Qué le doy a mi cliente para que lo vea en su tele.
 *
 * El proveedor tenía todo lo necesario —el enlace de su marca, la aplicación
 * de la tele, el código de activación— repartido por cuatro sitios, y lo que
 * acababa mandando por WhatsApp era lo que se acordaba de memoria. Aquí está
 * cada aparato con sus instrucciones ya escritas y un botón de copiar: eso
 * es lo que pega en la conversación.
 */

interface Aparato {
  id: string;
  titulo: string;
  logos: LogoNombre[];
  nombres?: string[];
  /** Las instrucciones tal cual se las manda al cliente */
  texto: (enlace: string, marca: string) => string;
}

const APARATOS: Aparato[] = [
  {
    id: "tv",
    titulo: "Televisor (Android TV, Fire TV, Samsung, LG…)",
    logos: ["android", "google", "fuego"],
    nombres: ["Samsung", "LG"],
    texto: (enlace, marca) =>
      `Para ver ${marca} en la tele:\n\n` +
      `1. Abre el navegador de la tele y entra en:\n   ${enlace}\n` +
      `2. La pantalla te enseñará una MAC y un código de seis letras.\n` +
      `3. Pásame la MAC y te activo la tele, o escribe tú el código desde el móvil.\n\n` +
      `Si ya tienes usuario y contraseña, puedes entrar directamente desde la propia tele.`,
  },
  {
    id: "movil",
    titulo: "Móvil y tablet",
    logos: ["android", "apple"],
    texto: (enlace, marca) =>
      `Para ver ${marca} en el móvil:\n\n` +
      `1. Entra en:\n   ${enlace}\n` +
      `2. Escribe el usuario y la contraseña que te he pasado.\n` +
      `3. iPhone: Compartir → «Añadir a pantalla de inicio».\n` +
      `   Android: menú de los tres puntos → «Instalar aplicación».\n\n` +
      `Queda con su icono y se abre a pantalla completa, como cualquier otra aplicación.`,
  },
  {
    id: "ordenador",
    titulo: "Ordenador",
    logos: ["windows", "apple", "linux"],
    texto: (enlace, marca) =>
      `Para ver ${marca} en el ordenador:\n\n` +
      `1. Entra en:\n   ${enlace}\n` +
      `2. Escribe el usuario y la contraseña que te he pasado.\n\n` +
      `Funciona en cualquier navegador, sin instalar nada.`,
  },
];

export default function AplicacionesSection({ marca, slug }: { marca: string; slug: string }) {
  const [sitio, setSitio] = useState("");
  const [copiado, setCopiado] = useState("");

  useEffect(() => {
    setSitio(window.location.origin);
  }, []);

  /* El enlace de su marca si lo tiene, y si no el de siempre: mandarle al
     cliente una dirección con el nombre de otro es lo que no puede pasar */
  const base = slug ? `${sitio}/m/${slug}` : sitio;
  const enlaceTv = slug ? `${base}/tv` : `${sitio}/tv`;

  async function copiar(id: string, texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(id);
      setTimeout(() => setCopiado(""), 2000);
    } catch {
      /* sin permiso del navegador: el texto está a la vista para copiarlo a mano */
    }
  }

  return (
    <>
      <div className="card factura-fiscales">
        <div>
          <h3>Tu dirección</h3>
          <p className="panel-sub">
            Es la que le das a tus clientes. {slug ? "Lleva tu marca: " : "Sin enlace de marca todavía: "}
            <code className="cred">{base}</code>
          </p>
        </div>
        <a className="btn btn-ghost btn-sm" href={base} target="_blank" rel="noreferrer">
          <Icon name="external" size={14} /> Abrir
        </a>
      </div>

      <div className="apps-lista">
        {APARATOS.map((a) => {
          const texto = a.texto(a.id === "tv" ? enlaceTv : base, marca);
          return (
            <div className="card apps-tarjeta" key={a.id}>
              <div className="marcas">
                {a.logos.map((l, i) => (
                  <span className="marca" key={`${l}${i}`}>
                    <LogoAparato nombre={l} size={17} />
                  </span>
                ))}
                {(a.nombres || []).map((n) => (
                  <span className="marca marca-nombre" key={n}>
                    {n}
                  </span>
                ))}
              </div>
              <h3>{a.titulo}</h3>
              <pre className="apps-texto">{texto}</pre>
              <button className="btn btn-primary btn-sm" onClick={() => copiar(a.id, texto)}>
                <Icon name={copiado === a.id ? "check" : "copy"} size={14} />
                {copiado === a.id ? " Copiado" : " Copiar instrucciones"}
              </button>
            </div>
          );
        })}
      </div>

      {/* Lo que pregunta todo proveedor en cuanto ve que funciona */}
      <div className="card apps-marca">
        <h3>¿Y una aplicación con mi nombre en las tiendas?</h3>
        <p className="panel-sub">
          Se publica con tu marca, tu icono y tu dominio en Android TV, Fire TV, Samsung y LG: tus clientes no
          ven TOTALplayer por ningún lado. En el móvil no hace falta tienda, se instala desde el navegador.
          Escríbenos desde <strong>Soporte</strong> y lo preparamos contigo.
        </p>
        <Link href="/apps" className="btn btn-ghost btn-sm" target="_blank">
          <Icon name="external" size={14} /> Ver cómo queda en cada aparato
        </Link>
      </div>
    </>
  );
}
