import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import ActivarTv from "@/components/ActivarTv";

export const metadata: Metadata = {
  title: "Activar mi tele",
  description: "Introduce el código que ves en tu televisor para activarlo.",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

export default function ActivarPage() {
  return (
    <>
      <SiteHeader />
      <ActivarTv />
    </>
  );
}
