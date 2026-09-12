import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { fetchConversions } from "@/lib/shopee-sales";
import { normalize } from "@/lib/normalize";
import type { AffiliateSaleRow } from "@/lib/affiliate-sales";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Src = "shopee" | "ml" | "amazon";
interface Cell { units: number; commission: number; gmv: number; ads: number; }
const zero = (): Cell => ({ units: 0, commission: 0, gmv: 0, ads: 0 });
const SRCS: Src[] = ["shopee", "ml", "amazon"];

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
  let start: number;
  if (hoje) {
    const d = new Date(Date.now() - 3 * 3600 * 1000);
    start = Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 1000) + 3 * 3600;
  } else start = end - days * 86400;
  const startIso = new Date(start * 1000).toISOString();
  const endIso = new Date(end * 1000).toISOString();

  const buckets = new Map<string, { product: string; category: string; plat: Record<Src, Cell>; tot: Cell }>();
  const catMap = new Map<string, Cell>();
  const platTot: Record<Src, Cell> = { shopee: zero(), ml: zero(), amazon: zero() };
  const errors: Record<string, string> = {};

  const bucket = (product: string, category: string) => {
    const key = product + "|" + category;
    let b = buckets.get(key);
    if (!b) { b = { product, category, plat: { shopee: zero(), ml: zero(), amazon: zero() }, tot: zero() }; buckets.set(key, b); }
    return b;
  };
  const addSale = (src: Src, nameRaw: string | null, nativeCat: string | null, units: number, commission: number, gmv: number) => {
    const { product, category } = normalize(nameRaw, nativeCat);
    const b = bucket(product, category);
    b.plat[src].units += units; b.plat[src].commission += commission; b.plat[src].gmv += gmv;
    b.tot.units += units; b.tot.commission += commission; b.tot.gmv += gmv;
    platTot[src].units += units; platTot[src].commission += commission; platTot[src].gmv += gmv;
    const c = catMap.get(category) ?? zero(); c.units += units; c.commission += commission; c.gmv += gmv; catMap.set(category, c);
  };
  const addAd = (src: Src, nameRaw: string | null) => {
    const { product, category } = normalize(nameRaw, null);
    const b = bucket(product, category);
    b.plat[src].ads += 1; b.tot.ads += 1; platTot[src].ads += 1;
  };

  // Shopee (ao vivo)
  const appId = process.env.SHOPEE_APP_ID, secret = process.env.SHOPEE_APP_SECRET;
  if (appId && secret) {
    try {
      const conv = await fetchConversions(appId, secret, start, end);
      for (const c of conv) for (const it of c.items) addSale("shopee", it.name, it.category, it.qty, it.commission, it.price * it.qty);
    } catch (e) { errors.shopee = e instanceof Error ? e.message : String(e); }
  } else errors.shopee = "sem credenciais";

  // ML (janela) + Amazon (snapshot)
  try {
    const { data } = await supabase.from("affiliate_sales").select("*").eq("source", "ml").gte("sold_at", startIso).lte("sold_at", endIso).limit(5000);
    for (const r of (data ?? []) as AffiliateSaleRow[]) addSale("ml", r.product_name, r.category, Number(r.units) || 0, Number(r.commission) || 0, Number(r.gross_value) || 0);
  } catch (e) { errors.ml = e instanceof Error ? e.message : String(e); }
  try {
    const { data } = await supabase.from("affiliate_sales").select("*").eq("source", "amazon").limit(5000);
    for (const r of (data ?? []) as AffiliateSaleRow[]) addSale("amazon", r.product_name, r.category, Number(r.units) || 0, Number(r.commission) || 0, Number(r.gross_value) || 0);
  } catch (e) { errors.amazon = e instanceof Error ? e.message : String(e); }

  // Anúncios (grupo WhatsApp) — janela por posted_at
  try {
    const { data } = await supabase.from("anuncios").select("platform,product_raw,posted_at").gte("posted_at", startIso).lte("posted_at", endIso).limit(10000);
    for (const a of (data ?? []) as { platform: string; product_raw: string }[]) {
      if ((SRCS as string[]).includes(a.platform)) addAd(a.platform as Src, a.product_raw);
    }
  } catch (e) { errors.anuncios = e instanceof Error ? e.message : String(e); }

  const produtos = [...buckets.values()].sort((a, b) => b.tot.commission - a.tot.commission);
  const categorias = [...catMap.entries()].map(([category, v]) => ({ category, ...v })).sort((a, b) => b.commission - a.commission);
  const tot = produtos.reduce((a, b) => ({ units: a.units + b.tot.units, commission: a.commission + b.tot.commission, gmv: a.gmv + b.tot.gmv, ads: a.ads + b.tot.ads }), zero());
  const naoClass = produtos.filter(p => p.category === "Outros").reduce((a, b) => a + b.tot.commission, 0);

  // Eficiência por plataforma (vendas ÷ anúncios) — seção 9 da analise-comissao
  const eficiencia = SRCS.map(s => ({
    source: s, ads: platTot[s].ads, units: platTot[s].units, commission: platTot[s].commission,
    vdPorAd: platTot[s].ads ? platTot[s].units / platTot[s].ads : null,
  }));

  // Oportunidades: vende ≥10 un e anuncia ≤3 no período (ordenado por vendas)
  const oportunidades = produtos
    .filter(p => p.tot.units >= 10 && p.tot.ads <= 3 && p.category !== "Outros")
    .map(p => ({ product: p.product, category: p.category, units: p.tot.units, commission: p.tot.commission, ads: p.tot.ads }))
    .sort((a, b) => b.units - a.units).slice(0, 30);

  return NextResponse.json({
    period: { days: hoje ? 0 : days, hoje },
    kpis: { ...tot, classificadoPct: tot.commission ? 100 * (1 - naoClass / tot.commission) : 100 },
    produtos: produtos.slice(0, 200),
    categorias,
    eficiencia,
    oportunidades,
    errors,
  });
}
