import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import AccessChooser from "@/components/AccessChooser";

export const metadata: Metadata = {
  title: "Entrar — clientes y proveedores",
  description:
    "Entra con el usuario y la contraseña que te dio tu proveedor y ve tu lista al instante, o accede a tu panel de proveedor.",
  alternates: { canonical: "/acceso" },
};

export default async function AccesoPage({
  searchParams,
}: {
  searchParams: Promise<{ rol?: string }>;
}) {
  const { rol } = await searchParams;
  return (
    <>
      <SiteHeader />
      <AccessChooser initial={rol === "proveedor" ? "proveedor" : "cliente"} />
    </>
  );
}
