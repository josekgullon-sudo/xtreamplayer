import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import AuthForm from "@/components/AuthForm";

export const metadata: Metadata = {
  title: "Inicia sesión",
  description: "Entra en tu cuenta de TOTALplayer y recupera tus listas sincronizadas.",
  alternates: { canonical: "/login" },
};

/**
 * Acceso con cuenta propia de TOTALplayer.
 *
 * Esto redirigía a /acceso, donde solo se entra como cliente de un proveedor
 * o como proveedor. Quien se registró en /registro —incluida la cuenta que
 * atiende el soporte en /admin— no tenía ninguna puerta de vuelta: creaba la
 * cuenta y, en cuanto caducaba la sesión, se quedaba fuera para siempre.
 */
export default function LoginPage() {
  return (
    <>
      <SiteHeader />
      <AuthForm mode="login" />
    </>
  );
}
