"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  Wallet, ShoppingBag, Package, Receipt, RefreshCw, Loader2,
  AlertTriangle, TrendingUp, Tag, Smartphone, MousePointerClick, Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Agg {
  kpis: {
    commission: number; conversions: number; items: number; gmv: number; ticket: number;
    byStatusCount: Record<string, number>;
    byStatusCommission: Record<string, number>;
  };
  byProduct: { name: string; image: string | null; qty: number; commission: number; gmv: number }[];
  byDay: { day: string; commission: number; conversions: number }[];
  byUtm: { utm: string; commission: number; conversions: number }[];
  byDevice: { device: string; commission: number; conversions: number }[];
}
interface SourceResult { ok: boolean; error?: string; live?: boolean; lastSync?: string | null; agg?: Agg; }
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

function emptyAgg(): Agg {
  return {
    kpis: { commission: 0, conversions: 0, items: 0, gmv: 0, ticket: 0, byStatusCount: {}, byStatusCommission: {} },
    byProduct: [], byDay: [], byUtm: [], byDevice: [],
  };
}

// Funde vários aggs (view "Todas").
function mergeAggs(aggs: Agg[]): Agg {
  const out = emptyAgg();
  const dayMap = new Map<string, { commission: number; conversions: number }>();
  const prodMap = new Map<string, Agg["byProduct"][number]>();
  const utmMap = new Map<string, { utm: string; commission: number; conversions: number }>();
  const devMap = new Map<string, { device: string; commission: number; conversions: number }>();

  for (const a of aggs) {
    out.kpis.commission += a.kpis.commission;
    out.kpis.conversions += a.kpis.conversions;
    out.kpis.items += a.kpis.items;
    out.kpis.gmv += a.kpis.gmv;
    for (const [st, c] of Object.entries(a.kpis.byStatusCount)) out.kpis.byStatusCount[st] = (out.kpis.byStatusCount[st] ?? 0) + c;
    for (const [st, c] of Object.entries(a.kpis.byStatusCommission)) out.kpis.byStatusCommission[st] = (out.kpis.byStatusCommission[st] ?? 0) + c;
    for (const d of a.byDay) { const m = dayMap.get(d.day) ?? { commission: 0, conversions: 0 }; m.commission += d.commission; m.conversions += d.conversions; dayMap.set(d.day, m); }
    for (const p of a.byProduct) { const m = prodMap.get(p.name) ?? { name: p.name, image: p.image, qty: 0, commission: 0, gmv: 0 }; m.qty += p.qty; m.commission += p.commission; m.gmv += p.gmv; if (!m.image && p.image) m.image = p.image; prodMap.set(p.name, m); }
    for (const u of a.byUtm) { const m = utmMap.get(u.utm) ?? { utm: u.utm, commission: 0, conversions: 0 }; m.commission += u.commission; m.conversions += u.conversions; utmMap.set(u.utm, m); }
    for (const v of a.byDevice) { const m = devMap.get(v.device) ?? { device: v.device, commission: 0, conversions: 0 }; m.commission += v.commission; m.conversions += v.conversions; devMap.set(v.device, m); }
  }
  out.kpis.ticket = out.kpis.conversions ? out.kpis.gmv / out.kpis.conversions : 0;
  out.byProduct = [...prodMap.values()].sort((a, b) => b.commission - a.commission).slice(0, 25);
  out.byDay = [...dayMap.entries()].map(([day, v]) => ({ day, ...v })).sort((a, b) => a.day.localeCompare(b.day));
  out.byUtm = [...utmMap.values()].sort((a, b) => b.commission - a.commission);
  out.byDevice = [...devMap.values()].sort((a, b) => b.commission - a.commission);
  return out;
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
  const [source, setSource] = useState<SourceKey>("todas");
  const [data, setData] = useState<VendasResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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

  const okAggs = useMemo(() => {
    if (!data) return [] as Agg[];
    return (["shopee", "ml", "amazon"] as const)
      .map((k) => data.sources[k])
      .filter((s) => s.ok && s.agg)
      .map((s) => s.agg!);
  }, [data]);

  // agg da view atual
  const agg: Agg | null = useMemo(() => {
    if (!data) return null;
    if (source === "todas") return okAggs.length ? mergeAggs(okAggs) : emptyAgg();
    const s = data.sources[source];
    return s.ok && s.agg ? s.agg : (s.ok ? emptyAgg() : null);
  }, [data, source, okAggs]);

  const srcErr = source !== "todas" && data && !data.sources[source].ok ? data.sources[source].error : null;
  const maxDay = agg ? Math.max(1, ...agg.byDay.map((d) => d.commission)) : 1;

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
        <div className="flex items-center gap-2">
          <div className="flex gap-1 bg-zinc-900/50 border border-zinc-800/70 rounded-full p-1">
            {PERIODS.map((p) => (
              <button
                key={p.days}
                onClick={() => setDays(p.days)}
                className={cn(
                  "px-3.5 py-1.5 text-xs font-medium rounded-full transition-all",
                  days === p.days
                    ? "bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-[0_0_12px_rgba(255,107,53,0.35)]"
                    : "text-zinc-400 hover:text-white"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-3.5 py-2 bg-zinc-900/70 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs rounded-full transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", refreshing && "animate-spin")} strokeWidth={1.75} />
            Atualizar
          </button>
        </div>
      </div>

      {loading ? (
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
                return (
                  <div key={k} className="glass rounded-2xl p-3.5">
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
                            : <><Clock className="w-2.5 h-2.5" /> {sync ? `sync ${sync}` : "sem sync ainda"}</>}
                        </p>
                      </>
                    ) : (
                      <p className="text-[11px] text-red-400/90 leading-tight mt-1">{s.error || "erro"}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Seletor de fonte */}
          <div className="flex gap-1 bg-zinc-900/50 border border-zinc-800/70 rounded-full p-1 w-fit">
            {([["todas", "Todas"], ["shopee", "Shopee"], ["ml", "Mercado Livre"], ["amazon", "Amazon"]] as [SourceKey, string][]).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setSource(k)}
                className={cn(
                  "px-3.5 py-1.5 text-xs font-medium rounded-full transition-all",
                  source === k ? "bg-zinc-100 text-zinc-900" : "text-zinc-400 hover:text-white"
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {srcErr ? (
            <div className="glass rounded-2xl p-8 text-center">
              <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-red-500/10 border border-red-500/20 mb-4">
                <AlertTriangle className="w-7 h-7 text-red-400" strokeWidth={1.5} />
              </div>
              <p className="text-zinc-200 font-medium tracking-tight">Não deu pra puxar {SOURCE_META[source as Exclude<SourceKey, "todas">]?.label}</p>
              <p className="text-red-400 text-sm mt-1.5">{srcErr}</p>
            </div>
          ) : !agg ? null : agg.kpis.conversions === 0 && agg.kpis.commission === 0 ? (
            <div className="glass rounded-2xl p-10 text-center text-zinc-500 text-sm">
              Nenhuma venda no período{source !== "todas" && source !== "shopee" ? " (rode o sync pra popular esta fonte)" : ""}.
            </div>
          ) : (
            <div className="space-y-5">
              {/* KPIs da fonte/visão */}
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                <Kpi icon={Wallet} label="Comissão" value={brl(agg.kpis.commission)} highlight />
                <Kpi icon={ShoppingBag} label="Conversões" value={num(agg.kpis.conversions)} />
                <Kpi icon={Package} label="Itens" value={num(agg.kpis.items)} />
                <Kpi icon={TrendingUp} label="GMV" value={brl(agg.kpis.gmv)} />
                <Kpi icon={Receipt} label="Ticket méd." value={brl(agg.kpis.ticket)} />
              </div>

              {/* Status */}
              {Object.keys(agg.kpis.byStatusCount).length > 0 && (
                <div className="glass rounded-2xl p-5">
                  <h2 className="text-white font-display font-semibold tracking-tight text-sm mb-3">Status das conversões</h2>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(agg.kpis.byStatusCount).map(([st, count]) => {
                      const meta = STATUS_META[st] ?? STATUS_META.UNKNOWN;
                      return (
                        <div key={st} className={cn("rounded-xl px-3 py-2 text-xs", meta.cls)}>
                          <span className="font-semibold uppercase tracking-wide">{meta.label}</span>
                          <span className="mx-1.5 opacity-60">·</span>
                          {num(count)} venda{count !== 1 ? "s" : ""}
                          <span className="mx-1.5 opacity-60">·</span>
                          {brl(agg.kpis.byStatusCommission[st] ?? 0)}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Timeline por dia */}
              {agg.byDay.length > 0 && (
                <div className="glass rounded-2xl p-5">
                  <h2 className="text-white font-display font-semibold tracking-tight text-sm mb-4">Comissão por dia</h2>
                  <div className="flex items-end gap-1 h-36 overflow-x-auto scroll-thin pb-1">
                    {agg.byDay.map((d) => (
                      <div key={d.day} className="flex flex-col items-center gap-1 min-w-[26px] group">
                        <div className="flex-1 flex items-end w-full">
                          <div
                            className="w-full rounded-t-md bg-gradient-to-t from-orange-600 to-orange-400 transition-all group-hover:from-orange-500 group-hover:to-orange-300"
                            style={{ height: `${Math.max(4, (d.commission / maxDay) * 100)}%` }}
                            title={`${d.day}: ${brl(d.commission)} · ${d.conversions} vendas`}
                          />
                        </div>
                        <span className="text-[9px] text-zinc-600 whitespace-nowrap">{d.day.slice(8, 10)}/{d.day.slice(5, 7)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                {/* Top produtos */}
                <div className="glass rounded-2xl p-5">
                  <h2 className="text-white font-display font-semibold tracking-tight text-sm mb-4 flex items-center gap-2">
                    <Package className="w-4 h-4 text-orange-400" strokeWidth={1.75} />
                    Produtos mais vendidos
                  </h2>
                  <div className="space-y-2 max-h-[420px] overflow-y-auto scroll-thin">
                    {agg.byProduct.map((p, i) => (
                      <div key={i} className="flex items-center gap-3 bg-zinc-900/40 border border-zinc-800/60 rounded-xl p-2.5">
                        {p.image ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={p.image} alt="" className="w-11 h-11 rounded-lg object-cover shrink-0 bg-zinc-900"
                            onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }} />
                        ) : (
                          <div className="w-11 h-11 rounded-lg bg-zinc-900 shrink-0 grid place-items-center">
                            <Package className="w-5 h-5 text-zinc-700" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm tracking-tight truncate">{p.name}</p>
                          <p className="text-[11px] text-zinc-500">{num(p.qty)} un · GMV {brl(p.gmv)}</p>
                        </div>
                        <span className="text-emerald-400 font-semibold text-sm shrink-0">{brl(p.commission)}</span>
                      </div>
                    ))}
                    {agg.byProduct.length === 0 && (
                      <p className="text-zinc-500 text-sm">
                        {source === "amazon" ? "A Amazon entra por dia (sem detalhe por produto)." : "Sem produtos no período."}
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-5">
                  {/* UTMs */}
                  {agg.byUtm.length > 0 && (
                    <div className="glass rounded-2xl p-5">
                      <h2 className="text-white font-display font-semibold tracking-tight text-sm mb-4 flex items-center gap-2">
                        <Tag className="w-4 h-4 text-orange-400" strokeWidth={1.75} />
                        Vendas por UTM
                      </h2>
                      <div className="space-y-1.5 max-h-[200px] overflow-y-auto scroll-thin">
                        {agg.byUtm.map((u, i) => (
                          <div key={i} className="flex items-center justify-between gap-3 text-sm px-1">
                            <span className="text-zinc-300 truncate font-mono text-xs">{u.utm}</span>
                            <span className="text-zinc-500 text-xs shrink-0">
                              {num(u.conversions)}× · <span className="text-emerald-400 font-medium">{brl(u.commission)}</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Device */}
                  {agg.byDevice.length > 0 && (
                    <div className="glass rounded-2xl p-5">
                      <h2 className="text-white font-display font-semibold tracking-tight text-sm mb-4 flex items-center gap-2">
                        <Smartphone className="w-4 h-4 text-orange-400" strokeWidth={1.75} />
                        Por dispositivo
                      </h2>
                      <div className="flex flex-wrap gap-2">
                        {agg.byDevice.map((d) => (
                          <div key={d.device} className="bg-zinc-900/50 border border-zinc-800/60 rounded-xl px-3 py-2 text-xs">
                            <span className="text-zinc-300 font-medium">{d.device}</span>
                            <span className="mx-1.5 text-zinc-600">·</span>
                            <span className="text-zinc-500">{num(d.conversions)}×</span>
                            <span className="mx-1.5 text-zinc-600">·</span>
                            <span className="text-emerald-400">{brl(d.commission)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <p className="text-[11px] text-zinc-600 text-center flex items-center justify-center gap-1.5">
            <MousePointerClick className="w-3 h-3" />
            Shopee/ML: comissões pendentes podem mudar de status. Amazon: dados por dia via sync.
          </p>
        </div>
      )}
    </div>
  );
}

function Kpi({ icon: Icon, label, value, highlight }: { icon: React.ElementType; label: string; value: string; highlight?: boolean }) {
  return (
    <div className={cn("glass rounded-2xl p-4", highlight && "border-orange-500/30")}>
      <div className="flex items-center gap-2 mb-2">
        <span className={cn(
          "h-7 w-7 rounded-lg grid place-items-center border",
          highlight ? "bg-orange-500/15 border-orange-500/30" : "bg-zinc-900/80 border-zinc-800/70"
        )}>
          <Icon className={cn("w-3.5 h-3.5", highlight ? "text-orange-400" : "text-zinc-400")} strokeWidth={1.75} />
        </span>
        <span className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</span>
      </div>
      <p className="text-xl font-display font-semibold text-white tracking-tightest">{value}</p>
    </div>
  );
}
