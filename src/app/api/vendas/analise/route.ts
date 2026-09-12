import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { fetchConversions } from "@/lib/shopee-sales";
import { normalize } from "@/lib/normalize";
import type { AffiliateSaleRow } from "@/lib/affiliate-sales";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Src = "shopee" | "ml" | "amazon";
interface Cell { units: number; commission: number; gmv: number; }
const zero = (): Cell => ({ units: 0, commission: 0, gmv: 0 });

// GET /api/vendas/analise?days=30  (days=0 => hoje)
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const daysParam = searchParams.get("days");
  const hoje = daysParam === "0" || daysParam === "hoje";
  const days = hoje ? 1 : Math.min(Math.max(parseInt(daysParam || "30", 10) || 30, 1), 180);
  const end = Math.floor(Date.now() / 1000);
  // início: hoje = 00:00 BRT de hoje; senão N dias atrás
  let start: number;
  if (hoje) {
    const d = new Date(Date.now() - 3 * 3600 * 1000); // BRT
    start = Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 1000) + 3 * 3600;
  } else {
    start = end - days * 86400;
  }
  const startIso = new Date(start * 1000).toISOString();
  const endIso = new Date(end * 1000).toISOString();

  // bucket: produto normalizado -> {category, plat, total}
  const buckets = new Map<string, { product: string; category: string; plat: Record<Src, Cell>; tot: Cell }>();
  const catMap = new Map<string, Cell>();
  const errors: Record<string, string> = {};

  const add = (src: Src, nameRaw: string | null, nativeCat: string | null, units: number, commission: number, gmv: number) => {
    const { product, category } = normalize(nameRaw, nativeCat);
    const key = product + "|" + category;
    let b = buckets.get(key);
    if (!b) { b = { product, category, plat: { shopee: zero(), ml: zero(), amazon: zero() }, tot: zero() }; buckets.set(key, b); }
    b.plat[src].units += units; b.plat[src].commission += commission; b.plat[src].gmv += gmv;
    b.tot.units += units; b.tot.commission += commission; b.tot.gmv += gmv;
    const c = catMap.get(category) ?? zero(); c.units += units; c.commission += commission; c.gmv += gmv; catMap.set(category, c);
  };

  // Shopee (ao vivo)
  const appId = process.env.SHOPEE_APP_ID, secret = process.env.SHOPEE_APP_SECRET;
  if (appId && secret) {
    try {
      const conv = await fetchConversions(appId, secret, start, end);
      for (const c of conv) for (const it of c.items) add("shopee", it.name, it.category, it.qty, it.commission, it.price * it.qty);
    } catch (e) { errors.shopee = e instanceof Error ? e.message : String(e); }
  } else errors.shopee = "sem credenciais";

  // ML (janela por sold_at) + Amazon (snapshot inteiro)
  try {
    const { data: mlRows } = await supabase.from("affiliate_sales").select("*").eq("source", "ml").gte("sold_at", startIso).lte("sold_at", endIso).limit(5000);
    for (const r of (mlRows ?? []) as AffiliateSaleRow[]) add("ml", r.product_name, r.category, Number(r.units) || 0, Number(r.commission) || 0, Number(r.gross_value) || 0);
  } catch (e) { errors.ml = e instanceof Error ? e.message : String(e); }
  try {
    const { data: azRows } = await supabase.from("affiliate_sales").select("*").eq("source", "amazon").limit(5000);
    for (const r of (azRows ?? []) as AffiliateSaleRow[]) add("amazon", r.product_name, r.category, Number(r.units) || 0, Number(r.commission) || 0, Number(r.gross_value) || 0);
  } catch (e) { errors.amazon = e instanceof Error ? e.message : String(e); }

  const produtos = [...buckets.values()].sort((a, b) => b.tot.commission - a.tot.commission);
  const categorias = [...catMap.entries()].map(([category, v]) => ({ category, ...v })).sort((a, b) => b.commission - a.commission);
  const tot = produtos.reduce((a, b) => ({ units: a.units + b.tot.units, commission: a.commission + b.tot.commission, gmv: a.gmv + b.tot.gmv }), zero());
  const naoClass = produtos.filter(p => p.category === "Outros").reduce((a, b) => a + b.tot.commission, 0);

  return NextResponse.json({
    period: { days: hoje ? 0 : days, hoje },
    kpis: { ...tot, classificadoPct: tot.commission ? 100 * (1 - naoClass / tot.commission) : 100 },
    produtos: produtos.slice(0, 60),
    categorias,
    errors,
  });
}
