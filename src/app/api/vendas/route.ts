import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { fetchConversions, aggregate, type SalesAggregate } from "@/lib/shopee-sales";
import { aggregateRows, type AffiliateSaleRow } from "@/lib/affiliate-sales";
import { normalize } from "@/lib/normalize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Src = "shopee" | "ml" | "amazon";

interface VarItem { product: string; atual: number; anterior: number; delta: number }
interface Variacao { basis: string; subiram: VarItem[]; cairam: VarItem[] }
interface AdProduto { product: string; ads: number; units: number; commission: number; conv: number | null; exampleUrl: string | null }

interface SourceResult {
  ok: boolean;
  error?: string;
  live?: boolean;
  lastSync?: string | null;
  snapshot?: boolean; // Amazon: dado agregado por período (não fatia pelo seletor 7/30/90)
  period?: { start: string | null; end: string | null };
  agg?: SalesAggregate;
  variacao?: Variacao | null;       // janela atual × anterior (por produto normalizado)
  adsByProduct?: AdProduto[];        // anúncios (grupos WhatsApp) × vendas desta plataforma
}

// diff de unidades por produto normalizado entre duas janelas
function diffUnits(cur: Map<string, number>, prev: Map<string, number>, basis: string): Variacao {
  const keys = new Set([...cur.keys(), ...prev.keys()]);
  const arr: VarItem[] = [...keys]
    .filter((p) => p && p !== "(não classificado)")
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

// GET /api/vendas?days=30 → resultados de afiliado das 3 fontes + variação + anúncios×produto.
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

  // normaliza um nome cru → produto normalizado (mesma taxonomia da aba Análise)
  const norm = (name: string | null, cat: string | null) => normalize(name, cat).product;

  // ── anúncios da janela (todos os grupos) → por plataforma, dedup link+dia ──
  // Usado no cruzamento anúncios×produto de cada plataforma.
  const adsNorm: Record<Src, Map<string, { ads: number; exampleUrl: string | null }>> = {
    shopee: new Map(), ml: new Map(), amazon: new Map(),
  };
  try {
    const { data } = await supabase.from("anuncios")
      .select("platform,product_raw,url,posted_at,group_name")
      .gte("posted_at", startIso).lte("posted_at", endIso).limit(20000);
    const seen = new Set<string>();
    for (const a of (data ?? []) as { platform: string; product_raw: string; url: string; posted_at: string; group_name: string }[]) {
      if (a.platform !== "shopee" && a.platform !== "ml" && a.platform !== "amazon") continue;
      if (/cupo|cupom|cupons/i.test(a.group_name || "") || /cupo|cupom|cupons|desconto no app/i.test(a.product_raw || "")) continue;
      const day = (a.posted_at || "").slice(0, 10);
      const k = (a.url || a.product_raw) + "|" + day;
      if (seen.has(k)) continue; seen.add(k);
      const p = norm(a.product_raw, null);
      if (!p || p === "(não classificado)") continue;
      const m = adsNorm[a.platform as Src].get(p) ?? { ads: 0, exampleUrl: null };
      m.ads += 1; if (!m.exampleUrl && a.url) m.exampleUrl = a.url;
      adsNorm[a.platform as Src].set(p, m);
    }
  } catch { /* anúncios opcional */ }

  // cruza vendas normalizadas (produto→units/comissão) com anúncios da plataforma
  const buildAds = (src: Src, salesNorm: Map<string, { units: number; commission: number }>): AdProduto[] => {
    const out: AdProduto[] = [];
    for (const [product, a] of adsNorm[src]) {
      const s = salesNorm.get(product) ?? { units: 0, commission: 0 };
      out.push({ product, ads: a.ads, units: s.units, commission: s.commission, conv: a.ads ? s.units / a.ads : null, exampleUrl: a.exampleUrl });
    }
    return out.sort((x, y) => y.ads - x.ads).slice(0, 20);
  };

  // ── Shopee (ao vivo): janela atual + anterior (variação) ──────────────────
  const appId = process.env.SHOPEE_APP_ID;
  const secret = process.env.SHOPEE_APP_SECRET;
  const shopeeJob = (async () => {
    if (!appId || !secret) { sources.shopee.error = "Credenciais Shopee não configuradas (SHOPEE_APP_ID/SECRET)"; return; }
    try {
      const [cur, prev] = await Promise.all([
        fetchConversions(appId, secret, start, end),
        fetchConversions(appId, secret, prevStart, start),
      ]);
      const salesNorm = new Map<string, { units: number; commission: number }>();
      const curUnits = new Map<string, number>();
      const prevUnits = new Map<string, number>();
      for (const c of cur) for (const it of c.items) {
        const p = norm(it.name, it.category);
        const s = salesNorm.get(p) ?? { units: 0, commission: 0 };
        s.units += it.qty; s.commission += it.commission; salesNorm.set(p, s);
        curUnits.set(p, (curUnits.get(p) ?? 0) + it.qty);
      }
      for (const c of prev) for (const it of c.items) {
        const p = norm(it.name, it.category);
        prevUnits.set(p, (prevUnits.get(p) ?? 0) + it.qty);
      }
      sources.shopee = {
        ok: true, live: true, agg: aggregate(cur),
        variacao: diffUnits(curUnits, prevUnits, "vs período anterior de mesmo tamanho"),
        adsByProduct: buildAds("shopee", salesNorm),
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
      const [curRes, prevRes] = await Promise.all([
        supabase.from("affiliate_sales").select("*").eq("source", "ml")
          .gte("sold_at", startIso).lte("sold_at", endIso).order("sold_at", { ascending: false }).limit(5000),
        supabase.from("affiliate_sales").select("product_name,category,units").eq("source", "ml")
          .gte("sold_at", prevStartIso).lt("sold_at", startIso).limit(5000),
      ]);
      if (curRes.error) throw new Error(curRes.error.message);
      const rows = (curRes.data ?? []) as AffiliateSaleRow[];
      const salesNorm = new Map<string, { units: number; commission: number }>();
      const curUnits = new Map<string, number>();
      for (const r of rows) {
        const p = norm(r.product_name, r.category);
        const u = Number(r.units) || 0, c = Number(r.commission) || 0;
        const s = salesNorm.get(p) ?? { units: 0, commission: 0 }; s.units += u; s.commission += c; salesNorm.set(p, s);
        curUnits.set(p, (curUnits.get(p) ?? 0) + u);
      }
      const prevUnits = new Map<string, number>();
      for (const r of (prevRes.data ?? []) as AffiliateSaleRow[]) {
        const p = norm(r.product_name, r.category);
        prevUnits.set(p, (prevUnits.get(p) ?? 0) + (Number(r.units) || 0));
      }
      sources.ml = {
        ok: true, lastSync: lastSyncOf(rows), agg: aggregateRows(rows, "sale"),
        variacao: diffUnits(curUnits, prevUnits, "vs período anterior de mesmo tamanho"),
        adsByProduct: buildAds("ml", salesNorm),
      };
    } catch (err) {
      sources.ml = { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  })();

  // ── Amazon: snapshot (todos os buckets). Variação = mês mais recente × anterior ──
  const amazonJob = (async () => {
    try {
      const { data, error } = await supabase.from("affiliate_sales").select("*").eq("source", "amazon").limit(5000);
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as AffiliateSaleRow[];
      const perDay = rows.some((r) => r.sold_at);
      const period = {
        start: rows.reduce<string | null>((a, r) => (r.period_start && (!a || r.period_start < a) ? r.period_start : a), null),
        end: rows.reduce<string | null>((a, r) => (r.period_end && (!a || r.period_end > a) ? r.period_end : a), null),
      };

      // variação: agrupa por período (period_start), pega os 2 mais recentes, compara por produto
      const periods = [...new Set(rows.map((r) => r.period_start).filter(Boolean) as string[])].sort();
      let variacao: Variacao | null = null;
      if (periods.length >= 2) {
        const curP = periods[periods.length - 1], prevP = periods[periods.length - 2];
        const curUnits = new Map<string, number>(), prevUnits = new Map<string, number>();
        for (const r of rows) {
          const p = norm(r.product_name, r.category);
          if (r.period_start === curP) curUnits.set(p, (curUnits.get(p) ?? 0) + (Number(r.units) || 0));
          else if (r.period_start === prevP) prevUnits.set(p, (prevUnits.get(p) ?? 0) + (Number(r.units) || 0));
        }
        const mes = (d: string) => { const m = d.match(/^(\d{4})-(\d{2})/); return m ? `${m[2]}/${m[1]}` : d; };
        // ⚠️ o mês corrente costuma estar incompleto (só até o dia do último sync) → comparação parcial
        variacao = diffUnits(curUnits, prevUnits, `${mes(curP)} × ${mes(prevP)} — atenção: mês corrente pode estar incompleto`);
      }

      // anúncios×produto (todo o snapshot de vendas Amazon)
      const salesNorm = new Map<string, { units: number; commission: number }>();
      for (const r of rows) {
        const p = norm(r.product_name, r.category);
        const s = salesNorm.get(p) ?? { units: 0, commission: 0 };
        s.units += Number(r.units) || 0; s.commission += Number(r.commission) || 0; salesNorm.set(p, s);
      }

      sources.amazon = {
        ok: true, snapshot: true, period, lastSync: lastSyncOf(rows),
        agg: aggregateRows(rows, perDay ? "sale" : "daily"),
        variacao, adsByProduct: buildAds("amazon", salesNorm),
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
