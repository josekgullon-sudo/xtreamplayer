import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import CustomerAccount from "@/components/CustomerAccount";

export const metadata: Metadata = {
  title: "Mi cuenta",
  description: "Tu acceso, tus dispositivos y el contacto de tu proveedor.",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

export default function MiCuentaPage() {
  return (
    <>
      <SiteHeader />
      <CustomerAccount />
    </>
  );
}
