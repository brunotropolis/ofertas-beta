import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { fetchConversions, aggregate, type SalesAggregate } from "@/lib/shopee-sales";
import { aggregateRows, windowAmazonRows, inicioJanelaBRT, isCancelada, amazonPeloDiario, AMAZON_LOJA_DIARIA, type AffiliateSaleRow, type AmazonDiaRow } from "@/lib/affiliate-sales";
import { normalize } from "@/lib/normalize";
import { comCache } from "@/lib/cache-curto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Src = "shopee" | "ml" | "amazon";

interface VarItem { product: string; atual: number; anterior: number; delta: number }
interface Variacao { basis: string; subiram: VarItem[]; cairam: VarItem[] }
interface AdProduto { product: string; ads: number; units: number; commission: number; conv: number | null; exampleUrl: string | null }
interface Produto { product: string; category: string; units: number; commission: number; gmv: number; clicks: number; ads: number }
interface Funnel { stale?: boolean; clicks: number; buyers: number; orders: number; gmv: number; commission: number; comm_marketplace: number; comm_seller: number; comm_brand: number; synced_at: string | null }

interface SourceResult {
  ok: boolean;
  error?: string;
  live?: boolean;
  lastSync?: string | null;
  diario?: { ultimoDia: string | null } | null; // Amazon: total/cliques/dia vindos da série diária (07/Nov)
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

// GET /api/vendas?days=30 (ou ?from=YYYY-MM-DD&to=YYYY-MM-DD, dias BRT inclusivos) →
//   resultados de afiliado das 3 fontes + variação + anúncios×produto + produtos/oportunidades.
//   Shopee: ao vivo (API oficial). ML/Amazon: lidos da tabela affiliate_sales (via coletor /vendas-sync).
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
// cache de 10 min (Shopee ao vivo + soma de vendas — não muda a cada segundo); ?fresh=1 força
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return comCache(request, "vendas", 10 * 60_000, () => gerar(request));
}

async function gerar(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const fromP = searchParams.get("from"), toP = searchParams.get("to");
  const now = Math.floor(Date.now() / 1000);
  let start: number, end: number, days: number;
  let custom = false;
  if (fromP && toP && DAY_RE.test(fromP) && DAY_RE.test(toP) && fromP <= toP) {
    custom = true;
    // período personalizado: dias BRT inclusivos (from 00:00 → to 23:59:59, teto = agora)
    start = Math.floor(Date.parse(fromP + "T00:00:00-03:00") / 1000);
    end = Math.min(now, Math.floor(Date.parse(toP + "T00:00:00-03:00") / 1000) + 86400 - 1);
    if (end <= start) return NextResponse.json({ error: "Período inválido (início no futuro?)" }, { status: 400 });
    days = Math.max(1, Math.round((end - start) / 86400));
  } else {
    days = Math.min(Math.max(parseInt(searchParams.get("days") || "30", 10) || 30, 1), 180);
    end = now;
    start = inicioJanelaBRT(days, now); // hoje + (N-1) dias, desde 00h BRT — mesma régua nas 3 lojas
  }
  const prevStart = start - (end - start); // janela anterior de mesmo tamanho
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

  // funil de conta (cliques→pedidos) da janela — lido de affiliate_metrics (só janelas coletadas 7/30/90,
  // sempre ancoradas em "agora": período personalizado não tem funil)
  const readFunnel = async (src: string): Promise<Funnel | null> => {
    if (custom) return null;
    try {
      const { data } = await supabase.from("affiliate_metrics").select("*").eq("source", src).eq("days", days).maybeSingle();
      const m = data as Record<string, unknown> | null;
      if (!m) return null;
      // funil não tem robô: velho (>3 dias) vai marcado e a tela não mostra como se fosse de agora
      const sync = m.synced_at ? Date.parse(String(m.synced_at)) : 0;
      return {
        stale: !sync || Date.now() - sync > 3 * 86400000,
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
      for (const c of cur) if (!isCancelada(c.status)) for (const it of c.items) {
        addNorm(salesNorm, it.name, it.category, it.qty, it.commission, it.price * it.qty, 0);
        const p = norm(it.name, it.category).product;
        curUnits.set(p, (curUnits.get(p) ?? 0) + it.qty);
      }
      for (const c of prev) if (!isCancelada(c.status)) for (const it of c.items) {
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
        fetchPaged<AffiliateSaleRow>(() => supabase.from("affiliate_sales").select("product_name,category,units,status").eq("source", "ml")
          .gte("sold_at", prevStartIso).lt("sold_at", startIso).order("external_id")),
      ]);
      const salesNorm = new Map<string, NormEntry>();
      const curUnits = new Map<string, number>();
      for (const r of rows) {
        if (isCancelada(r.status)) continue;
        const u = Number(r.units) || 0, c = Number(r.commission) || 0, g = Number(r.gross_value) || 0;
        addNorm(salesNorm, r.product_name, r.category, u, c, g, 0);
        const p = norm(r.product_name, r.category).product;
        curUnits.set(p, (curUnits.get(p) ?? 0) + u);
      }
      const prevUnits = new Map<string, number>();
      for (const r of prevRows) {
        if (isCancelada(r.status)) continue;
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
      const brtDia = (sec: number) => new Date((sec - 3 * 3600) * 1000).toISOString().slice(0, 10);
      const [{ data: diasJanela }, { data: primeiro }] = await Promise.all([
        supabase.from("afiliado_etiquetas_diario").select("dia,cliques,vendas,comissao")
          .eq("fonte", "amazon").eq("tag", AMAZON_LOJA_DIARIA).gte("dia", brtDia(start)).lte("dia", brtDia(end)).order("dia"),
        supabase.from("afiliado_etiquetas_diario").select("dia")
          .eq("fonte", "amazon").eq("tag", AMAZON_LOJA_DIARIA).order("dia").limit(1),
      ]);
      const proRata = windowAmazonRows(allRows, start, end);
      const peloDiario = amazonPeloDiario(proRata, (diasJanela ?? []) as AmazonDiaRow[], (primeiro?.[0] as { dia: string } | undefined)?.dia ?? null, start);
      const rows = peloDiario ? peloDiario.rows : proRata;
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

      const agg = aggregateRows(rows, perDay ? "sale" : "daily");
      if (peloDiario) {
        // total exato do diário (loja principal) + outras lojas (04-20, pequena) pelo mês
        const outras = rows.filter((r) => r.store !== AMAZON_LOJA_DIARIA);
        const somaO = (k: "commission" | "units" | "clicks") => outras.reduce((s, r) => s + (Number(r[k] ?? 0) || 0), 0);
        const d = peloDiario.diario;
        agg.kpis.commission = d.commission + somaO("commission");
        agg.kpis.commissionConfirmed = agg.kpis.commission;
        agg.kpis.items = d.items + somaO("units");
        agg.kpis.conversions = agg.kpis.items;
        agg.kpis.clicks = d.clicks + somaO("clicks");
        agg.kpis.ticket = agg.kpis.conversions ? agg.kpis.gmv / agg.kpis.conversions : 0;
        agg.byDay = d.byDay;
      }
      sources.amazon = {
        ok: true, snapshot: !peloDiario, diario: peloDiario ? { ultimoDia: peloDiario.diario.ultimoDia } : null,
        period, lastSync: lastSyncOf(allRows),
        agg,
        variacao, ...buildOutputs("amazon", salesNorm),
      };
    } catch (err) {
      sources.amazon = { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  })();

  // ── ML por etiqueta (23/Out): tabela à parte, só pra mostrar o recorte por campanha (NÃO entra no combinado) ──
  let etiquetasMl: { tag: string; cliques: number; vendas: number; comissao: number }[] = [];
  const etiquetasJob = (async () => {
    const dia = (sec: number) => new Date(sec * 1000 - 3 * 3600 * 1000).toISOString().slice(0, 10);
    const { data: et } = await supabase.from("afiliado_etiquetas_diario").select("tag, cliques, vendas, comissao")
      .eq("fonte", "ml").gte("dia", dia(start)).lte("dia", dia(end));
    const m = new Map<string, { tag: string; cliques: number; vendas: number; comissao: number }>();
    for (const r of (et ?? []) as { tag: string; cliques: number; vendas: number; comissao: number }[]) {
      const x = m.get(r.tag) ?? { tag: r.tag, cliques: 0, vendas: 0, comissao: 0 };
      x.cliques += r.cliques; x.vendas += r.vendas; x.comissao += Number(r.comissao); m.set(r.tag, x);
    }
    etiquetasMl = [...m.values()];
  })().catch(() => {});

  await Promise.all([shopeeJob, mlJob, amazonJob, etiquetasJob]);

  // ── Combinado (soma o que deu certo) ──────────────────────────────────────
  const combined = { commission: 0, commissionConfirmed: 0, conversions: 0, items: 0, gmv: 0 };
  for (const s of Object.values(sources)) {
    if (s.ok && s.agg) {
      combined.commission += s.agg.kpis.commission;
      combined.commissionConfirmed += s.agg.kpis.commissionConfirmed ?? 0;
      combined.conversions += s.agg.kpis.conversions;
      combined.items += s.agg.kpis.items;
      combined.gmv += s.agg.kpis.gmv;
    }
  }

  return NextResponse.json({ period: { days, from: start, to: end, custom }, sources, combined, etiquetasMl });
}
