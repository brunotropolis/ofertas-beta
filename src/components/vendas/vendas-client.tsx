"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  Wallet, ShoppingBag, Package, Receipt, RefreshCw, Loader2,
  AlertTriangle, TrendingUp, Tag, Smartphone, MousePointerClick, Clock, Layers,
  Store, ArrowUpRight, ArrowDownRight, Megaphone, ExternalLink, Percent, Target, ChevronLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import AnaliseClient from "./analise-client";
import MetricasClient from "./metricas-client";

interface Agg {
  kpis: {
    commission: number; conversions: number; items: number; gmv: number; ticket: number; clicks: number;
    byStatusCount: Record<string, number>;
    byStatusCommission: Record<string, number>;
  };
  byProduct: { name: string; image: string | null; qty: number; commission: number; gmv: number; clicks: number }[];
  byCategory: { category: string; qty: number; commission: number; gmv: number }[];
  byStore: { store: string; qty: number; commission: number; gmv: number }[];
  byDay: { day: string; commission: number; conversions: number }[];
  byUtm: { utm: string; commission: number; conversions: number }[];
  byDevice: { device: string; commission: number; conversions: number }[];
}
interface VarItem { product: string; atual: number; anterior: number; delta: number }
interface Variacao { basis: string; subiram: VarItem[]; cairam: VarItem[] }
interface AdProduto { product: string; ads: number; units: number; commission: number; conv: number | null; exampleUrl: string | null }
interface Produto { product: string; category: string; units: number; commission: number; gmv: number; clicks: number; ads: number }
interface Funnel { clicks: number; buyers: number; orders: number; gmv: number; commission: number; comm_marketplace: number; comm_seller: number; comm_brand: number; synced_at: string | null }
interface SourceResult {
  ok: boolean; error?: string; live?: boolean; lastSync?: string | null; snapshot?: boolean;
  period?: { start: string | null; end: string | null };
  agg?: Agg; variacao?: Variacao | null; adsByProduct?: AdProduto[]; produtos?: Produto[]; oportunidades?: Produto[]; funnel?: Funnel | null;
}
interface VendasResp {
  period: { days: number };
  sources: { shopee: SourceResult; ml: SourceResult; amazon: SourceResult };
  combined: { commission: number; conversions: number; items: number; gmv: number };
}

type SourceKey = "todas" | "shopee" | "ml" | "amazon";

const PERIODS = [
  { days: 7, label: "7 dias" },
  { days: 30, label: "30 dias" },
  { days: 90, label: "90 dias" },
];

const SOURCE_META: Record<Exclude<SourceKey, "todas">, { label: string; dot: string }> = {
  shopee: { label: "Shopee", dot: "bg-orange-400" },
  ml: { label: "Mercado Livre", dot: "bg-yellow-400" },
  amazon: { label: "Amazon", dot: "bg-sky-400" },
};

const STATUS_META: Record<string, { label: string; cls: string }> = {
  PENDING:   { label: "Pendente",   cls: "bg-amber-500/10 text-amber-400" },
  CONFIRMED: { label: "Confirmada", cls: "bg-emerald-500/10 text-emerald-400" },
  PAID:      { label: "Paga",       cls: "bg-emerald-500/10 text-emerald-400" },
  CANCELLED: { label: "Cancelada",  cls: "bg-red-500/10 text-red-400" },
  UNKNOWN:   { label: "Outro",      cls: "bg-zinc-800 text-zinc-400" },
};

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (n: number) => n.toLocaleString("pt-BR");
const pct = (r: number | null | undefined) => (r == null || !Number.isFinite(r)) ? "—" : `${(r * 100).toFixed(0)}%`;
const srchLink = (name: string) => `https://www.google.com/search?q=${encodeURIComponent(name)}`;

// ── Section (borda colorida à esquerda, igual Análise) + tabela densa ──
const ACC: Record<string, string> = { var: "border-l-sky-500", oport: "border-l-emerald-500", ads: "border-l-violet-500", prod: "border-l-rose-500", cat: "border-l-orange-500", store: "border-l-yellow-500", status: "border-l-zinc-500", day: "border-l-orange-500", utm: "border-l-amber-500", dev: "border-l-teal-500" };
const ICO: Record<string, string> = { var: "text-sky-400", oport: "text-emerald-400", ads: "text-violet-400", prod: "text-rose-400", cat: "text-orange-400", store: "text-yellow-400", status: "text-zinc-400", day: "text-orange-400", utm: "text-amber-400", dev: "text-teal-400" };
const TH = "py-2 px-2.5 font-semibold text-zinc-400 border border-zinc-700/60 bg-zinc-900/40";
const TD = "py-1.5 px-2.5 border border-zinc-800/70";
function Section({ acc, icon: Icon, title, desc, right, children }: { acc: keyof typeof ACC; icon: React.ElementType; title: string; desc?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className={cn("glass rounded-xl p-4 border-l-[3px]", ACC[acc])}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-white font-display font-semibold tracking-tight text-[15px] flex items-center gap-2"><Icon className={cn("w-4 h-4", ICO[acc])} strokeWidth={2} /> {title}</h2>
        {right}
      </div>
      {desc && <p className="text-[11px] text-zinc-400 mt-0.5 leading-snug">{desc}</p>}
      <div className="mt-3">{children}</div>
    </div>
  );
}
const VerLink = ({ url, name }: { url: string | null; name: string }) => (
  <a href={url || srchLink(name)} target="_blank" rel="noopener noreferrer" title={name} className="inline-flex text-sky-400/80 hover:text-sky-300 shrink-0"><ExternalLink className="w-3.5 h-3.5" /></a>
);

function emptyAgg(): Agg {
  return {
    kpis: { commission: 0, conversions: 0, items: 0, gmv: 0, ticket: 0, clicks: 0, byStatusCount: {}, byStatusCommission: {} },
    byProduct: [], byCategory: [], byStore: [], byDay: [], byUtm: [], byDevice: [],
  };
}

// Funde vários aggs (view "Todas").
function mergeAggs(aggs: Agg[]): Agg {
  const out = emptyAgg();
  const dayMap = new Map<string, { commission: number; conversions: number }>();
  const prodMap = new Map<string, Agg["byProduct"][number]>();
  const catMap = new Map<string, Agg["byCategory"][number]>();
  const storeMap = new Map<string, Agg["byStore"][number]>();
  const utmMap = new Map<string, { utm: string; commission: number; conversions: number }>();
  const devMap = new Map<string, { device: string; commission: number; conversions: number }>();

  for (const a of aggs) {
    out.kpis.commission += a.kpis.commission;
    out.kpis.conversions += a.kpis.conversions;
    out.kpis.items += a.kpis.items;
    out.kpis.gmv += a.kpis.gmv;
    out.kpis.clicks += a.kpis.clicks ?? 0;
    for (const [st, c] of Object.entries(a.kpis.byStatusCount)) out.kpis.byStatusCount[st] = (out.kpis.byStatusCount[st] ?? 0) + c;
    for (const [st, c] of Object.entries(a.kpis.byStatusCommission)) out.kpis.byStatusCommission[st] = (out.kpis.byStatusCommission[st] ?? 0) + c;
    for (const d of a.byDay) { const m = dayMap.get(d.day) ?? { commission: 0, conversions: 0 }; m.commission += d.commission; m.conversions += d.conversions; dayMap.set(d.day, m); }
    for (const p of a.byProduct) { const m = prodMap.get(p.name) ?? { name: p.name, image: p.image, qty: 0, commission: 0, gmv: 0, clicks: 0 }; m.qty += p.qty; m.commission += p.commission; m.gmv += p.gmv; m.clicks += p.clicks ?? 0; if (!m.image && p.image) m.image = p.image; prodMap.set(p.name, m); }
    for (const c of a.byCategory) { const m = catMap.get(c.category) ?? { category: c.category, qty: 0, commission: 0, gmv: 0 }; m.qty += c.qty; m.commission += c.commission; m.gmv += c.gmv; catMap.set(c.category, m); }
    for (const s of (a.byStore ?? [])) { const m = storeMap.get(s.store) ?? { store: s.store, qty: 0, commission: 0, gmv: 0 }; m.qty += s.qty; m.commission += s.commission; m.gmv += s.gmv; storeMap.set(s.store, m); }
    for (const u of a.byUtm) { const m = utmMap.get(u.utm) ?? { utm: u.utm, commission: 0, conversions: 0 }; m.commission += u.commission; m.conversions += u.conversions; utmMap.set(u.utm, m); }
    for (const v of a.byDevice) { const m = devMap.get(v.device) ?? { device: v.device, commission: 0, conversions: 0 }; m.commission += v.commission; m.conversions += v.conversions; devMap.set(v.device, m); }
  }
  out.kpis.ticket = out.kpis.conversions ? out.kpis.gmv / out.kpis.conversions : 0;
  out.byProduct = [...prodMap.values()].sort((a, b) => b.commission - a.commission).slice(0, 25);
  out.byCategory = [...catMap.values()].sort((a, b) => b.commission - a.commission).slice(0, 25);
  out.byStore = [...storeMap.values()].sort((a, b) => b.commission - a.commission).slice(0, 25);
  out.byDay = [...dayMap.entries()].map(([day, v]) => ({ day, ...v })).sort((a, b) => a.day.localeCompare(b.day));
  out.byUtm = [...utmMap.values()].sort((a, b) => b.commission - a.commission);
  out.byDevice = [...devMap.values()].sort((a, b) => b.commission - a.commission);
  return out;
}

function fmtDay(d: string | null | undefined): string | null {
  if (!d) return null;
  const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}` : null;
}

function fmtSync(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const d = new Date(t - 3 * 3600 * 1000);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

export default function VendasClient() {
  const [days, setDays] = useState(30);
  const [view, setView] = useState<"resultados" | "analise" | "metricas">("analise");
  const [source, setSource] = useState<SourceKey>("todas");
  const [data, setData] = useState<VendasResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [full, setFull] = useState<null | "produtos" | "oport">(null);

  const load = useCallback(async (silent = false) => {
    silent ? setRefreshing(true) : setLoading(true);
    try {
      const res = await fetch(`/api/vendas?days=${days}`, { cache: "no-store" });
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, [days]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setFull(null); }, [source, days]);

  const okAggs = useMemo(() => {
    if (!data) return [] as Agg[];
    return (["shopee", "ml", "amazon"] as const)
      .map((k) => data.sources[k])
      .filter((s) => s.ok && s.agg)
      .map((s) => s.agg!);
  }, [data]);

  const agg: Agg | null = useMemo(() => {
    if (!data) return null;
    if (source === "todas") return okAggs.length ? mergeAggs(okAggs) : emptyAgg();
    const s = data.sources[source];
    return s.ok && s.agg ? s.agg : (s.ok ? emptyAgg() : null);
  }, [data, source, okAggs]);

  const srcErr = source !== "todas" && data && !data.sources[source].ok ? data.sources[source].error : null;
  const maxDay = agg ? Math.max(1, ...agg.byDay.map((d) => d.commission)) : 1;
  const srcExtra = source !== "todas" && data && data.sources[source].ok ? data.sources[source] : null;
  const isAmazon = source === "amazon";
  const hasFunnel = !!(srcExtra?.funnel && srcExtra.funnel.clicks > 0 && (source === "ml" || source === "shopee"));
  const srcLabel = source !== "todas" ? SOURCE_META[source].label : "Todas";

  // ── tabelas reutilizáveis (dash + página cheia) ──
  const ProdTable = ({ rows, amazon }: { rows: Produto[]; amazon: boolean }) => (
    <div className="overflow-x-auto scroll-thin">
      <table className={cn("w-full text-[13px] border-collapse", amazon ? "min-w-[720px]" : "min-w-[560px]")}>
        <thead><tr>
          <th className={cn(TH, "text-left")}>Produto</th>
          <th className={cn(TH, "text-left")}>Categoria</th>
          <th className={cn(TH, "text-right")}>Vendas</th>
          <th className={cn(TH, "text-right")}>Comissão</th>
          <th className={cn(TH, "text-right")}>Anún.</th>
          {amazon && <th className={cn(TH, "text-right")}>Cliques</th>}
          {amazon && <th className={cn(TH, "text-right")}>Conv.</th>}
          <th className={cn(TH, "text-center")}>Ver</th>
        </tr></thead>
        <tbody>
          {rows.map((p, i) => (
            <tr key={i} className="hover:bg-zinc-800/30">
              <td className={cn(TD, "text-zinc-100")}>{p.product}</td>
              <td className={cn(TD, "text-zinc-400")}>{p.category}</td>
              <td className={cn(TD, "text-right text-zinc-200")}>{num(p.units)}</td>
              <td className={cn(TD, "text-right text-emerald-400 font-medium")}>{brl(p.commission)}</td>
              <td className={cn(TD, "text-right text-amber-400/90")}>{num(p.ads)}</td>
              {amazon && <td className={cn(TD, "text-right text-sky-300")}>{num(p.clicks)}</td>}
              {amazon && <td className={cn(TD, "text-right text-sky-300")}>{p.clicks ? pct(p.units / p.clicks) : "—"}</td>}
              <td className={cn(TD, "text-center")}><VerLink url={null} name={p.product} /></td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={amazon ? 8 : 6} className="py-6 text-center text-zinc-500 border border-zinc-800/70">Sem produtos no período.</td></tr>}
        </tbody>
      </table>
    </div>
  );

  const OportTable = ({ rows }: { rows: Produto[] }) => (
    <div className="overflow-x-auto scroll-thin">
      <table className="w-full text-[13px] min-w-[520px] border-collapse">
        <thead><tr>
          <th className={cn(TH, "text-left")}>Produto</th>
          <th className={cn(TH, "text-left")}>Categoria</th>
          <th className={cn(TH, "text-right")}>Vendas</th>
          <th className={cn(TH, "text-right")}>Anún.</th>
          <th className={cn(TH, "text-right")}>Comissão</th>
          <th className={cn(TH, "text-center")}>Ver</th>
        </tr></thead>
        <tbody>
          {rows.map((o, i) => (
            <tr key={i} className="hover:bg-zinc-800/30">
              <td className={cn(TD, "text-zinc-100")}>{o.product}</td>
              <td className={cn(TD, "text-zinc-400")}>{o.category}</td>
              <td className={cn(TD, "text-right text-white font-semibold")}>{num(o.units)}</td>
              <td className={cn(TD, "text-right text-amber-400")}>{o.ads}</td>
              <td className={cn(TD, "text-right text-emerald-400")}>{brl(o.commission)}</td>
              <td className={cn(TD, "text-center")}><VerLink url={null} name={o.product} /></td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={6} className="py-6 text-center text-zinc-500 border border-zinc-800/70">Nenhuma oportunidade — tudo que vende já é anunciado.</td></tr>}
        </tbody>
      </table>
    </div>
  );

  return (
    <div>
      {/* Header */}
      <div className="flex items-end justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-display font-semibold text-white tracking-tightest">Vendas</h1>
          <p className="text-zinc-500 text-sm mt-1">
            Comissões de afiliado — Shopee ao vivo · Mercado Livre e Amazon via sync.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1 bg-zinc-900/50 border border-zinc-800/70 rounded-full p-1">
            {([["analise", "Análise"], ["resultados", "Resultados"], ["metricas", "Métricas"]] as ["resultados" | "analise" | "metricas", string][]).map(([k, label]) => (
              <button key={k} onClick={() => setView(k)}
                className={cn("px-3.5 py-1.5 text-xs font-medium rounded-full transition-all",
                  view === k ? "bg-zinc-100 text-zinc-900" : "text-zinc-400 hover:text-white")}>
                {label}
              </button>
            ))}
          </div>
          {view === "resultados" && (
            <>
              <div className="flex gap-1 bg-zinc-900/50 border border-zinc-800/70 rounded-full p-1">
                {PERIODS.map((p) => (
                  <button key={p.days} onClick={() => setDays(p.days)}
                    className={cn("px-3.5 py-1.5 text-xs font-medium rounded-full transition-all",
                      days === p.days ? "bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-[0_0_12px_rgba(255,107,53,0.35)]" : "text-zinc-400 hover:text-white")}>
                    {p.label}
                  </button>
                ))}
              </div>
              <button onClick={() => load(true)} disabled={refreshing}
                className="flex items-center gap-2 px-3.5 py-2 bg-zinc-900/70 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs rounded-full transition-colors disabled:opacity-50">
                <RefreshCw className={cn("w-3.5 h-3.5", refreshing && "animate-spin")} strokeWidth={1.75} />
                Atualizar
              </button>
            </>
          )}
        </div>
      </div>

      {view === "analise" && <AnaliseClient />}
      {view === "metricas" && <MetricasClient />}

      {view === "resultados" && (loading ? (
        <div className="glass rounded-2xl p-12 text-center">
          <Loader2 className="w-6 h-6 mx-auto text-zinc-500 animate-spin" />
          <p className="text-zinc-500 text-sm mt-3">Puxando resultados...</p>
        </div>
      ) : !data ? (
        <div className="glass rounded-2xl p-8 text-center text-zinc-400 text-sm">Não deu pra carregar.</div>
      ) : (
        <div className="space-y-5">
          {/* Comissão combinada + saúde por fonte */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="glass rounded-2xl p-4 border-orange-500/30 lg:col-span-1">
              <div className="flex items-center gap-2 mb-2">
                <span className="h-7 w-7 rounded-lg grid place-items-center border bg-orange-500/15 border-orange-500/30">
                  <Wallet className="w-3.5 h-3.5 text-orange-400" strokeWidth={1.75} />
                </span>
                <span className="text-[10px] uppercase tracking-wider text-zinc-500">Comissão total (todas)</span>
              </div>
              <p className="text-2xl font-display font-semibold text-white tracking-tightest">{brl(data.combined.commission)}</p>
              <p className="text-[11px] text-zinc-500 mt-1">{num(data.combined.conversions)} conversões · GMV {brl(data.combined.gmv)}</p>
            </div>
            <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-3">
              {(["shopee", "ml", "amazon"] as const).map((k) => {
                const s = data.sources[k]; const meta = SOURCE_META[k];
                const sync = fmtSync(s.lastSync);
                const active = source === k;
                return (
                  <button key={k} onClick={() => setSource(active ? "todas" : k)}
                    className={cn("glass rounded-2xl p-3.5 text-left transition-all", active ? "ring-1 ring-orange-500/60" : "hover:bg-zinc-800/30")}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={cn("w-2 h-2 rounded-full", meta.dot)} />
                      <span className="text-xs text-zinc-300 font-medium">{meta.label}</span>
                      {s.live && <span className="text-[9px] text-emerald-400/80 bg-emerald-500/10 rounded px-1 py-0.5">ao vivo</span>}
                    </div>
                    {s.ok ? (
                      <>
                        <p className="text-lg font-display font-semibold text-white tracking-tight">{brl(s.agg?.kpis.commission ?? 0)}</p>
                        <p className="text-[10px] text-zinc-500 flex items-center gap-1 mt-0.5">
                          {s.live ? `${num(s.agg?.kpis.conversions ?? 0)} conversões`
                            : s.snapshot
                              ? <><Clock className="w-2.5 h-2.5" /> {s.period?.start && s.period?.end ? `${fmtDay(s.period.start)}–${fmtDay(s.period.end)}` : "snapshot"}{sync ? ` · ${sync}` : ""}</>
                              : <><Clock className="w-2.5 h-2.5" /> {sync ? `sync ${sync}` : "sem sync ainda"}</>}
                        </p>
                      </>
                    ) : (
                      <p className="text-[11px] text-red-400/90 leading-tight mt-1">{s.error || "erro"}</p>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Seletor de fonte */}
          <div className="flex gap-1 bg-zinc-900/50 border border-zinc-800/70 rounded-full p-1 w-fit">
            {([["todas", "Todas"], ["shopee", "Shopee"], ["ml", "Mercado Livre"], ["amazon", "Amazon"]] as [SourceKey, string][]).map(([k, label]) => (
              <button key={k} onClick={() => setSource(k)}
                className={cn("px-3.5 py-1.5 text-xs font-medium rounded-full transition-all",
                  source === k ? "bg-zinc-100 text-zinc-900" : "text-zinc-400 hover:text-white")}>
                {label}
              </button>
            ))}
          </div>

          {srcErr ? (
            <div className="glass rounded-2xl p-8 text-center">
              <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-red-500/10 border border-red-500/20 mb-4">
                <AlertTriangle className="w-7 h-7 text-red-400" strokeWidth={1.5} />
              </div>
              <p className="text-zinc-200 font-medium tracking-tight">Não deu pra puxar {srcLabel}</p>
              <p className="text-red-400 text-sm mt-1.5">{srcErr}</p>
            </div>
          ) : !agg ? null : full && srcExtra ? (
            /* ── páginas cheias (ver todos) ── */
            <div className="space-y-4">
              {full === "produtos" && (
                <Section acc="prod" icon={Package} title={`Todos os produtos ${srcLabel} (${srcExtra.produtos?.length ?? 0})`}
                  right={<button onClick={() => setFull(null)} className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 rounded-lg text-xs font-semibold text-white shrink-0"><ChevronLeft className="w-4 h-4" /> Voltar</button>}>
                  <ProdTable rows={srcExtra.produtos ?? []} amazon={isAmazon} />
                </Section>
              )}
              {full === "oport" && (
                <Section acc="oport" icon={Target} title={`Oportunidades ${srcLabel} (${srcExtra.oportunidades?.length ?? 0})`} desc="Vende ≥10 un mas ≤3 anúncios — vende sozinho, vale anunciar."
                  right={<button onClick={() => setFull(null)} className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 rounded-lg text-xs font-semibold text-white shrink-0"><ChevronLeft className="w-4 h-4" /> Voltar</button>}>
                  <OportTable rows={srcExtra.oportunidades ?? []} />
                </Section>
              )}
            </div>
          ) : agg.kpis.conversions === 0 && agg.kpis.commission === 0 ? (
            <div className="glass rounded-2xl p-10 text-center text-zinc-500 text-sm">
              Nenhuma venda no período{source !== "todas" && source !== "shopee" ? " (rode o sync pra popular esta fonte)" : ""}.
            </div>
          ) : (
            <div className="space-y-4">
              {isAmazon && srcExtra?.snapshot && (
                <p className="text-[11px] text-sky-400/80 bg-sky-500/10 border border-sky-500/20 rounded-xl px-3 py-2">
                  A Amazon é agregada por mês no Associados — a janela{srcExtra.period?.start && srcExtra.period?.end ? ` (buckets ${fmtDay(srcExtra.period.start)}–${fmtDay(srcExtra.period.end)})` : ""} é recortada proporcional aos dias (aproximação: mês que só encosta na janela entra pro-rata).
                </p>
              )}

              {/* KPIs (Amazon soma Cliques + Conversão clique→compra) */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
                <Kpi icon={Wallet} label="Comissão" value={brl(agg.kpis.commission)} highlight />
                <Kpi icon={ShoppingBag} label="Conversões" value={num(agg.kpis.conversions)} />
                <Kpi icon={Package} label="Itens" value={num(agg.kpis.items)} />
                <Kpi icon={TrendingUp} label="GMV" value={brl(agg.kpis.gmv)} />
                <Kpi icon={Receipt} label="Ticket méd." value={brl(agg.kpis.ticket)} />
                {isAmazon && agg.kpis.clicks > 0 && <Kpi icon={MousePointerClick} label="Cliques" value={num(agg.kpis.clicks)} />}
                {isAmazon && agg.kpis.clicks > 0 && <Kpi icon={Percent} label="Conv. clique→compra" value={pct(agg.kpis.items / agg.kpis.clicks)} accent="sky" />}
                {hasFunnel && <Kpi icon={MousePointerClick} label="Cliques (conta)" value={num(srcExtra!.funnel!.clicks)} />}
                {hasFunnel && <Kpi icon={Percent} label="Conv. clique→pedido" value={pct(srcExtra!.funnel!.orders / srcExtra!.funnel!.clicks)} accent="sky" />}
              </div>
              {hasFunnel && (
                <p className="text-[11px] text-zinc-400 px-1">
                  Funil da conta na janela: <span className="text-sky-300 font-medium">{num(srcExtra!.funnel!.clicks)} cliques</span> → {num(srcExtra!.funnel!.buyers)} compradores → <span className="text-zinc-200">{num(srcExtra!.funnel!.orders)} pedidos</span>.
                  {source === "ml" && <> Comissão por origem: marketplace {brl(srcExtra!.funnel!.comm_marketplace)} · seller {brl(srcExtra!.funnel!.comm_seller)} · brand {brl(srcExtra!.funnel!.comm_brand)}.</>}
                  {source === "shopee" && <> Comissão estimada do portal (inclui pendentes): {brl(srcExtra!.funnel!.commission)}.</>}
                </p>
              )}

              {/* Status */}
              {Object.keys(agg.kpis.byStatusCount).length > 0 && (
                <Section acc="status" icon={Receipt} title="Status das conversões">
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(agg.kpis.byStatusCount).map(([st, count]) => {
                      const meta = STATUS_META[st] ?? STATUS_META.UNKNOWN;
                      return (
                        <div key={st} className={cn("rounded-xl px-3 py-2 text-xs", meta.cls)}>
                          <span className="font-semibold uppercase tracking-wide">{meta.label}</span>
                          <span className="mx-1.5 opacity-60">·</span>{num(count)} venda{count !== 1 ? "s" : ""}
                          <span className="mx-1.5 opacity-60">·</span>{brl(agg.kpis.byStatusCommission[st] ?? 0)}
                        </div>
                      );
                    })}
                  </div>
                </Section>
              )}

              {/* Comissão por dia */}
              {agg.byDay.length > 0 && (
                <Section acc="day" icon={TrendingUp} title="Comissão por dia">
                  <div className="flex items-end gap-1 h-36 overflow-x-auto scroll-thin pb-1">
                    {agg.byDay.map((d) => (
                      <div key={d.day} className="flex flex-col items-center gap-1 min-w-[26px] group">
                        <div className="w-full rounded-t-md bg-gradient-to-t from-orange-600 to-orange-400 transition-all group-hover:from-orange-500 group-hover:to-orange-300"
                          style={{ height: `${Math.max(3, (d.commission / maxDay) * 116)}px` }}
                          title={`${d.day}: ${brl(d.commission)} · ${d.conversions} vendas`} />
                        <span className="text-[9px] text-zinc-600 whitespace-nowrap">{d.day.slice(8, 10)}/{d.day.slice(5, 7)}</span>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {/* Variação por produto (só quando plataforma selecionada) */}
              {srcExtra?.variacao && (srcExtra.variacao.subiram.length > 0 || srcExtra.variacao.cairam.length > 0) && (
                <Section acc="var" icon={TrendingUp} title="Variação por produto" desc={srcExtra.variacao.basis}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                    {([["Subiram", srcExtra.variacao.subiram, ArrowUpRight, "text-emerald-400"], ["Caíram", srcExtra.variacao.cairam, ArrowDownRight, "text-red-400"]] as const).map(([lbl, rows, Ico, col]) => (
                      <div key={lbl}>
                        <p className={cn("text-[10px] uppercase tracking-wider mb-1 flex items-center gap-1", col)}><Ico className="w-3.5 h-3.5" /> {lbl}</p>
                        <table className="w-full text-[13px] border-collapse">
                          <thead><tr><th className={cn(TH, "text-left")}>Produto</th><th className={cn(TH, "text-right")}>Antes</th><th className={cn(TH, "text-right")}>Agora</th><th className={cn(TH, "text-right")}>Δ un.</th></tr></thead>
                          <tbody>{rows.map((v, i) => (
                            <tr key={i} className="hover:bg-zinc-800/30">
                              <td className={cn(TD, "text-zinc-200")}>{v.product}</td>
                              <td className={cn(TD, "text-right text-zinc-400")}>{v.anterior}</td>
                              <td className={cn(TD, "text-right text-zinc-200")}>{v.atual}</td>
                              <td className={cn(TD, "text-right font-semibold", col)}>{v.delta > 0 ? "+" : ""}{v.delta}</td>
                            </tr>))}
                            {!rows.length && <tr><td colSpan={4} className="py-3 text-center text-zinc-600 border border-zinc-800/70">Sem mudança relevante.</td></tr>}
                          </tbody>
                        </table>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {/* Oportunidades não exploradas (por plataforma) */}
              {srcExtra && (srcExtra.oportunidades?.length ?? 0) > 0 && (
                <Section acc="oport" icon={Target} title="Oportunidades não exploradas" desc="Vende ≥10 un nesta plataforma mas ≤3 anúncios — vende sozinho, vale anunciar."
                  right={(srcExtra.oportunidades!.length > 8) ? <button onClick={() => setFull("oport")} className="text-xs text-emerald-400 hover:text-emerald-300 font-medium">ver todas ({srcExtra.oportunidades!.length}) →</button> : undefined}>
                  <OportTable rows={srcExtra.oportunidades!.slice(0, 8)} />
                </Section>
              )}

              {/* Anúncios × produto (por plataforma) */}
              {srcExtra && (srcExtra.adsByProduct?.length ?? 0) > 0 && (
                <Section acc="ads" icon={Megaphone} title="Anúncios × produto" desc={`Produtos anunciados nos grupos com link ${srcLabel} × quanto venderam. Vd/anún. = vendas por anúncio (vermelho = anunciou e não vendeu).`}>
                  <div className="overflow-x-auto scroll-thin">
                    <table className="w-full text-[13px] min-w-[520px] border-collapse">
                      <thead><tr>
                        <th className={cn(TH, "text-left")}>Produto</th><th className={cn(TH, "text-right")}>Anúncios</th><th className={cn(TH, "text-right")}>Vendas</th><th className={cn(TH, "text-right")}>Comissão</th><th className={cn(TH, "text-right")}>Vd/anún.</th><th className={cn(TH, "text-center")}>Ver</th>
                      </tr></thead>
                      <tbody>{srcExtra.adsByProduct!.map((a, i) => (
                        <tr key={i} className="hover:bg-zinc-800/30">
                          <td className={cn(TD, "text-zinc-100")}>{a.product}</td>
                          <td className={cn(TD, "text-right text-violet-300 font-semibold")}>{num(a.ads)}</td>
                          <td className={cn(TD, "text-right", a.units === 0 ? "text-red-400/80" : "text-zinc-200")}>{num(a.units)}</td>
                          <td className={cn(TD, "text-right text-emerald-400")}>{brl(a.commission)}</td>
                          <td className={cn(TD, "text-right font-medium", a.conv != null && a.conv >= 1 ? "text-emerald-400" : a.units === 0 ? "text-red-400/80" : "text-amber-400")}>{a.conv != null ? a.conv.toFixed(1) : "—"}</td>
                          <td className={cn(TD, "text-center")}>{a.exampleUrl ? <VerLink url={a.exampleUrl} name={a.product} /> : "—"}</td>
                        </tr>))}</tbody>
                    </table>
                  </div>
                </Section>
              )}

              {/* Produtos mais vendidos — lista normalizada + ver todos (por plataforma) */}
              {srcExtra && (srcExtra.produtos?.length ?? 0) > 0 ? (
                <Section acc="prod" icon={Package} title="Produtos mais vendidos"
                  right={(srcExtra.produtos!.length > 20) ? <button onClick={() => setFull("produtos")} className="text-xs text-rose-400 hover:text-rose-300 font-medium">ver todos ({srcExtra.produtos!.length}) →</button> : undefined}>
                  <ProdTable rows={srcExtra.produtos!.slice(0, 20)} amazon={isAmazon} />
                </Section>
              ) : source === "todas" && agg.byProduct.length > 0 ? (
                <Section acc="prod" icon={Package} title="Produtos mais vendidos (todas as plataformas)">
                  <div className="space-y-2 max-h-[420px] overflow-y-auto scroll-thin">
                    {agg.byProduct.map((p, i) => (
                      <div key={i} className="flex items-center gap-3 bg-zinc-900/40 border border-zinc-800/60 rounded-xl p-2.5">
                        {p.image ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={p.image} alt="" className="w-11 h-11 rounded-lg object-cover shrink-0 bg-zinc-900" onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }} />
                        ) : (
                          <div className="w-11 h-11 rounded-lg bg-zinc-900 shrink-0 grid place-items-center"><Package className="w-5 h-5 text-zinc-700" /></div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm tracking-tight truncate">{p.name}</p>
                          <p className="text-[11px] text-zinc-500">{num(p.qty)} un · GMV {brl(p.gmv)}</p>
                        </div>
                        <span className="text-emerald-400 font-semibold text-sm shrink-0">{brl(p.commission)}</span>
                      </div>
                    ))}
                  </div>
                </Section>
              ) : null}

              {/* Categorias + Vendedores + UTM + Device */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {agg.byCategory.length > 0 && (
                  <Section acc="cat" icon={Layers} title="Melhores categorias">
                    <div className="space-y-1.5 max-h-[260px] overflow-y-auto scroll-thin">
                      {agg.byCategory.map((c, i) => {
                        const p = agg.byCategory[0]?.commission ? (c.commission / agg.byCategory[0].commission) * 100 : 0;
                        return (
                          <div key={i} className="relative rounded-lg overflow-hidden">
                            <div className="absolute inset-y-0 left-0 bg-orange-500/10" style={{ width: `${Math.max(3, p)}%` }} />
                            <div className="relative flex items-center justify-between gap-3 text-sm px-2.5 py-1.5">
                              <span className="text-zinc-200 truncate">{c.category}</span>
                              <span className="text-zinc-500 text-xs shrink-0">{num(c.qty)} un · <span className="text-emerald-400 font-medium">{brl(c.commission)}</span></span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </Section>
                )}

                {agg.byStore.length > 0 && (
                  <Section acc="store" icon={Store} title="Vendedores que mais venderam" desc="Quem realmente vendeu seus produtos indicados.">
                    <div className="space-y-1.5 max-h-[260px] overflow-y-auto scroll-thin">
                      {agg.byStore.slice(0, 12).map((s, i) => {
                        const p = agg.byStore[0]?.commission ? (s.commission / agg.byStore[0].commission) * 100 : 0;
                        return (
                          <div key={i} className="relative rounded-lg overflow-hidden">
                            <div className="absolute inset-y-0 left-0 bg-yellow-500/10" style={{ width: `${Math.max(3, p)}%` }} />
                            <div className="relative flex items-center justify-between gap-3 text-sm px-2.5 py-1.5">
                              <span className="text-zinc-200 truncate">{s.store}</span>
                              <span className="text-zinc-500 text-xs shrink-0">{num(s.qty)} un · <span className="text-emerald-400 font-medium">{brl(s.commission)}</span></span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </Section>
                )}

                {agg.byUtm.length > 0 && (
                  <Section acc="utm" icon={Tag} title="Vendas por UTM">
                    <div className="space-y-1.5 max-h-[220px] overflow-y-auto scroll-thin">
                      {agg.byUtm.map((u, i) => (
                        <div key={i} className="flex items-center justify-between gap-3 text-sm px-1">
                          <span className="text-zinc-300 truncate font-mono text-xs">{u.utm}</span>
                          <span className="text-zinc-500 text-xs shrink-0">{num(u.conversions)}× · <span className="text-emerald-400 font-medium">{brl(u.commission)}</span></span>
                        </div>
                      ))}
                    </div>
                  </Section>
                )}

                {agg.byDevice.length > 0 && (
                  <Section acc="dev" icon={Smartphone} title="Por dispositivo">
                    <div className="flex flex-wrap gap-2">
                      {agg.byDevice.map((d) => (
                        <div key={d.device} className="bg-zinc-900/50 border border-zinc-800/60 rounded-xl px-3 py-2 text-xs">
                          <span className="text-zinc-300 font-medium">{d.device}</span>
                          <span className="mx-1.5 text-zinc-600">·</span><span className="text-zinc-500">{num(d.conversions)}×</span>
                          <span className="mx-1.5 text-zinc-600">·</span><span className="text-emerald-400">{brl(d.commission)}</span>
                        </div>
                      ))}
                    </div>
                  </Section>
                )}
              </div>
            </div>
          )}

          <p className="text-[11px] text-zinc-600 text-center flex items-center justify-center gap-1.5">
            <MousePointerClick className="w-3 h-3" />
            Shopee/ML: comissões pendentes podem mudar de status. Amazon: agregada por mês (relatório do Associados), recortada pro-rata pela janela.
          </p>
        </div>
      ))}
    </div>
  );
}

function Kpi({ icon: Icon, label, value, highlight, accent }: { icon: React.ElementType; label: string; value: string; highlight?: boolean; accent?: "sky" }) {
  const tone = accent === "sky";
  return (
    <div className={cn("glass rounded-xl p-3", highlight && "border-orange-500/40", tone && "border-sky-500/40")}>
      <div className="flex items-center gap-1.5 mb-0.5">
        <span className={cn("h-5 w-5 rounded-md grid place-items-center border",
          highlight ? "bg-orange-500/15 border-orange-500/30" : tone ? "bg-sky-500/15 border-sky-500/30" : "bg-zinc-900/80 border-zinc-800/70")}>
          <Icon className={cn("w-3 h-3", highlight ? "text-orange-400" : tone ? "text-sky-400" : "text-zinc-400")} strokeWidth={2} />
        </span>
        <span className="text-[10px] uppercase tracking-wider font-semibold text-zinc-400">{label}</span>
      </div>
      <p className={cn("text-2xl font-display font-bold tracking-tight leading-tight", tone ? "text-sky-300" : "text-white")}>{value}</p>
    </div>
  );
}
