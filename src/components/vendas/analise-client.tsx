"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { Loader2, RefreshCw, Wallet, Package, TrendingUp, Layers, Filter, Megaphone, Zap, ArrowUpRight, ArrowDownRight, ExternalLink, Target, ChevronLeft, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Cell { units: number; commission: number; gmv: number; ads: number; }
interface Prod { product: string; category: string; plat: { shopee: Cell; ml: Cell; amazon: Cell }; tot: Cell; exampleName: string; exampleUrl: string | null; }
interface Resp {
  period: { days: number; hoje: boolean };
  kpis: { units: number; commission: number; gmv: number; ads: number; classificadoPct: number };
  produtos: Prod[];
  categorias: { category: string; units: number; commission: number; gmv: number }[];
  eficiencia: { source: string; ads: number; units: number; commission: number; vdPorAd: number | null; shareVendas: number }[];
  topAnunciados: { product: string; category: string; ads: number; units: number; commission: number; vdPorAd: number | null }[];
  oportunidades: { product: string; category: string; units: number; commission: number; ads: number; campea: string | null; exampleName: string; exampleUrl: string | null }[];
  variacao: { subiram: V[]; cairam: V[] };
  amazonOcultos: { units: number; commission: number; gmv: number };
  errors: Record<string, string>;
}
interface V { product: string; atual: number; anterior: number; delta: number; }

const PERIODS = [{ v: "0", label: "Hoje" }, { v: "7", label: "7 dias" }, { v: "30", label: "30 dias" }, { v: "90", label: "90 dias" }];
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (n: number) => n.toLocaleString("pt-BR");
const pct = (r: number | null | undefined) => (r == null || !Number.isFinite(r)) ? "—" : `${(r * 100).toFixed(0)}%`;
const SRC = [{ k: "ml" as const, label: "ML", dot: "bg-yellow-400" }, { k: "amazon" as const, label: "Amazon", dot: "bg-sky-400" }, { k: "shopee" as const, label: "Shopee", dot: "bg-orange-400" }];
const SRCLABEL: Record<string, string> = { ml: "Mercado Livre", amazon: "Amazon", shopee: "Shopee" };
const srchLink = (name: string) => `https://www.google.com/search?q=${encodeURIComponent(name)}`;
const dotOf = (s: string | null) => SRC.find(x => x.k === s)?.dot ?? "bg-zinc-600";

const ACC: Record<string, string> = { efic: "border-l-amber-500", oport: "border-l-emerald-500", top: "border-l-violet-500", var: "border-l-sky-500", cat: "border-l-orange-500", prod: "border-l-rose-500", outros: "border-l-zinc-500" };
const ICO: Record<string, string> = { efic: "text-amber-400", oport: "text-emerald-400", top: "text-violet-400", var: "text-sky-400", cat: "text-orange-400", prod: "text-rose-400", outros: "text-zinc-400" };
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
// tabela densa com contorno de coluna visível
const TH = "py-2 px-2.5 font-semibold text-zinc-400 border border-zinc-700/60 bg-zinc-900/40";
const TD = "py-1.5 px-2.5 border border-zinc-800/70";
const isAgg = (s: string) => /outros \(amazon/i.test(s || "");
const VerLink = ({ url, name }: { url: string | null; name: string }) => {
  if (isAgg(name)) return null; // agregado da Amazon não é um produto — sem link
  return <a href={url || srchLink(name)} target="_blank" rel="noopener noreferrer" title={name} className="inline-flex text-sky-400/80 hover:text-sky-300 shrink-0"><ExternalLink className="w-3.5 h-3.5" /></a>;
};

export default function AnaliseClient() {
  const [days, setDays] = useState("30");
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cat, setCat] = useState("(todas)");
  const [full, setFull] = useState<null | "produtos" | "categorias" | "outros" | "oport">(null);

  const load = useCallback(async (silent = false) => {
    silent ? setRefreshing(true) : setLoading(true);
    try { const r = await fetch(`/api/vendas/analise?days=${days}`, { cache: "no-store" }); if (r.ok) setData(await r.json()); }
    finally { setLoading(false); setRefreshing(false); }
  }, [days]);
  useEffect(() => { load(); }, [load]);

  const catsMain = useMemo(() => (data?.categorias ?? []).filter(c => c.category !== "Outros"), [data]);
  const outrosCat = useMemo(() => (data?.categorias ?? []).find(c => c.category === "Outros"), [data]);
  const catOptions = useMemo(() => ["(todas)", ...catsMain.map(c => c.category)], [catsMain]);
  // Plataforma×Produto: só classificados (Outros tem seção própria)
  const prods = useMemo(() => { const l = (data?.produtos ?? []).filter(p => p.category !== "Outros"); return cat === "(todas)" ? l : l.filter(p => p.category === cat); }, [data, cat]);
  const outrosProds = useMemo(() => (data?.produtos ?? []).filter(p => p.category === "Outros"), [data]);
  const champLabel = (s: string | null) => s ? (SRCLABEL[s] ?? s) : "—";

  // ---- tabela Plataforma × Produto (reutilizada no dash e na página cheia) ----
  const ProdTable = ({ rows }: { rows: Prod[] }) => (
    <div className="overflow-x-auto scroll-thin">
      <table className="w-full text-[13px] min-w-[820px] border-collapse">
        <thead><tr>
          <th className={cn(TH, "text-left")}>Produto</th><th className={cn(TH, "text-left")}>Categoria</th>
          {SRC.map(s => <th key={s.k} className={cn(TH, "text-right")}><span className="inline-flex items-center gap-1"><span className={cn("w-1.5 h-1.5 rounded-full", s.dot)} />{s.label}</span></th>)}
          <th className={cn(TH, "text-right")}>Anún.</th><th className={cn(TH, "text-right")}>Total (un · R$)</th>
        </tr></thead>
        <tbody>
          {rows.map((p, i) => (
            <tr key={i} className="hover:bg-zinc-800/30">
              <td className={cn(TD, "text-zinc-100")}><span className="inline-flex items-center gap-1.5">{p.product} <VerLink url={p.exampleUrl} name={p.exampleName} /></span></td>
              <td className={cn(TD, "text-zinc-400")}>{p.category}</td>
              {SRC.map(s => { const c = p.plat[s.k]; const best = SRC.every(x => p.plat[x.k].commission <= c.commission) && c.commission > 0; return <td key={s.k} className={cn(TD, "text-right whitespace-nowrap", c.commission > 0 ? (best ? "text-emerald-400 font-semibold" : "text-zinc-300") : "text-zinc-700")}>{c.units || c.commission ? `${num(c.units)} · ${brl(c.commission)}` : "—"}</td>; })}
              <td className={cn(TD, "text-right text-amber-400/90")}>{num(p.tot.ads)}</td>
              <td className={cn(TD, "text-right whitespace-nowrap")}><span className="text-zinc-400">{num(p.tot.units)}</span> · <span className="text-white font-semibold">{brl(p.tot.commission)}</span></td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={7} className="py-6 text-center text-zinc-500 border border-zinc-800/70">Nada no período/categoria.</td></tr>}
        </tbody>
      </table>
    </div>
  );

  const OportTable = ({ rows }: { rows: Resp["oportunidades"] }) => (
    <div className="overflow-x-auto scroll-thin">
      <table className="w-full text-[13px] min-w-[620px] border-collapse">
        <thead><tr>
          <th className={cn(TH, "text-left")}>Produto</th><th className={cn(TH, "text-left")}>Categoria</th><th className={cn(TH, "text-right")}>Vendas</th><th className={cn(TH, "text-right")}>Anún.</th><th className={cn(TH, "text-right")}>Comissão</th><th className={cn(TH, "text-left")}>Campeã</th>
        </tr></thead>
        <tbody>{rows.map((o, i) => (
          <tr key={i} className="hover:bg-zinc-800/30">
            <td className={cn(TD, "text-zinc-100")}><span className="inline-flex items-center gap-1.5">{o.product} <VerLink url={o.exampleUrl} name={o.exampleName} /></span></td>
            <td className={cn(TD, "text-zinc-400")}>{o.category}</td>
            <td className={cn(TD, "text-right text-white font-semibold")}>{num(o.units)}</td>
            <td className={cn(TD, "text-right text-amber-400")}>{o.ads}</td>
            <td className={cn(TD, "text-right text-emerald-400")}>{brl(o.commission)}</td>
            <td className={cn(TD, "text-zinc-300")}><span className="inline-flex items-center gap-1"><span className={cn("w-1.5 h-1.5 rounded-full", dotOf(o.campea))} />{champLabel(o.campea)}</span></td>
          </tr>))}</tbody>
      </table>
    </div>
  );

  const header = (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <p className="text-zinc-400 text-sm">Vendas × Anúncios normalizados e cruzados por plataforma.</p>
      <div className="flex items-center gap-2">
        <div className="flex gap-0.5 bg-zinc-900/60 border border-zinc-800 rounded-full p-0.5">
          {PERIODS.map(p => (<button key={p.v} onClick={() => setDays(p.v)} className={cn("px-3 py-1 text-xs font-semibold rounded-full transition-all", days === p.v ? "bg-gradient-to-r from-orange-500 to-orange-600 text-white" : "text-zinc-400 hover:text-white")}>{p.label}</button>))}
        </div>
        <button onClick={() => load(true)} disabled={refreshing} className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900/70 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs font-medium rounded-full disabled:opacity-50">
          <RefreshCw className={cn("w-3.5 h-3.5", refreshing && "animate-spin")} strokeWidth={2} /> Atualizar
        </button>
      </div>
    </div>
  );

  if (loading) return <div className="space-y-4">{header}<div className="glass rounded-xl p-12 text-center"><Loader2 className="w-6 h-6 mx-auto text-zinc-500 animate-spin" /><p className="text-zinc-500 text-sm mt-3">Cruzando vendas × anúncios...</p></div></div>;
  if (!data) return <div className="space-y-4">{header}<div className="glass rounded-xl p-8 text-center text-zinc-400 text-sm">Não deu pra carregar.</div></div>;

  // ---- páginas cheias (ver todos) ----
  if (full) {
    const back = <button onClick={() => setFull(null)} className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 rounded-lg text-xs font-semibold text-white shrink-0"><ChevronLeft className="w-4 h-4" /> Voltar</button>;
    return (
      <div className="space-y-4">
        {header}
        {full === "produtos" && (
          <Section acc="prod" icon={Package} title={`Todos os produtos (${prods.length})`} right={back}>
            <div className="flex items-center justify-end gap-2 mb-3"><Filter className="w-3.5 h-3.5 text-zinc-500" /><select value={cat} onChange={e => setCat(e.target.value)} className="bg-zinc-900 border border-zinc-700 rounded-lg text-xs text-zinc-200 px-2 py-1.5 outline-none">{catOptions.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
            <ProdTable rows={prods} />
          </Section>
        )}
        {full === "categorias" && (
          <Section acc="cat" icon={Layers} title={`Todas as categorias (${catsMain.length})`} right={back}>
            <div className="space-y-1">{catsMain.map((c, i) => { const pct = catsMain[0]?.commission ? (c.commission / catsMain[0].commission) * 100 : 0; return (
              <button key={i} onClick={() => { setCat(c.category); setFull("produtos"); }} className="relative w-full rounded-lg overflow-hidden text-left">
                <div className="absolute inset-y-0 left-0 bg-orange-500/10" style={{ width: `${Math.max(3, pct)}%` }} />
                <div className="relative flex items-center justify-between gap-3 text-sm px-2.5 py-1.5"><span className="text-zinc-100">{c.category}</span><span className="text-zinc-400 text-xs">{num(c.units)} un · <span className="text-emerald-400 font-medium">{brl(c.commission)}</span></span></div>
              </button>); })}</div>
          </Section>
        )}
        {full === "outros" && (
          <Section acc="outros" icon={HelpCircle} title={`Não classificados (${outrosProds.length})`} desc="Produtos reais que venderam mas não casaram numa categoria. Clique em Ver pra identificar — me avise os padrões e eu adiciono à taxonomia." right={back}>
            <ProdTable rows={outrosProds} />
          </Section>
        )}
        {full === "oport" && (
          <Section acc="oport" icon={Target} title={`Oportunidades não exploradas (${data.oportunidades.length})`} desc="Vende ≥10 un mas ≤3 anúncios — vende sozinho, vale anunciar. Campeã = quem mais vendeu." right={back}>
            <OportTable rows={data.oportunidades} />
          </Section>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {header}
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5">
        <Kpi icon={Wallet} label="Comissão" value={brl(data.kpis.commission)} highlight />
        <Kpi icon={Package} label="Itens vendidos" value={num(data.kpis.units)} />
        <Kpi icon={TrendingUp} label="GMV" value={brl(data.kpis.gmv)} />
        <Kpi icon={Megaphone} label="Anúncios (únicos)" value={num(data.kpis.ads)} />
        <Kpi icon={Layers} label="Classificado" value={`${data.kpis.classificadoPct.toFixed(0)}%`} />
      </div>
      {data.amazonOcultos.commission > 0 && (
        <p className="text-[11px] text-zinc-400 flex items-start gap-1.5 px-1"><HelpCircle className="w-3.5 h-3.5 text-sky-400/70 shrink-0 mt-px" /> Do total, <span className="text-zinc-200 font-medium">&nbsp;{brl(data.amazonOcultos.commission)}&nbsp;</span> ({num(data.amazonOcultos.units)} un) são vendas Amazon de baixo volume que <b className="text-zinc-300">a Amazon não detalha por produto</b> (suprime individualmente por política deles) — por isso ficam fora dos rankings, mas contam no total.</p>
      )}

      {/* Anúncios × Plataforma × Vendas */}
      <Section acc="efic" icon={Zap} title="Anúncios × Plataforma × Vendas" desc="Por plataforma (maior conversão primeiro): anúncios únicos, vendas, conversão (vendas ÷ anúncios, em %) e % das vendas.">
        <div className="overflow-x-auto scroll-thin">
          <table className="w-full text-[13px] min-w-[580px] border-collapse">
            <thead><tr>
              <th className={cn(TH, "text-left")}>Plataforma</th><th className={cn(TH, "text-right")}>Anúncios</th><th className={cn(TH, "text-right")}>Vendas</th><th className={cn(TH, "text-right")}>Comissão</th><th className={cn(TH, "text-right")}>Conversão</th><th className={cn(TH, "text-right")}>% vendas</th>
            </tr></thead>
            <tbody>{data.eficiencia.map(e => (
              <tr key={e.source} className="hover:bg-zinc-800/30">
                <td className={cn(TD, "text-zinc-100 font-medium")}><span className="inline-flex items-center gap-1.5"><span className={cn("w-2 h-2 rounded-full", dotOf(e.source))} />{SRCLABEL[e.source] ?? e.source}</span></td>
                <td className={cn(TD, "text-right text-amber-400/90")}>{num(e.ads)}</td>
                <td className={cn(TD, "text-right text-zinc-200")}>{num(e.units)}</td>
                <td className={cn(TD, "text-right text-emerald-400")}>{brl(e.commission)}</td>
                <td className={cn(TD, "text-right font-bold text-white")}>{pct(e.vdPorAd)}</td>
                <td className={cn(TD, "text-right text-zinc-400")}>{e.shareVendas.toFixed(0)}%</td>
              </tr>))}</tbody>
          </table>
        </div>
      </Section>

      {/* Oportunidades */}
      {data.oportunidades.length > 0 && (
        <Section acc="oport" icon={Target} title="Oportunidades não exploradas" desc="Vende ≥10 un mas ≤3 anúncios — vende sozinho, vale anunciar. Campeã = quem mais vendeu." right={data.oportunidades.length > 8 ? <button onClick={() => setFull("oport")} className="text-xs text-emerald-400 hover:text-emerald-300 font-medium">ver todas ({data.oportunidades.length}) →</button> : undefined}>
          <OportTable rows={data.oportunidades.slice(0, 8)} />
        </Section>
      )}

      {/* Top mais anunciados */}
      {data.topAnunciados.length > 0 && (
        <Section acc="top" icon={Megaphone} title="Top mais anunciados" desc="O que mais postamos — e se converte (vendas ÷ anúncios em %, vermelho quando <100%).">
          <div className="overflow-x-auto scroll-thin">
            <table className="w-full text-[13px] min-w-[520px] border-collapse">
              <thead><tr><th className={cn(TH, "text-left")}>Produto</th><th className={cn(TH, "text-left")}>Categoria</th><th className={cn(TH, "text-right")}>Anúncios</th><th className={cn(TH, "text-right")}>Vendas</th><th className={cn(TH, "text-right")}>Conv.</th></tr></thead>
              <tbody>{data.topAnunciados.map((t, i) => (
                <tr key={i} className="hover:bg-zinc-800/30">
                  <td className={cn(TD, "text-zinc-100")}>{t.product}</td><td className={cn(TD, "text-zinc-400")}>{t.category}</td>
                  <td className={cn(TD, "text-right text-violet-300 font-semibold")}>{num(t.ads)}</td><td className={cn(TD, "text-right text-zinc-200")}>{num(t.units)}</td>
                  <td className={cn(TD, "text-right font-medium", (t.vdPorAd ?? 0) < 1 ? "text-red-400" : "text-emerald-400")}>{pct(t.vdPorAd)}</td>
                </tr>))}</tbody>
            </table>
          </div>
        </Section>
      )}

      {/* Variação */}
      {(data.variacao.subiram.length > 0 || data.variacao.cairam.length > 0) && (
        <Section acc="var" icon={TrendingUp} title="Variação vs período anterior (ML)" desc="Unidades vendidas nesta janela vs a janela anterior de mesmo tamanho. Δ = diferença de unidades. Amazon é snapshot; Shopee entra depois.">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
            {([["Subiram", data.variacao.subiram, ArrowUpRight, "text-emerald-400"], ["Caíram", data.variacao.cairam, ArrowDownRight, "text-red-400"]] as const).map(([lbl, rows, Ico, col]) => (
              <div key={lbl}>
                <p className={cn("text-[10px] uppercase tracking-wider mb-1 flex items-center gap-1", col)}><Ico className="w-3.5 h-3.5" /> {lbl}</p>
                <table className="w-full text-[13px] border-collapse">
                  <thead><tr>
                    <th className={cn(TH, "text-left")}>Produto</th><th className={cn(TH, "text-right")}>Antes</th><th className={cn(TH, "text-right")}>Agora</th><th className={cn(TH, "text-right")}>Δ un.</th>
                  </tr></thead>
                  <tbody>{rows.map((v, i) => (
                    <tr key={i} className="hover:bg-zinc-800/30">
                      <td className={cn(TD, "text-zinc-200")}>{v.product}</td>
                      <td className={cn(TD, "text-right text-zinc-400")}>{v.anterior}</td>
                      <td className={cn(TD, "text-right text-zinc-200")}>{v.atual}</td>
                      <td className={cn(TD, "text-right font-semibold", col)}>{v.delta > 0 ? "+" : ""}{v.delta}</td>
                    </tr>))}</tbody>
                </table>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Categorias (sem "Outros") */}
      <Section acc="cat" icon={Layers} title="Categorias" right={catsMain.length > 8 ? <button onClick={() => setFull("categorias")} className="text-xs text-orange-400 hover:text-orange-300">ver todas ({catsMain.length}) →</button> : undefined}>
        <div className="space-y-1">{catsMain.slice(0, 8).map((c, i) => { const pct = catsMain[0]?.commission ? (c.commission / catsMain[0].commission) * 100 : 0; return (
          <button key={i} onClick={() => { setCat(cat === c.category ? "(todas)" : c.category); }} className={cn("relative w-full rounded-lg overflow-hidden text-left", cat === c.category && "ring-1 ring-orange-500/60")}>
            <div className="absolute inset-y-0 left-0 bg-orange-500/10" style={{ width: `${Math.max(3, pct)}%` }} />
            <div className="relative flex items-center justify-between gap-3 text-[13px] px-2.5 py-1.5"><span className="text-zinc-100">{c.category}</span><span className="text-zinc-400 text-xs">{num(c.units)} un · <span className="text-emerald-400 font-medium">{brl(c.commission)}</span></span></div>
          </button>); })}</div>
      </Section>

      {/* Outros — seção própria (tabela igual) */}
      {outrosCat && (
        <Section acc="outros" icon={HelpCircle} title="Não classificados" desc={`${num(outrosCat.units)} un · ${brl(outrosCat.commission)} — produtos reais que venderam mas não casaram numa categoria. Clique em Ver pra identificar; me avise os padrões e eu adiciono à taxonomia (isso vai encolhendo).`} right={outrosProds.length > 8 ? <button onClick={() => setFull("outros")} className="text-xs text-zinc-300 hover:text-white font-medium">ver todos ({outrosProds.length}) →</button> : undefined}>
          <ProdTable rows={outrosProds.slice(0, 8)} />
        </Section>
      )}

      {/* Plataforma × Produto */}
      <Section acc="prod" icon={Package} title="Plataforma × Produto" right={<div className="flex items-center gap-2"><Filter className="w-3.5 h-3.5 text-zinc-500" /><select value={cat} onChange={e => setCat(e.target.value)} className="bg-zinc-900 border border-zinc-700 rounded-lg text-xs text-zinc-200 px-2 py-1 outline-none">{catOptions.map(c => <option key={c} value={c}>{c}</option>)}</select></div>}>
        <ProdTable rows={prods.slice(0, 10)} />
        {prods.length > 10 && <button onClick={() => setFull("produtos")} className="mt-3 text-xs text-rose-400 hover:text-rose-300">ver todos ({prods.length}) →</button>}
        <p className="text-[11px] text-zinc-600 mt-2">Verde = plataforma campeã. Amazon = snapshot do período.</p>
      </Section>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, highlight }: { icon: React.ElementType; label: string; value: string; highlight?: boolean }) {
  return (
    <div className={cn("glass rounded-xl p-3", highlight && "border-orange-500/40")}>
      <div className="flex items-center gap-1.5 mb-0.5">
        <span className={cn("h-5 w-5 rounded-md grid place-items-center border", highlight ? "bg-orange-500/15 border-orange-500/30" : "bg-zinc-900/80 border-zinc-800/70")}><Icon className={cn("w-3 h-3", highlight ? "text-orange-400" : "text-zinc-400")} strokeWidth={2} /></span>
        <span className="text-[10px] uppercase tracking-wider font-semibold text-zinc-400">{label}</span>
      </div>
      <p className="text-2xl font-display font-bold text-white tracking-tight leading-tight">{value}</p>
    </div>
  );
}
