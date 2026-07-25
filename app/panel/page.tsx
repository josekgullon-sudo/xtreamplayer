import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import ProviderPanel from "@/components/provider/ProviderPanel";

export const metadata: Metadata = {
  title: "Panel de proveedor",
  description: "Gestiona tus clientes, sus listas y tu plan.",
  robots: { index: false },
};

export default function PanelPage() {
  return (
    <>
      <SiteHeader />
      <ProviderPanel />
    </>
  );
}
