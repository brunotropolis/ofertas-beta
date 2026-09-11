import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { fetchConversions, aggregate, type SalesAggregate } from "@/lib/shopee-sales";
import { aggregateRows, type AffiliateSaleRow } from "@/lib/affiliate-sales";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface SourceResult {
  ok: boolean;
  error?: string;
  live?: boolean;
  lastSync?: string | null;
  agg?: SalesAggregate;
}

// GET /api/vendas?days=30 → resultados de afiliado das 3 fontes.
//   Shopee: ao vivo (API oficial). ML/Amazon: lidos da tabela affiliate_sales
//   (alimentada pelo coletor /vendas-sync via Chrome).
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const days = Math.min(Math.max(parseInt(searchParams.get("days") || "30", 10) || 30, 1), 180);
  const end = Math.floor(Date.now() / 1000);
  const start = end - days * 86400;
  const startIso = new Date(start * 1000).toISOString();
  const endIso = new Date(end * 1000).toISOString();

  const sources: Record<"shopee" | "ml" | "amazon", SourceResult> = {
    shopee: { ok: false, live: true },
    ml: { ok: false },
    amazon: { ok: false },
  };

  // ── Shopee (ao vivo) ──────────────────────────────────────────────────────
  const appId = process.env.SHOPEE_APP_ID;
  const secret = process.env.SHOPEE_APP_SECRET;
  if (!appId || !secret) {
    sources.shopee.error = "Credenciais Shopee não configuradas (SHOPEE_APP_ID/SECRET)";
  } else {
    try {
      const conversions = await fetchConversions(appId, secret, start, end);
      sources.shopee = { ok: true, live: true, agg: aggregate(conversions) };
    } catch (err) {
      sources.shopee.error = err instanceof Error ? err.message : String(err);
    }
  }

  // ── ML e Amazon (tabela affiliate_sales) ──────────────────────────────────
  await Promise.all(
    (["ml", "amazon"] as const).map(async (src) => {
      try {
        const { data, error } = await supabase
          .from("affiliate_sales")
          .select("*")
          .eq("source", src)
          .gte("sold_at", startIso)
          .lte("sold_at", endIso)
          .order("sold_at", { ascending: false })
          .limit(5000);
        if (error) throw new Error(error.message);
        const rows = (data ?? []) as AffiliateSaleRow[];
        const lastSync = rows.length
          // synced_at vem no select *; pega o mais recente
          ? rows.reduce<string | null>((acc, r) => {
              const s = (r as unknown as { synced_at?: string }).synced_at ?? null;
              return s && (!acc || s > acc) ? s : acc;
            }, null)
          : null;
        sources[src] = {
          ok: true,
          lastSync,
          agg: aggregateRows(rows, src === "ml" ? "sale" : "daily"),
        };
      } catch (err) {
        sources[src] = { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    })
  );

  // ── Combinado (soma o que deu certo) ──────────────────────────────────────
  const combined = { commission: 0, conversions: 0, items: 0, gmv: 0 };
  for (const s of Object.values(sources)) {
    if (s.ok && s.agg) {
      combined.commission += s.agg.kpis.commission;
      combined.conversions += s.agg.kpis.conversions;
      combined.items += s.agg.kpis.items;
      combined.gmv += s.agg.kpis.gmv;
    }
  }

  return NextResponse.json({ period: { days, from: start, to: end }, sources, combined });
}
