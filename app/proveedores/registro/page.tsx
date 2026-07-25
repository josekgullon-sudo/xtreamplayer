import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import ProviderAuthForm from "@/components/provider/ProviderAuthForm";

export const metadata: Metadata = {
  title: "Alta de proveedor IPTV — 7 días de prueba",
  description:
    "Crea tu cuenta de proveedor en TOTALplayer y ofrece a tus clientes un reproductor listo para usar. 7 días de prueba sin tarjeta.",
  alternates: { canonical: "/proveedores/registro" },
};

export default function ProviderRegisterPage() {
  return (
    <>
      <SiteHeader />
      <ProviderAuthForm mode="register" />
    </>
  );
}
