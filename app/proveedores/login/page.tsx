import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import ProviderAuthForm from "@/components/provider/ProviderAuthForm";

export const metadata: Metadata = {
  title: "Acceso para proveedores IPTV",
  description: "Entra a tu panel de proveedor para gestionar tus clientes y tu plan.",
  alternates: { canonical: "/proveedores/login" },
};

export default function ProviderLoginPage() {
  return (
    <>
      <SiteHeader />
      <ProviderAuthForm mode="login" />
    </>
  );
}
