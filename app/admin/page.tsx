import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import AdminPanel from "@/components/admin/AdminPanel";

export const metadata: Metadata = {
  title: "Administración — TOTALplayer",
  robots: { index: false, follow: false },
};

/*
 * Con cabecera, como el panel del proveedor: el menú lateral se queda
 * pegado bajo ella al bajar (top: var(--header-h)), y sin cabecera esa
 * reserva dejaba la tira de secciones tapando el título en el móvil.
 */
export default function AdminPage() {
  return (
    <>
      <SiteHeader />
      <AdminPanel />
    </>
  );
}
