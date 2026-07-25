import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import AuthForm from "@/components/AuthForm";

export const metadata: Metadata = {
  title: "Crear cuenta gratis",
  description:
    "Regístrate gratis en TOTALplayer y sincroniza tus listas M3U y Xtream Codes en todos tus dispositivos.",
  alternates: { canonical: "/registro" },
};

export default function RegisterPage() {
  return (
    <>
      <SiteHeader />
      <AuthForm mode="register" />
    </>
  );
}
