"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { Loader2, RefreshCw, Wallet, Package, TrendingUp, Layers, Filter } from "lucide-react";
import { cn } from "@/lib/utils";

interface Cell { units: number; commission: number; gmv: number; }
interface Prod { product: string; category: string; plat: { shopee: Cell; ml: Cell; amazon: Cell }; tot: Cell; }
interface Resp {
  period: { days: number; hoje: boolean };
  kpis: { units: number; commission: number; gmv: number; classificadoPct: number };
  produtos: Prod[];
  categorias: { category: string; units: number; commission: number; gmv: number }[];
  errors: Record<string, string>;
}

const PERIODS = [
  { v: "0", label: "Hoje" },
  { v: "7", label: "7 dias" },
  { v: "30", label: "30 dias" },
  { v: "90", label: "90 dias" },
];
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (n: number) => n.toLocaleString("pt-BR");
const SRC = [
  { k: "ml" as const, label: "ML", dot: "bg-yellow-400" },
  { k: "amazon" as const, label: "Amazon", dot: "bg-sky-400" },
  { k: "shopee" as const, label: "Shopee", dot: "bg-orange-400" },
];

export default function AnaliseClient() {
  const [days, setDays] = useState("30");
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cat, setCat] = useState<string>("(todas)");

  const load = useCallback(async (silent = false) => {
    silent ? setRefreshing(true) : setLoading(true);
    try {
      const r = await fetch(`/api/vendas/analise?days=${days}`, { cache: "no-store" });
      if (r.ok) setData(await r.json());
    } finally { setLoading(false); setRefreshing(false); }
  }, [days]);
  useEffect(() => { load(); }, [load]);

  const cats = useMemo(() => ["(todas)", ...(data?.categorias.map(c => c.category) ?? [])], [data]);
  const prods = useMemo(() => {
    const list = data?.produtos ?? [];
    return cat === "(todas)" ? list : list.filter(p => p.category === cat);
  }, [data, cat]);
  const maxComm = prods.length ? Math.max(...prods.map(p => p.tot.commission)) : 1;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-zinc-500 text-sm">Produtos normalizados e cruzados por plataforma — onde cada produto vende melhor.</p>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 bg-zinc-900/50 border border-zinc-800/70 rounded-full p-1">
            {PERIODS.map(p => (
              <button key={p.v} onClick={() => setDays(p.v)}
                className={cn("px-3 py-1.5 text-xs font-medium rounded-full transition-all",
                  days === p.v ? "bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-[0_0_12px_rgba(255,107,53,0.35)]" : "text-zinc-400 hover:text-white")}>
                {p.label}
              </button>
            ))}
          </div>
          <button onClick={() => load(true)} disabled={refreshing}
            className="flex items-center gap-2 px-3.5 py-2 bg-zinc-900/70 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs rounded-full transition-colors disabled:opacity-50">
            <RefreshCw className={cn("w-3.5 h-3.5", refreshing && "animate-spin")} strokeWidth={1.75} /> Atualizar
          </button>
        </div>
      </div>

      {loading ? (
        <div className="glass rounded-2xl p-12 text-center"><Loader2 className="w-6 h-6 mx-auto text-zinc-500 animate-spin" /><p className="text-zinc-500 text-sm mt-3">Normalizando e cruzando as 3 fontes...</p></div>
      ) : !data ? <div className="glass rounded-2xl p-8 text-center text-zinc-400 text-sm">Não deu pra carregar.</div> : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi icon={Wallet} label="Comissão" value={brl(data.kpis.commission)} highlight />
            <Kpi icon={Package} label="Itens vendidos" value={num(data.kpis.units)} />
            <Kpi icon={TrendingUp} label="GMV" value={brl(data.kpis.gmv)} />
            <Kpi icon={Layers} label="Classificado" value={`${data.kpis.classificadoPct.toFixed(0)}%`} />
          </div>

          {/* Categorias */}
          <div className="glass rounded-2xl p-5">
            <h2 className="text-white font-display font-semibold tracking-tight text-sm mb-3 flex items-center gap-2"><Layers className="w-4 h-4 text-orange-400" strokeWidth={1.75} /> Categorias</h2>
            <div className="space-y-1.5 max-h-[220px] overflow-y-auto scroll-thin">
              {data.categorias.map((c, i) => {
                const pct = data.categorias[0]?.commission ? (c.commission / data.categorias[0].commission) * 100 : 0;
                return (
                  <button key={i} onClick={() => setCat(cat === c.category ? "(todas)" : c.category)}
                    className={cn("relative w-full rounded-lg overflow-hidden text-left", cat === c.category && "ring-1 ring-orange-500/50")}>
                    <div className="absolute inset-y-0 left-0 bg-orange-500/10" style={{ width: `${Math.max(3, pct)}%` }} />
                    <div className="relative flex items-center justify-between gap-3 text-sm px-2.5 py-1.5">
                      <span className="text-zinc-200 truncate">{c.category}</span>
                      <span className="text-zinc-500 text-xs shrink-0">{num(c.units)} un · <span className="text-emerald-400 font-medium">{brl(c.commission)}</span></span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Plataforma × Produto */}
          <div className="glass rounded-2xl p-5">
            <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
              <h2 className="text-white font-display font-semibold tracking-tight text-sm flex items-center gap-2"><Package className="w-4 h-4 text-orange-400" strokeWidth={1.75} /> Plataforma × Produto</h2>
              <div className="flex items-center gap-2">
                <Filter className="w-3.5 h-3.5 text-zinc-500" />
                <select value={cat} onChange={e => setCat(e.target.value)}
                  className="bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-200 px-2 py-1.5 outline-none">
                  {cats.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div className="overflow-x-auto scroll-thin">
              <table className="w-full text-sm min-w-[720px]">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wider text-zinc-500 border-b border-zinc-800/70">
                    <th className="py-2 pr-3 font-medium">Produto</th>
                    <th className="py-2 px-2 font-medium">Categoria</th>
                    {SRC.map(s => <th key={s.k} className="py-2 px-2 font-medium text-right"><span className="inline-flex items-center gap-1"><span className={cn("w-1.5 h-1.5 rounded-full", s.dot)} />{s.label}</span></th>)}
                    <th className="py-2 pl-2 font-medium text-right">Total (un · R$)</th>
                  </tr>
                </thead>
                <tbody>
                  {prods.map((p, i) => (
                    <tr key={i} className="border-b border-zinc-900/60 hover:bg-zinc-900/30">
                      <td className="py-2 pr-3 text-zinc-100 tracking-tight">{p.product}</td>
                      <td className="py-2 px-2 text-zinc-500 text-xs">{p.category}</td>
                      {SRC.map(s => {
                        const c = p.plat[s.k]; const best = ["ml", "amazon", "shopee"].every(k => (p.plat[k as keyof typeof p.plat].commission) <= c.commission) && c.commission > 0;
                        return <td key={s.k} className={cn("py-2 px-2 text-right whitespace-nowrap", c.commission > 0 ? (best ? "text-emerald-400 font-medium" : "text-zinc-300") : "text-zinc-700")}>
                          {c.units || c.commission ? `${num(c.units)} · ${brl(c.commission)}` : "—"}
                        </td>;
                      })}
                      <td className="py-2 pl-2 text-right whitespace-nowrap"><span className="text-zinc-400">{num(p.tot.units)}</span> · <span className="text-white font-semibold">{brl(p.tot.commission)}</span></td>
                    </tr>
                  ))}
                  {!prods.length && <tr><td colSpan={6} className="py-6 text-center text-zinc-500 text-sm">Nada no período/categoria.</td></tr>}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-zinc-600 mt-3">Verde = plataforma campeã do produto. Amazon entra como snapshot do período semeado (não fatia por dia).</p>
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ icon: Icon, label, value, highlight }: { icon: React.ElementType; label: string; value: string; highlight?: boolean }) {
  return (
    <div className={cn("glass rounded-2xl p-4", highlight && "border-orange-500/30")}>
      <div className="flex items-center gap-2 mb-2">
        <span className={cn("h-7 w-7 rounded-lg grid place-items-center border", highlight ? "bg-orange-500/15 border-orange-500/30" : "bg-zinc-900/80 border-zinc-800/70")}>
          <Icon className={cn("w-3.5 h-3.5", highlight ? "text-orange-400" : "text-zinc-400")} strokeWidth={1.75} />
        </span>
        <span className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</span>
      </div>
      <p className="text-xl font-display font-semibold text-white tracking-tightest">{value}</p>
    </div>
  );
}
