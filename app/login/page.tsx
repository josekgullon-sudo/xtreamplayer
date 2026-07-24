import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import AuthForm from "@/components/AuthForm";

export const metadata: Metadata = {
  title: "Iniciar sesión",
  description: "Accede a tu cuenta de XtreamPlayer para ver tus listas IPTV sincronizadas.",
  alternates: { canonical: "/login" },
};

export default function LoginPage() {
  return (
    <>
      <SiteHeader />
      <AuthForm mode="login" />
    </>
  );
}
