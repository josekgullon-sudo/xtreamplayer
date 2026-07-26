import { NextRequest } from "next/server";
import { providerFromBearer, apiError } from "@/lib/apiKey";
import { getProviderStatus } from "@/lib/provider";

export const dynamic = "force-dynamic";

/**
 * API pública v1 — identidad y estado del plan.
 * Autenticación: cabecera `Authorization: Bearer tp_…`.
 */
export async function GET(req: NextRequest) {
  const provider = providerFromBearer(req.headers.get("authorization"));
  if (!provider) return apiError("Clave de API inválida o revocada", 401);

  const status = getProviderStatus(provider);
  return Response.json({
    provider: {
      email: provider.email,
      company: provider.company,
      plan: status.planName,
      planActive: status.active,
      customers: { used: status.usedCustomers, max: status.maxCustomers },
    },
  });
}
