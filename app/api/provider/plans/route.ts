import { NextResponse } from "next/server";
import { listPlans } from "@/lib/provider";

/** Catálogo público de planes para proveedores. */
export async function GET() {
  const plans = listPlans().map((p) => ({
    id: p.id,
    name: p.name,
    priceMonth: p.price_month / 100,
    maxCustomers: p.max_customers,
    pricePerCustomer: Number((p.price_month / 100 / p.max_customers).toFixed(3)),
  }));
  return NextResponse.json({ plans });
}
