import { NextRequest } from "next/server";
import { getDb, ProviderDomainRow } from "@/lib/db";
import { providerFromBearer, apiError } from "@/lib/apiKey";

export const dynamic = "force-dynamic";

/** API pública v1 — dominios configurados, para usarlos como domainId en las altas. */
export async function GET(req: NextRequest) {
  const provider = providerFromBearer(req.headers.get("authorization"));
  if (!provider) return apiError("Clave de API inválida o revocada", 401);

  const rows = getDb()
    .prepare("SELECT * FROM provider_domains WHERE provider_id = ? ORDER BY created_at ASC")
    .all(provider.id) as ProviderDomainRow[];

  return Response.json({
    data: rows.map((d) => ({ id: d.id, label: d.label, host: d.host, port: d.port, protocol: d.protocol })),
  });
}
