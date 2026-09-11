import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { fetchConversions, aggregate } from "@/lib/shopee-sales";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /api/vendas?days=30  → resultados de venda de afiliado (Shopee por ora)
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const days = Math.min(Math.max(parseInt(searchParams.get("days") || "30", 10) || 30, 1), 180);
  const end = Math.floor(Date.now() / 1000);
  const start = end - days * 86400;

  const appId = process.env.SHOPEE_APP_ID;
  const secret = process.env.SHOPEE_APP_SECRET;

  const result: {
    period: { days: number; from: number; to: number };
    shopee: { ok: boolean; error?: string; agg?: ReturnType<typeof aggregate> };
  } = {
    period: { days, from: start, to: end },
    shopee: { ok: false },
  };

  if (!appId || !secret) {
    result.shopee = { ok: false, error: "Credenciais Shopee não configuradas (SHOPEE_APP_ID/SECRET)" };
    return NextResponse.json(result);
  }

  try {
    const conversions = await fetchConversions(appId, secret, start, end);
    result.shopee = { ok: true, agg: aggregate(conversions) };
  } catch (err) {
    result.shopee = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  return NextResponse.json(result);
}
