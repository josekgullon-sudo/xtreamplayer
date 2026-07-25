import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDb, ProviderRow } from "@/lib/db";
import { brandingOf, brandCssVars } from "@/lib/branding";
import CustomerLoginForm from "@/components/CustomerLoginForm";

export const dynamic = "force-dynamic";

function findProvider(slug: string): ProviderRow | null {
  const row = getDb()
    .prepare("SELECT * FROM providers WHERE brand_slug = ? AND status = 'active'")
    .get(slug) as ProviderRow | undefined;
  return row ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const provider = findProvider(slug);
  if (!provider) return { title: "No encontrado", robots: { index: false } };

  const brand = brandingOf(provider);
  return {
    title: `${brand.name} — Acceso`,
    description: `Entra con el usuario y la contraseña que te dio ${brand.name} y ve tu lista al instante.`,
    // La página del proveedor no compite en Google con la nuestra
    robots: { index: false, follow: false },
  };
}

/** Acceso con la marca del proveedor: su nombre, su color y su logotipo. */
export default async function BrandedAccessPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const provider = findProvider(slug);
  if (!provider) notFound();

  const brand = brandingOf(provider);
  const vars = brandCssVars(brand.color);

  return (
    <>
      {vars && <style dangerouslySetInnerHTML={{ __html: `:root{${vars}}` }} />}
      <header className="site-header">
        <div className="container">
          <span className="logo">
            {brand.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brand.logo} alt={brand.name} style={{ height: 30, width: "auto", borderRadius: 6 }} />
            ) : (
              <span className="logo-mark">▶</span>
            )}
            {brand.name}
          </span>
        </div>
      </header>
      <CustomerLoginForm brandName={brand.name} support={brand.support} />
    </>
  );
}
