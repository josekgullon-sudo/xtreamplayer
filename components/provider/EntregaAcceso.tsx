"use client";

import { useState } from "react";
import Icon from "@/components/Icon";

/**
 * Entregar el acceso al cliente sin copiarlo a mano.
 *
 * El proveedor daba de alta y se quedaba con un usuario y una contraseña en
 * pantalla que tenía que teclear en WhatsApp, junto con la dirección de la
 * web y una explicación distinta cada vez. En veinte altas eso son veinte
 * mensajes escritos a mano, y alguno con la contraseña mal copiada.
 *
 * Aquí el mensaje va escrito: se abre WhatsApp o el correo con todo dentro,
 * o se copia al portapapeles para pegarlo donde sea.
 */
export default function EntregaAcceso({
  usuario,
  password,
  marca,
  enlace,
  compacto = false,
}: {
  usuario: string;
  password: string;
  /** Nombre con el que el cliente conoce a su proveedor */
  marca: string;
  /** Su enlace de marca (/m/loquesea) o el acceso general */
  enlace: string;
  compacto?: boolean;
}) {
  const [copiado, setCopiado] = useState(false);

  const mensaje =
    `¡Ya tienes tu acceso a ${marca}!\n\n` +
    `Entra aquí: ${enlace}\n` +
    `Usuario: ${usuario}\n` +
    `Contraseña: ${password}\n\n` +
    `Con esos mismos datos entras en el móvil, en el ordenador y en la tele. ` +
    `Cualquier duda, escríbeme.`;

  async function copiar() {
    try {
      await navigator.clipboard?.writeText(mensaje);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      /* portapapeles bloqueado: quedan WhatsApp y el correo */
    }
  }

  return (
    <div className={`entrega ${compacto ? "compacta" : ""}`}>
      {!compacto && (
        <p className="entrega-previa" aria-label="Mensaje que se enviará">
          {mensaje}
        </p>
      )}
      <div className="entrega-botones">
        <a
          className="btn btn-primary btn-sm"
          href={`https://wa.me/?text=${encodeURIComponent(mensaje)}`}
          target="_blank"
          rel="noreferrer"
        >
          <Icon name="external" size={15} /> Enviar por WhatsApp
        </a>
        <a
          className="btn btn-ghost btn-sm"
          href={`mailto:?subject=${encodeURIComponent(`Tu acceso a ${marca}`)}&body=${encodeURIComponent(mensaje)}`}
        >
          <Icon name="external" size={15} /> Por correo
        </a>
        <button className="btn btn-ghost btn-sm" onClick={copiar}>
          <Icon name={copiado ? "check" : "copy"} size={15} /> {copiado ? "Copiado" : "Copiar mensaje"}
        </button>
      </div>
    </div>
  );
}
