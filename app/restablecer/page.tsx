import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import RestablecerForm from "@/components/RestablecerForm";

export const metadata: Metadata = {
  title: "Elige tu contraseña nueva",
  alternates: { canonical: "/restablecer" },
  // Un enlace de recuperación no tiene que acabar en ningún buscador
  robots: { index: false, follow: false },
};

export default function RestablecerPage() {
  return (
    <>
      <SiteHeader />
      <RestablecerForm />
    </>
  );
}
