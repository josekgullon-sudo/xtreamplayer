import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import CustomerLoginForm from "@/components/CustomerLoginForm";

export const metadata: Metadata = {
  title: "Acceso con usuario y contraseña",
  description:
    "Entra con el usuario y la contraseña que te dio tu proveedor y ve tu lista al instante, sin configurar nada.",
  alternates: { canonical: "/acceso" },
};

export default function AccesoPage() {
  return (
    <>
      <SiteHeader />
      <CustomerLoginForm />
    </>
  );
}
