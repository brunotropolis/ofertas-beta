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

interface Bucket { product: string; category: string; plat: Record<Src, Cell>; tot: Cell; exampleName: string; exampleUrl: string | null; }

// posts promocionais que o coletor pega em vez do produto (não são produtos)
const stripDeco = (s: string) => (s || "").replace(/^[^\p{L}\d]+/u, "").trim();
const isNoiseAd = (raw: string) => {
  const t = stripDeco(raw);
  if (t.length < 4) return true;
  if (!/\p{L}/u.test(t)) return true;
  if (/^(por|de|a partir de)\s*:?\s*r?\$?\s*\d/i.test(t)) return true;
  if (/^>?\s*de\s+r\$/i.test(t)) return true;
  if (/^(baixou+|precinho+|corre+|aproveit\w*|promo\w*|imperd\w*|olha (isso|esse|só)|chegou|novidade|dica da day)!*\s*$/i.test(t)) return true;
  return false;
};

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
  if (hoje) { const d = new Date(Date.now() - 3 * 3600 * 1000); start = Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 1000) + 3 * 3600; }
  else start = end - days * 86400;
  const prevStart = start - (end - start); // janela anterior de mesmo tamanho
  const iso = (s: number) => new Date(s * 1000).toISOString();

  const buckets = new Map<string, Bucket>();
  const catMap = new Map<string, Cell>();
  const platTot: Record<Src, Cell> = { shopee: zero(), ml: zero(), amazon: zero() };
  const errors: Record<string, string> = {};
  // variação: unidades por produto normalizado, janela atual vs anterior (ML — rápido/tem data)
  const curUnits = new Map<string, number>();
  const prevUnits = new Map<string, number>();

  const bucket = (product: string, category: string): Bucket => {
    const key = product + "|" + category;
    let b = buckets.get(key);
    if (!b) { b = { product, category, plat: { shopee: zero(), ml: zero(), amazon: zero() }, tot: zero(), exampleName: product, exampleUrl: null }; buckets.set(key, b); }
    return b;
  };
  const addSale = (src: Src, nameRaw: string | null, nativeCat: string | null, units: number, commission: number, gmv: number) => {
    const { product, category } = normalize(nameRaw, nativeCat);
    const b = bucket(product, category);
    if (nameRaw && (b.exampleName === product || !b.exampleName)) b.exampleName = nameRaw;
    b.plat[src].units += units; b.plat[src].commission += commission; b.plat[src].gmv += gmv;
    b.tot.units += units; b.tot.commission += commission; b.tot.gmv += gmv;
    platTot[src].units += units; platTot[src].commission += commission; platTot[src].gmv += gmv;
    const c = catMap.get(category) ?? zero(); c.units += units; c.commission += commission; c.gmv += gmv; catMap.set(category, c);
    if (src === "ml") curUnits.set(product, (curUnits.get(product) ?? 0) + units); // variação = ML-only (mesma base da janela anterior)
  };
  const addAd = (src: Src, nameRaw: string | null, url: string | null) => {
    const { product, category } = normalize(nameRaw, null);
    const b = bucket(product, category);
    b.plat[src].ads += 1; b.tot.ads += 1; platTot[src].ads += 1;
    if (!b.exampleUrl && url) b.exampleUrl = url;
  };

  // Shopee (ao vivo)
  const appId = process.env.SHOPEE_APP_ID, secret = process.env.SHOPEE_APP_SECRET;
  if (appId && secret) {
    try { const conv = await fetchConversions(appId, secret, start, end); for (const c of conv) for (const it of c.items) addSale("shopee", it.name, it.category, it.qty, it.commission, it.price * it.qty); }
    catch (e) { errors.shopee = e instanceof Error ? e.message : String(e); }
  } else errors.shopee = "sem credenciais";

  // ML janela atual + Amazon snapshot
  try { const { data } = await supabase.from("affiliate_sales").select("*").eq("source", "ml").gte("sold_at", iso(start)).lte("sold_at", iso(end)).limit(5000); for (const r of (data ?? []) as AffiliateSaleRow[]) addSale("ml", r.product_name, r.category, Number(r.units) || 0, Number(r.commission) || 0, Number(r.gross_value) || 0); }
  catch (e) { errors.ml = e instanceof Error ? e.message : String(e); }
  try { const { data } = await supabase.from("affiliate_sales").select("*").eq("source", "amazon").limit(5000); for (const r of (data ?? []) as AffiliateSaleRow[]) addSale("amazon", r.product_name, r.category, Number(r.units) || 0, Number(r.commission) || 0, Number(r.gross_value) || 0); }
  catch (e) { errors.amazon = e instanceof Error ? e.message : String(e); }

  // ML janela anterior (só p/ variação)
  if (!hoje) try {
    const { data } = await supabase.from("affiliate_sales").select("product_name,category,units").eq("source", "ml").gte("sold_at", iso(prevStart)).lt("sold_at", iso(start)).limit(5000);
    for (const r of (data ?? []) as AffiliateSaleRow[]) { const { product } = normalize(r.product_name, r.category); prevUnits.set(product, (prevUnits.get(product) ?? 0) + (Number(r.units) || 0)); }
  } catch { /* variação opcional */ }

  // Anúncios (todos os grupos) — dedup por link+dia (o dispatcher cross-posta a mesma oferta)
  try {
    const { data } = await supabase.from("anuncios").select("platform,product_raw,url,posted_at,group_name").gte("posted_at", iso(start)).lte("posted_at", iso(end)).limit(20000);
    const seen = new Set<string>();
    for (const a of (data ?? []) as { platform: string; product_raw: string; url: string; posted_at: string; group_name: string }[]) {
      if (!(SRCS as string[]).includes(a.platform)) continue;
      if (/cupo|cupom|cupons/i.test(a.group_name || "") || /cupo|cupom|cupons|desconto no app/i.test(a.product_raw || "")) continue; // cupom não é produto
      if (isNoiseAd(a.product_raw)) continue; // post promocional/preço não é produto
      const day = (a.posted_at || "").slice(0, 10);
      const k = (a.url || a.product_raw) + "|" + day;
      if (seen.has(k)) continue; seen.add(k);
      addAd(a.platform as Src, stripDeco(a.product_raw), a.url);
    }
  } catch (e) { errors.anuncios = e instanceof Error ? e.message : String(e); }

  const champ = (b: Bucket): Src | null => { let best: Src | null = null, m = 0; for (const s of SRCS) if (b.plat[s].units > m) { m = b.plat[s].units; best = s; } return best; };

  // "Outros (Amazon — baixo volume)" é o agregado que a AMAZON não detalha (suprime baixo volume).
  // Não é um produto nosso — sai dos rankings e vira rodapé, mas continua no total (comissão real).
  const isAgg = (b: Bucket) => /^Outros \(Amazon/i.test(b.product);
  const produtosAll = [...buckets.values()].sort((a, b) => b.tot.commission - a.tot.commission);
  const amazonOcultos = produtosAll.filter(isAgg).reduce((a, b) => ({ units: a.units + b.tot.units, commission: a.commission + b.tot.commission, gmv: a.gmv + b.tot.gmv }), { units: 0, commission: 0, gmv: 0 });
  const produtos = produtosAll.filter(b => !isAgg(b));
  const tot = produtosAll.reduce((a, b) => ({ units: a.units + b.tot.units, commission: a.commission + b.tot.commission, gmv: a.gmv + b.tot.gmv, ads: a.ads + b.tot.ads }), zero());
  // categorias: tira o agregado Amazon do "Outros" (deixa só os não-classificados reais)
  const catArr = [...catMap.entries()].map(([category, v]) => ({ category, units: v.units, commission: v.commission, gmv: v.gmv, ads: v.ads }));
  const outroC = catArr.find(c => c.category === "Outros");
  if (outroC) { outroC.units -= amazonOcultos.units; outroC.commission -= amazonOcultos.commission; outroC.gmv -= amazonOcultos.gmv; }
  const categorias = catArr.filter(c => c.commission > 0.5 || c.units > 0).sort((a, b) => b.commission - a.commission);
  const naoClass = outroC && outroC.commission > 0 ? outroC.commission : 0;

  const eficiencia = SRCS.map(s => ({
    source: s, ads: platTot[s].ads, units: platTot[s].units, commission: platTot[s].commission,
    vdPorAd: platTot[s].ads ? platTot[s].units / platTot[s].ads : null,
    shareVendas: tot.units ? (platTot[s].units / tot.units) * 100 : 0,
  })).sort((a, b) => (b.vdPorAd ?? -1) - (a.vdPorAd ?? -1)); // maior conversão primeiro

  const topAnunciados = produtos.filter(p => p.tot.ads > 0)
    .map(p => ({ product: p.product, category: p.category, ads: p.tot.ads, units: p.tot.units, commission: p.tot.commission, vdPorAd: p.tot.ads ? p.tot.units / p.tot.ads : null }))
    .sort((a, b) => b.ads - a.ads).slice(0, 15);

  const oportunidades = produtos.filter(p => p.tot.units >= 10 && p.tot.ads <= 3 && p.category !== "Outros")
    .map(p => ({ product: p.product, category: p.category, units: p.tot.units, commission: p.tot.commission, ads: p.tot.ads, campea: champ(p), exampleName: p.exampleName, exampleUrl: p.exampleUrl }))
    .sort((a, b) => b.units - a.units).slice(0, 100);

  const variacao = [...new Set([...curUnits.keys(), ...prevUnits.keys()])]
    .map(product => ({ product, atual: curUnits.get(product) ?? 0, anterior: prevUnits.get(product) ?? 0, delta: (curUnits.get(product) ?? 0) - (prevUnits.get(product) ?? 0) }))
    .filter(v => v.product !== "(não classificado)" && (v.atual >= 3 || v.anterior >= 3));
  const subiram = [...variacao].sort((a, b) => b.delta - a.delta).slice(0, 8);
  const cairam = [...variacao].sort((a, b) => a.delta - b.delta).slice(0, 8);

  return NextResponse.json({
    period: { days: hoje ? 0 : days, hoje },
    kpis: { ...tot, classificadoPct: tot.commission ? 100 * (1 - naoClass / tot.commission) : 100 },
    produtos: produtos.slice(0, 200),
    categorias, eficiencia, topAnunciados, oportunidades,
    variacao: { subiram, cairam },
    amazonOcultos,
    errors,
  });
}
