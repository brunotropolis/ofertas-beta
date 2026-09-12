"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { Loader2, RefreshCw, Wallet, Package, TrendingUp, Layers, Filter, Megaphone, Zap, ArrowUpRight, ArrowDownRight, ExternalLink, Target } from "lucide-react";
import { cn } from "@/lib/utils";

interface Cell { units: number; commission: number; gmv: number; ads: number; }
interface Prod { product: string; category: string; plat: { shopee: Cell; ml: Cell; amazon: Cell }; tot: Cell; }
interface Resp {
  period: { days: number; hoje: boolean };
  kpis: { units: number; commission: number; gmv: number; ads: number; classificadoPct: number };
  produtos: Prod[];
  categorias: { category: string; units: number; commission: number; gmv: number }[];
  eficiencia: { source: string; ads: number; units: number; commission: number; vdPorAd: number | null; shareVendas: number }[];
  topAnunciados: { product: string; category: string; ads: number; units: number; commission: number; vdPorAd: number | null }[];
  oportunidades: { product: string; category: string; units: number; commission: number; ads: number; campea: string | null; exampleName: string; exampleUrl: string | null }[];
  variacao: { subiram: V[]; cairam: V[] };
  errors: Record<string, string>;
}
interface V { product: string; atual: number; anterior: number; delta: number; }

const PERIODS = [{ v: "0", label: "Hoje" }, { v: "7", label: "7 dias" }, { v: "30", label: "30 dias" }, { v: "90", label: "90 dias" }];
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (n: number) => n.toLocaleString("pt-BR");
const SRC = [{ k: "ml" as const, label: "ML", dot: "bg-yellow-400" }, { k: "amazon" as const, label: "Amazon", dot: "bg-sky-400" }, { k: "shopee" as const, label: "Shopee", dot: "bg-orange-400" }];
const SRCLABEL: Record<string, string> = { ml: "Mercado Livre", amazon: "Amazon", shopee: "Shopee" };
const searchLink = (name: string) => `https://www.google.com/search?q=${encodeURIComponent(name)}`;

// cor de destaque por seção
const ACC: Record<string, { bar: string; icon: string; ring: string }> = {
  efic: { bar: "border-l-amber-500", icon: "text-amber-400", ring: "ring-amber-500/40" },
  oport: { bar: "border-l-emerald-500", icon: "text-emerald-400", ring: "ring-emerald-500/40" },
  top: { bar: "border-l-violet-500", icon: "text-violet-400", ring: "ring-violet-500/40" },
  var: { bar: "border-l-sky-500", icon: "text-sky-400", ring: "ring-sky-500/40" },
  cat: { bar: "border-l-orange-500", icon: "text-orange-400", ring: "ring-orange-500/40" },
  prod: { bar: "border-l-rose-500", icon: "text-rose-400", ring: "ring-rose-500/40" },
};
function Section({ acc, icon: Icon, title, desc, children }: { acc: keyof typeof ACC; icon: React.ElementType; title: string; desc?: string; children: React.ReactNode }) {
  const a = ACC[acc];
  return (
    <div className={cn("glass rounded-2xl p-5 border-l-4", a.bar)}>
      <h2 className="text-white font-display font-semibold tracking-tight text-sm flex items-center gap-2"><Icon className={cn("w-4 h-4", a.icon)} strokeWidth={1.75} /> {title}</h2>
      {desc && <p className="text-[11px] text-zinc-500 mt-0.5 mb-3">{desc}</p>}
      <div className={desc ? "" : "mt-3"}>{children}</div>
    </div>
  );
}
// bordas de coluna
const TH = "py-2 px-2 font-medium border-r border-zinc-800/50 last:border-r-0";
const TD = "py-2 px-2 border-r border-zinc-900/50 last:border-r-0";

export default function AnaliseClient() {
  const [days, setDays] = useState("30");
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cat, setCat] = useState("(todas)");
  const [allCats, setAllCats] = useState(false);
  const [allProds, setAllProds] = useState(false);

  const load = useCallback(async (silent = false) => {
    silent ? setRefreshing(true) : setLoading(true);
    try { const r = await fetch(`/api/vendas/analise?days=${days}`, { cache: "no-store" }); if (r.ok) setData(await r.json()); }
    finally { setLoading(false); setRefreshing(false); }
  }, [days]);
  useEffect(() => { load(); }, [load]);

  const cats = useMemo(() => ["(todas)", ...(data?.categorias.map(c => c.category) ?? [])], [data]);
  const prods = useMemo(() => { const l = data?.produtos ?? []; return cat === "(todas)" ? l : l.filter(p => p.category === cat); }, [data, cat]);
  const champLabel = (s: string | null) => s ? (SRCLABEL[s] ?? s) : "—";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-zinc-500 text-sm">Vendas × Anúncios normalizados e cruzados por plataforma.</p>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 bg-zinc-900/50 border border-zinc-800/70 rounded-full p-1">
            {PERIODS.map(p => (
              <button key={p.v} onClick={() => setDays(p.v)} className={cn("px-3 py-1.5 text-xs font-medium rounded-full transition-all", days === p.v ? "bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-[0_0_12px_rgba(255,107,53,0.35)]" : "text-zinc-400 hover:text-white")}>{p.label}</button>
            ))}
          </div>
          <button onClick={() => load(true)} disabled={refreshing} className="flex items-center gap-2 px-3.5 py-2 bg-zinc-900/70 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs rounded-full transition-colors disabled:opacity-50">
            <RefreshCw className={cn("w-3.5 h-3.5", refreshing && "animate-spin")} strokeWidth={1.75} /> Atualizar
          </button>
        </div>
      </div>

      {loading ? (
        <div className="glass rounded-2xl p-12 text-center"><Loader2 className="w-6 h-6 mx-auto text-zinc-500 animate-spin" /><p className="text-zinc-500 text-sm mt-3">Normalizando e cruzando vendas × anúncios...</p></div>
      ) : !data ? <div className="glass rounded-2xl p-8 text-center text-zinc-400 text-sm">Não deu pra carregar.</div> : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Kpi icon={Wallet} label="Comissão" value={brl(data.kpis.commission)} highlight />
            <Kpi icon={Package} label="Itens vendidos" value={num(data.kpis.units)} />
            <Kpi icon={TrendingUp} label="GMV" value={brl(data.kpis.gmv)} />
            <Kpi icon={Megaphone} label="Anúncios (únicos)" value={num(data.kpis.ads)} />
            <Kpi icon={Layers} label="Classificado" value={`${data.kpis.classificadoPct.toFixed(0)}%`} />
          </div>

          {/* Eficiência por plataforma */}
          <Section acc="efic" icon={Zap} title="Anúncios × Plataforma × Vendas" desc="Por plataforma: anúncios (únicos), vendas, conversão (vendas ÷ anúncio) e participação nas vendas.">
            <div className="overflow-x-auto scroll-thin">
              <table className="w-full text-sm min-w-[560px]">
                <thead><tr className="text-left text-[10px] uppercase tracking-wider text-zinc-500 border-b border-zinc-800/70">
                  <th className={TH}>Plataforma</th><th className={cn(TH, "text-right")}>Anúncios</th><th className={cn(TH, "text-right")}>Vendas (un)</th><th className={cn(TH, "text-right")}>Comissão</th><th className={cn(TH, "text-right")}>Conversão (vd/ad)</th><th className={cn(TH, "text-right")}>% das vendas</th>
                </tr></thead>
                <tbody>
                  {data.eficiencia.map(e => (
                    <tr key={e.source} className="border-b border-zinc-900/60">
                      <td className={cn(TD, "text-zinc-100 font-medium")}><span className="inline-flex items-center gap-1.5"><span className={cn("w-2 h-2 rounded-full", SRC.find(s => s.k === e.source)?.dot)} />{SRCLABEL[e.source] ?? e.source}</span></td>
                      <td className={cn(TD, "text-right text-amber-400/90")}>{num(e.ads)}</td>
                      <td className={cn(TD, "text-right text-zinc-200")}>{num(e.units)}</td>
                      <td className={cn(TD, "text-right text-emerald-400")}>{brl(e.commission)}</td>
                      <td className={cn(TD, "text-right font-semibold text-white")}>{e.vdPorAd == null ? "—" : e.vdPorAd.toFixed(1)}</td>
                      <td className={cn(TD, "text-right text-zinc-400")}>{e.shareVendas.toFixed(0)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          {/* Oportunidades */}
          {data.oportunidades.length > 0 && (
            <Section acc="oport" icon={Target} title="Oportunidades não exploradas" desc="Vende ≥10 un mas ≤3 anúncios no período — vende sozinho, vale anunciar mais. Campeã = plataforma que mais vendeu.">
              <div className="overflow-x-auto scroll-thin">
                <table className="w-full text-sm min-w-[640px]">
                  <thead><tr className="text-left text-[10px] uppercase tracking-wider text-zinc-500 border-b border-zinc-800/70">
                    <th className={TH}>Produto</th><th className={TH}>Categoria</th><th className={cn(TH, "text-right")}>Vendas</th><th className={cn(TH, "text-right")}>Anúncios</th><th className={cn(TH, "text-right")}>Comissão</th><th className={TH}>Campeã</th><th className={cn(TH, "text-center")}>Ver</th>
                  </tr></thead>
                  <tbody>
                    {data.oportunidades.map((o, i) => (
                      <tr key={i} className="border-b border-zinc-900/60">
                        <td className={cn(TD, "text-zinc-100")}>{o.product}</td>
                        <td className={cn(TD, "text-zinc-500 text-xs")}>{o.category}</td>
                        <td className={cn(TD, "text-right text-white font-medium")}>{num(o.units)}</td>
                        <td className={cn(TD, "text-right text-amber-400")}>{o.ads}</td>
                        <td className={cn(TD, "text-right text-emerald-400")}>{brl(o.commission)}</td>
                        <td className={cn(TD, "text-xs")}><span className="inline-flex items-center gap-1"><span className={cn("w-1.5 h-1.5 rounded-full", SRC.find(s => s.k === o.campea)?.dot ?? "bg-zinc-600")} />{champLabel(o.campea)}</span></td>
                        <td className={cn(TD, "text-center")}><a href={o.exampleUrl || searchLink(o.exampleName)} target="_blank" rel="noopener noreferrer" className="inline-flex text-sky-400 hover:text-sky-300" title={o.exampleName}><ExternalLink className="w-3.5 h-3.5" /></a></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {/* Top mais anunciados */}
          {data.topAnunciados.length > 0 && (
            <Section acc="top" icon={Megaphone} title="Top produtos mais anunciados" desc="O que mais postamos no período — e se está convertendo (vd/ad).">
              <div className="overflow-x-auto scroll-thin">
                <table className="w-full text-sm min-w-[520px]">
                  <thead><tr className="text-left text-[10px] uppercase tracking-wider text-zinc-500 border-b border-zinc-800/70">
                    <th className={TH}>Produto</th><th className={TH}>Categoria</th><th className={cn(TH, "text-right")}>Anúncios</th><th className={cn(TH, "text-right")}>Vendas</th><th className={cn(TH, "text-right")}>vd/ad</th>
                  </tr></thead>
                  <tbody>
                    {data.topAnunciados.map((t, i) => (
                      <tr key={i} className="border-b border-zinc-900/60">
                        <td className={cn(TD, "text-zinc-100")}>{t.product}</td>
                        <td className={cn(TD, "text-zinc-500 text-xs")}>{t.category}</td>
                        <td className={cn(TD, "text-right text-violet-300 font-medium")}>{num(t.ads)}</td>
                        <td className={cn(TD, "text-right text-zinc-200")}>{num(t.units)}</td>
                        <td className={cn(TD, "text-right", (t.vdPorAd ?? 0) < 1 ? "text-red-400" : "text-emerald-400")}>{t.vdPorAd == null ? "—" : t.vdPorAd.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {/* Variação */}
          {(data.variacao.subiram.length > 0 || data.variacao.cairam.length > 0) && (
            <Section acc="var" icon={TrendingUp} title="Variação vs período anterior (Mercado Livre)" desc="Unidades vendidas nesta janela vs a janela anterior de mesmo tamanho. (Amazon é snapshot; Shopee entra depois.)">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-emerald-400 mb-2 flex items-center gap-1"><ArrowUpRight className="w-3.5 h-3.5" /> Mais subiram</p>
                  {data.variacao.subiram.map((v, i) => (
                    <div key={i} className="flex items-center justify-between text-sm py-1 border-b border-zinc-900/50"><span className="text-zinc-200 truncate">{v.product}</span><span className="text-zinc-500 text-xs shrink-0">{v.anterior}→{v.atual} <span className="text-emerald-400 font-medium">+{v.delta}</span></span></div>
                  ))}
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-red-400 mb-2 flex items-center gap-1"><ArrowDownRight className="w-3.5 h-3.5" /> Mais caíram</p>
                  {data.variacao.cairam.map((v, i) => (
                    <div key={i} className="flex items-center justify-between text-sm py-1 border-b border-zinc-900/50"><span className="text-zinc-200 truncate">{v.product}</span><span className="text-zinc-500 text-xs shrink-0">{v.anterior}→{v.atual} <span className="text-red-400 font-medium">{v.delta}</span></span></div>
                  ))}
                </div>
              </div>
            </Section>
          )}

          {/* Categorias */}
          <Section acc="cat" icon={Layers} title="Categorias">
            <div className="space-y-1.5">
              {data.categorias.slice(0, allCats ? 999 : 10).map((c, i) => {
                const pct = data.categorias[0]?.commission ? (c.commission / data.categorias[0].commission) * 100 : 0;
                return (
                  <button key={i} onClick={() => setCat(cat === c.category ? "(todas)" : c.category)} className={cn("relative w-full rounded-lg overflow-hidden text-left", cat === c.category && "ring-1 ring-orange-500/50")}>
                    <div className="absolute inset-y-0 left-0 bg-orange-500/10" style={{ width: `${Math.max(3, pct)}%` }} />
                    <div className="relative flex items-center justify-between gap-3 text-sm px-2.5 py-1.5"><span className="text-zinc-200 truncate">{c.category}</span><span className="text-zinc-500 text-xs shrink-0">{num(c.units)} un · <span className="text-emerald-400 font-medium">{brl(c.commission)}</span></span></div>
                  </button>
                );
              })}
            </div>
            {data.categorias.length > 10 && <button onClick={() => setAllCats(v => !v)} className="mt-2 text-xs text-orange-400 hover:text-orange-300">{allCats ? "ver menos" : `ver todas (${data.categorias.length})`}</button>}
          </Section>

          {/* Plataforma × Produto */}
          <Section acc="prod" icon={Package} title="Plataforma × Produto">
            <div className="flex items-center justify-end gap-2 mb-3">
              <Filter className="w-3.5 h-3.5 text-zinc-500" />
              <select value={cat} onChange={e => setCat(e.target.value)} className="bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-200 px-2 py-1.5 outline-none">{cats.map(c => <option key={c} value={c}>{c}</option>)}</select>
            </div>
            <div className="overflow-x-auto scroll-thin">
              <table className="w-full text-sm min-w-[760px]">
                <thead><tr className="text-left text-[10px] uppercase tracking-wider text-zinc-500 border-b border-zinc-800/70">
                  <th className={TH}>Produto</th><th className={TH}>Categoria</th>
                  {SRC.map(s => <th key={s.k} className={cn(TH, "text-right")}><span className="inline-flex items-center gap-1"><span className={cn("w-1.5 h-1.5 rounded-full", s.dot)} />{s.label}</span></th>)}
                  <th className={cn(TH, "text-right")}>Anúncios</th><th className={cn(TH, "text-right")}>Total (un · R$)</th>
                </tr></thead>
                <tbody>
                  {prods.slice(0, allProds ? 999 : 10).map((p, i) => (
                    <tr key={i} className="border-b border-zinc-900/60 hover:bg-zinc-900/30">
                      <td className={cn(TD, "text-zinc-100 tracking-tight")}>{p.product}</td>
                      <td className={cn(TD, "text-zinc-500 text-xs")}>{p.category}</td>
                      {SRC.map(s => { const c = p.plat[s.k]; const best = SRC.every(x => p.plat[x.k].commission <= c.commission) && c.commission > 0; return <td key={s.k} className={cn(TD, "text-right whitespace-nowrap", c.commission > 0 ? (best ? "text-emerald-400 font-medium" : "text-zinc-300") : "text-zinc-700")}>{c.units || c.commission ? `${num(c.units)} · ${brl(c.commission)}` : "—"}</td>; })}
                      <td className={cn(TD, "text-right text-amber-400/80")}>{num(p.tot.ads)}</td>
                      <td className={cn(TD, "text-right whitespace-nowrap")}><span className="text-zinc-400">{num(p.tot.units)}</span> · <span className="text-white font-semibold">{brl(p.tot.commission)}</span></td>
                    </tr>
                  ))}
                  {!prods.length && <tr><td colSpan={7} className="py-6 text-center text-zinc-500 text-sm">Nada no período/categoria.</td></tr>}
                </tbody>
              </table>
            </div>
            {prods.length > 10 && <button onClick={() => setAllProds(v => !v)} className="mt-3 text-xs text-rose-400 hover:text-rose-300">{allProds ? "ver menos" : `ver todos (${prods.length})`}</button>}
            <p className="text-[11px] text-zinc-600 mt-3">Verde = plataforma campeã. "Outros (Amazon)" = agregado de baixo volume não detalhado. Amazon = snapshot do período.</p>
          </Section>
        </>
      )}
    </div>
  );
}

function Kpi({ icon: Icon, label, value, highlight }: { icon: React.ElementType; label: string; value: string; highlight?: boolean }) {
  return (
    <div className={cn("glass rounded-2xl p-4", highlight && "border-orange-500/30")}>
      <div className="flex items-center gap-2 mb-2">
        <span className={cn("h-7 w-7 rounded-lg grid place-items-center border", highlight ? "bg-orange-500/15 border-orange-500/30" : "bg-zinc-900/80 border-zinc-800/70")}><Icon className={cn("w-3.5 h-3.5", highlight ? "text-orange-400" : "text-zinc-400")} strokeWidth={1.75} /></span>
        <span className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</span>
      </div>
      <p className="text-xl font-display font-semibold text-white tracking-tightest">{value}</p>
    </div>
  );
}
