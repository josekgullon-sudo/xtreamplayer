import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import RecuperarForm from "@/components/RecuperarForm";

export const metadata: Metadata = {
  title: "Recuperar tu contraseña",
  description: "Te mandamos un enlace por correo para elegir una contraseña nueva.",
  alternates: { canonical: "/recuperar" },
  robots: { index: false, follow: false },
};

export default function RecuperarPage() {
  return (
    <>
      <SiteHeader />
      <RecuperarForm />
    </>
  );
}
