import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getPlanInfo } from "@/lib/plan";
import { stripeConfigured } from "@/lib/stripe";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ user: null });
  return NextResponse.json({
    user: { email: user.email },
    plan: getPlanInfo(user),
    billingEnabled: stripeConfigured(),
  });
}
