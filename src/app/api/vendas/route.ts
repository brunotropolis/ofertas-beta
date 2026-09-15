import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { fetchConversions, aggregate, type SalesAggregate } from "@/lib/shopee-sales";
import { aggregateRows, windowAmazonRows, type AffiliateSaleRow } from "@/lib/affiliate-sales";
import { normalize } from "@/lib/normalize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Src = "shopee" | "ml" | "amazon";

interface VarItem { product: string; atual: number; anterior: number; delta: number }
interface Variacao { basis: string; subiram: VarItem[]; cairam: VarItem[] }
interface AdProduto { product: string; ads: number; units: number; commission: number; conv: number | null; exampleUrl: string | null }
interface Produto { product: string; category: string; units: number; commission: number; gmv: number; clicks: number; ads: number }
interface Funnel { clicks: number; buyers: number; orders: number; gmv: number; commission: number; comm_marketplace: number; comm_seller: number; comm_brand: number; synced_at: string | null }

interface SourceResult {
  ok: boolean;
  error?: string;
  live?: boolean;
  lastSync?: string | null;
  snapshot?: boolean; // Amazon: dado agregado por período (janela aplicada pro-rata via windowAmazonRows)
  period?: { start: string | null; end: string | null };
  agg?: SalesAggregate;
  variacao?: Variacao | null;       // janela atual × anterior (por produto normalizado)
  adsByProduct?: AdProduto[];        // anúncios (grupos WhatsApp) × vendas desta plataforma
  produtos?: Produto[];              // lista normalizada completa (produtos mais vendidos + "ver todos")
  oportunidades?: Produto[];         // vende bem, quase sem anúncio
  funnel?: Funnel | null;            // ML: métricas de conta (cliques→pedidos) da janela — só janelas 7/30/90
}

// posts promocionais que o coletor pega em vez do produto (não são produtos)
const stripDeco = (s: string) => (s || "").replace(/^[^\p{L}\d]+/u, "").trim();
const isNoiseAd = (raw: string) => {
  const t = stripDeco(raw);
  if (t.length < 4) return true;
  if (!/\p{L}/u.test(t)) return true;                                   // sem letras (emoji/número)
  if (/^(por|de|a partir de)\s*:?\s*r?\$?\s*\d/i.test(t)) return true;  // "Por: R$ 26"
  if (/^>?\s*de\s+r\$/i.test(t)) return true;                            // "> De R$ 42"
  if (/^(baixou+|precinho+|corre+|aproveit\w*|promo\w*|imperd\w*|olha (isso|esse|só)|chegou|novidade|dica da day)!*\s*$/i.test(t)) return true;
  return false;
};

interface NormEntry { product: string; category: string; units: number; commission: number; gmv: number; clicks: number }
const isAgg = (p: string) => /^Outros \(Amazon/i.test(p || "");

// PostgREST corta em 1000 linhas por request (mesmo com .limit maior) — paginar SEMPRE,
// com ordem estável, senão linhas somem em silêncio (foi o que escondeu bucket da Amazon).
const PAGE = 1000;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchPaged<T>(make: () => any): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < 100000; from += PAGE) {
    const { data, error } = await make().range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as T[];
    out.push(...batch);
    if (batch.length < PAGE) break;
  }
  return out;
}

// diff de unidades por produto normalizado entre duas janelas
function diffUnits(cur: Map<string, number>, prev: Map<string, number>, basis: string): Variacao {
  const keys = new Set([...cur.keys(), ...prev.keys()]);
  const arr: VarItem[] = [...keys]
    .filter((p) => p && p !== "(não classificado)" && !isAgg(p))
    .map((product) => {
      const atual = cur.get(product) ?? 0;
      const anterior = prev.get(product) ?? 0;
      return { product, atual, anterior, delta: atual - anterior };
    })
    .filter((v) => v.atual >= 2 || v.anterior >= 2);
  return {
    basis,
    subiram: [...arr].filter((v) => v.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 8),
    cairam: [...arr].filter((v) => v.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 8),
  };
}

// GET /api/vendas?days=30 → resultados de afiliado das 3 fontes + variação + anúncios×produto + produtos/oportunidades.
//   Shopee: ao vivo (API oficial). ML/Amazon: lidos da tabela affiliate_sales (via coletor /vendas-sync).
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const days = Math.min(Math.max(parseInt(searchParams.get("days") || "30", 10) || 30, 1), 180);
  const end = Math.floor(Date.now() / 1000);
  const start = end - days * 86400;
  const prevStart = start - days * 86400; // janela anterior de mesmo tamanho
  const startIso = new Date(start * 1000).toISOString();
  const endIso = new Date(end * 1000).toISOString();
  const prevStartIso = new Date(prevStart * 1000).toISOString();

  const sources: Record<Src, SourceResult> = {
    shopee: { ok: false, live: true },
    ml: { ok: false },
    amazon: { ok: false },
  };

  // normaliza um nome cru → { produto, categoria } (mesma taxonomia da aba Análise)
  const norm = (name: string | null, cat: string | null) => normalize(name, cat);

  // funil de conta (cliques→pedidos) da janela — lido de affiliate_metrics (só janelas coletadas 7/30/90)
  const readFunnel = async (src: string): Promise<Funnel | null> => {
    try {
      const { data } = await supabase.from("affiliate_metrics").select("*").eq("source", src).eq("days", days).maybeSingle();
      const m = data as Record<string, unknown> | null;
      if (!m) return null;
      return {
        clicks: Number(m.clicks) || 0, buyers: Number(m.buyers) || 0, orders: Number(m.orders) || 0,
        gmv: Number(m.gmv) || 0, commission: Number(m.commission) || 0,
        comm_marketplace: Number(m.comm_marketplace) || 0, comm_seller: Number(m.comm_seller) || 0, comm_brand: Number(m.comm_brand) || 0,
        synced_at: (m.synced_at as string) ?? null,
      };
    } catch { return null; }
  };

  // ── anúncios da janela (todos os grupos) → por plataforma, dedup link+dia ──
  const adsNorm: Record<Src, Map<string, { ads: number; exampleUrl: string | null }>> = {
    shopee: new Map(), ml: new Map(), amazon: new Map(),
  };
  try {
    const data = await fetchPaged<{ platform: string; product_raw: string; url: string; posted_at: string; group_name: string }>(() =>
      supabase.from("anuncios")
        .select("platform,product_raw,url,posted_at,group_name")
        .gte("posted_at", startIso).lte("posted_at", endIso).order("posted_at").order("msg_id"));
    const seen = new Set<string>();
    for (const a of data) {
      if (a.platform !== "shopee" && a.platform !== "ml" && a.platform !== "amazon") continue;
      if (/cupo|cupom|cupons/i.test(a.group_name || "") || /cupo|cupom|cupons|desconto no app/i.test(a.product_raw || "")) continue;
      if (isNoiseAd(a.product_raw)) continue; // descarta post promocional/preço (não é produto)
      const day = (a.posted_at || "").slice(0, 10);
      const k = (a.url || a.product_raw) + "|" + day;
      if (seen.has(k)) continue; seen.add(k);
      const p = norm(stripDeco(a.product_raw), null).product;
      if (!p || p === "(não classificado)") continue;
      const m = adsNorm[a.platform as Src].get(p) ?? { ads: 0, exampleUrl: null };
      m.ads += 1; if (!m.exampleUrl && a.url) m.exampleUrl = a.url;
      adsNorm[a.platform as Src].set(p, m);
    }
  } catch { /* anúncios opcional */ }

  // deriva produtos / oportunidades / anúncios×produto de um mapa normalizado da plataforma
  const buildOutputs = (src: Src, salesNorm: Map<string, NormEntry>) => {
    const produtos: Produto[] = [...salesNorm.values()]
      .filter((p) => !isAgg(p.product))
      .map((p) => ({ ...p, ads: adsNorm[src].get(p.product)?.ads ?? 0 }))
      .sort((a, b) => b.commission - a.commission)
      .slice(0, 300);
    const oportunidades = produtos
      .filter((p) => p.units >= 10 && p.ads <= 3 && p.category !== "Outros" && p.product !== "(não classificado)")
      .sort((a, b) => b.units - a.units)
      .slice(0, 100);
    const adsByProduct: AdProduto[] = [...adsNorm[src]].map(([product, a]) => {
      const s = salesNorm.get(product);
      return { product, ads: a.ads, units: s?.units ?? 0, commission: s?.commission ?? 0, conv: a.ads ? (s?.units ?? 0) / a.ads : null, exampleUrl: a.exampleUrl };
    }).sort((x, y) => y.ads - x.ads).slice(0, 50);
    return { produtos, oportunidades, adsByProduct };
  };
  const addNorm = (m: Map<string, NormEntry>, name: string | null, cat: string | null, units: number, commission: number, gmv: number, clicks: number) => {
    const { product, category } = norm(name, cat);
    const e = m.get(product) ?? { product, category, units: 0, commission: 0, gmv: 0, clicks: 0 };
    e.units += units; e.commission += commission; e.gmv += gmv; e.clicks += clicks;
    m.set(product, e);
  };

  // ── Shopee (ao vivo): janela atual + anterior (variação) ──────────────────
  const appId = process.env.SHOPEE_APP_ID;
  const secret = process.env.SHOPEE_APP_SECRET;
  const shopeeJob = (async () => {
    if (!appId || !secret) { sources.shopee.error = "Credenciais Shopee não configuradas (SHOPEE_APP_ID/SECRET)"; return; }
    try {
      // janela anterior é opcional: a API da Shopee recusa >3 meses atrás (erro 11001),
      // então no seletor 90d o prev (90–180d) falha — não pode derrubar a janela atual
      const [cur, prev] = await Promise.all([
        fetchConversions(appId, secret, start, end),
        fetchConversions(appId, secret, prevStart, start).catch(() => [] as Awaited<ReturnType<typeof fetchConversions>>),
      ]);
      const salesNorm = new Map<string, NormEntry>();
      const curUnits = new Map<string, number>();
      const prevUnits = new Map<string, number>();
      for (const c of cur) for (const it of c.items) {
        addNorm(salesNorm, it.name, it.category, it.qty, it.commission, it.price * it.qty, 0);
        const p = norm(it.name, it.category).product;
        curUnits.set(p, (curUnits.get(p) ?? 0) + it.qty);
      }
      for (const c of prev) for (const it of c.items) {
        const p = norm(it.name, it.category).product;
        prevUnits.set(p, (prevUnits.get(p) ?? 0) + it.qty);
      }
      sources.shopee = {
        ok: true, live: true, agg: aggregate(cur),
        variacao: prev.length ? diffUnits(curUnits, prevUnits, "vs período anterior de mesmo tamanho") : null,
        ...buildOutputs("shopee", salesNorm), funnel: await readFunnel("shopee"),
      };
    } catch (err) {
      sources.shopee.error = err instanceof Error ? err.message : String(err);
    }
  })();

  const lastSyncOf = (rows: AffiliateSaleRow[]) =>
    rows.reduce<string | null>((acc, r) => {
      const s = (r as unknown as { synced_at?: string }).synced_at ?? null;
      return s && (!acc || s > acc) ? s : acc;
    }, null);

  // ── ML: janela atual (agg) + anterior (variação) ──────────────────────────
  const mlJob = (async () => {
    try {
      const [rows, prevRows] = await Promise.all([
        fetchPaged<AffiliateSaleRow>(() => supabase.from("affiliate_sales").select("*").eq("source", "ml")
          .gte("sold_at", startIso).lte("sold_at", endIso).order("sold_at", { ascending: false }).order("external_id")),
        fetchPaged<AffiliateSaleRow>(() => supabase.from("affiliate_sales").select("product_name,category,units").eq("source", "ml")
          .gte("sold_at", prevStartIso).lt("sold_at", startIso).order("external_id")),
      ]);
      const salesNorm = new Map<string, NormEntry>();
      const curUnits = new Map<string, number>();
      for (const r of rows) {
        const u = Number(r.units) || 0, c = Number(r.commission) || 0, g = Number(r.gross_value) || 0;
        addNorm(salesNorm, r.product_name, r.category, u, c, g, 0);
        const p = norm(r.product_name, r.category).product;
        curUnits.set(p, (curUnits.get(p) ?? 0) + u);
      }
      const prevUnits = new Map<string, number>();
      for (const r of prevRows) {
        const p = norm(r.product_name, r.category).product;
        prevUnits.set(p, (prevUnits.get(p) ?? 0) + (Number(r.units) || 0));
      }
      sources.ml = {
        ok: true, lastSync: lastSyncOf(rows), agg: aggregateRows(rows, "sale"),
        variacao: diffUnits(curUnits, prevUnits, "vs período anterior de mesmo tamanho"),
        ...buildOutputs("ml", salesNorm), funnel: await readFunnel("ml"),
      };
    } catch (err) {
      sources.ml = { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  })();

  // ── Amazon: buckets por período, RECORTADOS pra janela (pro-rata nos que só encostam).
  //    Variação = mês mais recente × anterior (usa TODOS os buckets, independe da janela) ──
  const amazonJob = (async () => {
    try {
      const allRows = await fetchPaged<AffiliateSaleRow>(() =>
        supabase.from("affiliate_sales").select("*").eq("source", "amazon").order("external_id"));
      const rows = windowAmazonRows(allRows, start, end);
      const perDay = rows.some((r) => r.sold_at);
      const period = {
        start: rows.reduce<string | null>((a, r) => (r.period_start && (!a || r.period_start < a) ? r.period_start : a), null),
        end: rows.reduce<string | null>((a, r) => (r.period_end && (!a || r.period_end > a) ? r.period_end : a), null),
      };

      // variação: agrupa por período (period_start), pega os 2 mais recentes, compara por produto
      const periods = [...new Set(allRows.map((r) => r.period_start).filter(Boolean) as string[])].sort();
      let variacao: Variacao | null = null;
      if (periods.length >= 2) {
        const curP = periods[periods.length - 1], prevP = periods[periods.length - 2];
        const curUnits = new Map<string, number>(), prevUnits = new Map<string, number>();
        for (const r of allRows) {
          const p = norm(r.product_name, r.category).product;
          if (r.period_start === curP) curUnits.set(p, (curUnits.get(p) ?? 0) + (Number(r.units) || 0));
          else if (r.period_start === prevP) prevUnits.set(p, (prevUnits.get(p) ?? 0) + (Number(r.units) || 0));
        }
        const mes = (d: string) => { const m = d.match(/^(\d{4})-(\d{2})/); return m ? `${m[2]}/${m[1]}` : d; };
        variacao = diffUnits(curUnits, prevUnits, `${mes(curP)} × ${mes(prevP)} — atenção: mês corrente pode estar incompleto`);
      }

      const salesNorm = new Map<string, NormEntry>();
      for (const r of rows) addNorm(salesNorm, r.product_name, r.category, Number(r.units) || 0, Number(r.commission) || 0, Number(r.gross_value) || 0, Number(r.clicks) || 0);

      sources.amazon = {
        ok: true, snapshot: true, period, lastSync: lastSyncOf(allRows),
        agg: aggregateRows(rows, perDay ? "sale" : "daily"),
        variacao, ...buildOutputs("amazon", salesNorm),
      };
    } catch (err) {
      sources.amazon = { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  })();

  await Promise.all([shopeeJob, mlJob, amazonJob]);

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
