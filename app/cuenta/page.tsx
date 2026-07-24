import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import AccountPanel from "@/components/AccountPanel";

export const metadata: Metadata = {
  title: "Tu cuenta",
  description: "Gestiona tu plan, tu prueba gratuita y tu suscripción Premium de XtreamPlayer.",
  robots: { index: false },
};

export default function AccountPage() {
  return (
    <>
      <SiteHeader />
      <AccountPanel />
    </>
  );
}
