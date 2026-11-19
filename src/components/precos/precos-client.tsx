"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, Thermometer, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

// 19/Nov · "caro ou barato?": preço de hoje x últimas semanas, com base no histórico que o banco anota sozinho
// (public.preco_historico, 1 linha por produto/dia). Régua: ver selo().
interface Item {
  produto: string; platform: string | null; titulo: string | null; imagem: string | null;
  preco_atual: number; dia_atual: string; menor: number; mediana: number; maior: number; dias: number; menor_dia: string | null;
}
interface Ponto { dia: string; preco_min: number; preco_max: number; preco_ultimo: number }

type Selo = "barato" | "normal" | "caro" | "pouco";
const MIN_DIAS = 3;
/** barato: no menor preço da janela (até +2%) ou 8% abaixo da mediana · caro: 8% acima da mediana */
function selo(i: Item): Selo {
  if (i.dias < MIN_DIAS || i.maior === i.menor) return i.dias < MIN_DIAS ? "pouco" : "normal";
  if (i.preco_atual <= i.menor * 1.02 || i.preco_atual <= i.mediana * 0.92) return "barato";
  if (i.preco_atual >= i.mediana * 1.08) return "caro";
  return "normal";
}
const SELO: Record<Selo, { label: string; cls: string }> = {
  barato: { label: "🟢 Barato", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  normal: { label: "🟡 Normal", cls: "bg-amber-500/10 text-amber-200 border-amber-500/25" },
  caro:   { label: "🔴 Caro", cls: "bg-red-500/15 text-red-300 border-red-500/30" },
  pouco:  { label: "Pouco histórico", cls: "bg-zinc-700/40 text-zinc-400 border-zinc-600/40" },
};
const PLAT: Record<string, string> = { amazon: "Amazon", ml: "Merc. Livre", shopee: "Shopee" };
const brl = (v: number | null | undefined) => v == null ? "-" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dm = (d: string | null) => d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : "-";
const linkLoja = (p: string) => p.startsWith("amazon:") ? `https://www.amazon.com.br/dp/${p.slice(7)}` : null;

function Grafico({ serie, mediana }: { serie: Ponto[]; mediana: number }) {
  if (serie.length < 2) return <p className="text-xs text-zinc-500">Só 1 dia de leitura até agora.</p>;
  const W = 520, H = 120, P = 8;
  const vals = serie.flatMap((s) => [s.preco_min, s.preco_max]);
  const lo = Math.min(...vals, mediana), hi = Math.max(...vals, mediana);
  const t0 = Date.parse(serie[0].dia), t1 = Date.parse(serie.at(-1)!.dia);
  const x = (d: string) => P + ((Date.parse(d) - t0) / Math.max(1, t1 - t0)) * (W - 2 * P);
  const y = (v: number) => H - P - ((v - lo) / Math.max(0.01, hi - lo)) * (H - 2 * P);
  const linha = serie.map((s, i) => `${i ? "L" : "M"}${x(s.dia).toFixed(1)},${y(s.preco_ultimo).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-28" role="img" aria-label="Preço por dia">
      <line x1={P} x2={W - P} y1={y(mediana)} y2={y(mediana)} stroke="currentColor" className="text-zinc-600" strokeDasharray="4 4" />
      {serie.map((s) => <line key={s.dia} x1={x(s.dia)} x2={x(s.dia)} y1={y(s.preco_min)} y2={y(s.preco_max)} stroke="currentColor" className="text-orange-500/30" strokeWidth={4} strokeLinecap="round" />)}
      <path d={linha} fill="none" stroke="currentColor" className="text-orange-400" strokeWidth={2} />
      {serie.map((s) => <circle key={s.dia} cx={x(s.dia)} cy={y(s.preco_ultimo)} r={2.5} className="fill-orange-300"><title>{`${dm(s.dia)}: ${brl(s.preco_ultimo)}`}</title></circle>)}
    </svg>
  );
}

export default function PrecosClient() {
  const [itens, setItens] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [dias, setDias] = useState(28);
  const [plat, setPlat] = useState<"" | "amazon" | "ml" | "shopee">("");
  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [filtro, setFiltro] = useState<"todos" | Selo>("todos");
  const [aberto, setAberto] = useState<string | null>(null);
  const [series, setSeries] = useState<Record<string, Ponto[]>>({});

  useEffect(() => {
    let vivo = true;
    setLoading(true); setErro(null);
    const qs = new URLSearchParams({ dias: String(dias), ...(plat ? { plat } : {}), ...(buscaAplicada ? { busca: buscaAplicada } : {}) });
    fetch(`/api/precos?${qs}`, { cache: "no-store" })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || r.statusText); return j; })
      .then((j) => { if (vivo) setItens(j.itens ?? []); })
      .catch((e) => { if (vivo) setErro(e.message); })
      .finally(() => { if (vivo) setLoading(false); });
    return () => { vivo = false; };
  }, [dias, plat, buscaAplicada]);

  const comSelo = useMemo(() => itens.map((i) => ({ ...i, selo: selo(i) })), [itens]);
  const contagem = useMemo(() => {
    const c: Record<Selo, number> = { barato: 0, normal: 0, caro: 0, pouco: 0 };
    comSelo.forEach((i) => c[i.selo]++);
    return c;
  }, [comSelo]);
  const lista = comSelo.filter((i) => filtro === "todos" ? i.selo !== "pouco" || !!buscaAplicada : i.selo === filtro);

  async function abrir(p: string) {
    setAberto((a) => (a === p ? null : p));
    if (!series[p]) {
      const r = await fetch(`/api/precos?produto=${encodeURIComponent(p)}&dias=${Math.max(dias, 60)}`, { cache: "no-store" });
      if (r.ok) { const j = await r.json(); setSeries((s) => ({ ...s, [p]: j.serie ?? [] })); }
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Thermometer className="w-5 h-5 text-orange-400" />
        <h1 className="text-lg font-semibold text-zinc-100">Termômetro de preço</h1>
      </div>
      <p className="text-sm text-zinc-400">
        Preço de hoje comparado com o menor, o do meio e o maior das últimas semanas. O banco anota o preço sozinho toda vez que vemos o produto
        (coleta, Amazon Refresh, conferência antes de postar, Telegram, WhatsApp e coletor de fraldas). Produto com menos de {MIN_DIAS} dias de leitura fica em &quot;pouco histórico&quot;.
      </p>

      <div className="flex flex-wrap gap-2 items-center">
        <form onSubmit={(e) => { e.preventDefault(); setBuscaAplicada(busca.trim()); }} className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-lg px-2 flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-zinc-500" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar produto ou código (ASIN, MLB)" className="bg-transparent py-2 text-base md:text-sm text-zinc-100 outline-none flex-1" />
        </form>
        <select value={plat} onChange={(e) => setPlat(e.target.value as typeof plat)} className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-2 text-sm text-zinc-200">
          <option value="">Todas as lojas</option><option value="amazon">Amazon</option><option value="ml">Mercado Livre</option><option value="shopee">Shopee</option>
        </select>
        <select value={dias} onChange={(e) => setDias(Number(e.target.value))} className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-2 text-sm text-zinc-200">
          <option value={14}>Últimas 2 semanas</option><option value={28}>Últimas 4 semanas</option><option value={60}>Últimos 2 meses</option>
        </select>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["todos", "barato", "normal", "caro", "pouco"] as const).map((f) => (
          <button key={f} onClick={() => setFiltro(f)}
            className={cn("px-3 py-1.5 rounded-full text-xs border transition-colors",
              filtro === f ? "bg-orange-500/20 border-orange-500/40 text-orange-200" : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200")}>
            {f === "todos" ? `Com histórico (${contagem.barato + contagem.normal + contagem.caro})` : `${SELO[f].label} (${contagem[f]})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-zinc-400 text-sm py-10 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</div>
      ) : erro ? (
        <p className="text-sm text-red-300">Erro: {erro}</p>
      ) : lista.length === 0 ? (
        <p className="text-sm text-zinc-500 py-10 text-center">Nada aqui ainda. O histórico enche sozinho com o tempo.</p>
      ) : (
        <ul className="space-y-2">
          {lista.map((i) => {
            const s = SELO[i.selo];
            const dif = i.mediana ? Math.round((i.preco_atual / i.mediana - 1) * 100) : 0;
            const loja = linkLoja(i.produto);
            return (
              <li key={i.produto} className="bg-zinc-900/60 border border-zinc-800 rounded-xl">
                <button onClick={() => abrir(i.produto)} className="w-full text-left p-3 flex gap-3 items-center">
                  {i.imagem ? <img src={i.imagem} alt="" className="w-12 h-12 rounded-lg object-contain bg-white shrink-0" loading="lazy" />
                    : <div className="w-12 h-12 rounded-lg bg-zinc-800 shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-zinc-100 line-clamp-2 break-words">{i.titulo || i.produto}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">{PLAT[i.platform ?? ""] ?? i.platform} · {i.dias} dia{i.dias === 1 ? "" : "s"} de leitura · visto {dm(i.dia_atual)}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-zinc-100 tabular-nums">{brl(i.preco_atual)}</p>
                    <span className={cn("inline-block mt-1 px-2 py-0.5 rounded-full text-[11px] border whitespace-nowrap", s.cls)}>{s.label}</span>
                  </div>
                </button>
                {aberto === i.produto && (
                  <div className="px-3 pb-3 space-y-2">
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="bg-zinc-950/60 rounded-lg p-2"><p className="text-[11px] text-zinc-500">Menor</p><p className="text-sm text-emerald-300 tabular-nums">{brl(i.menor)}</p><p className="text-[10px] text-zinc-600">{dm(i.menor_dia)}</p></div>
                      <div className="bg-zinc-950/60 rounded-lg p-2"><p className="text-[11px] text-zinc-500">Do meio</p><p className="text-sm text-zinc-200 tabular-nums">{brl(i.mediana)}</p><p className="text-[10px] text-zinc-600">hoje {dif > 0 ? "+" : ""}{dif}%</p></div>
                      <div className="bg-zinc-950/60 rounded-lg p-2"><p className="text-[11px] text-zinc-500">Maior</p><p className="text-sm text-red-300 tabular-nums">{brl(i.maior)}</p></div>
                    </div>
                    {series[i.produto] ? <Grafico serie={series[i.produto]} mediana={i.mediana} />
                      : <div className="flex items-center gap-2 text-xs text-zinc-500"><Loader2 className="w-3 h-3 animate-spin" /> gráfico…</div>}
                    <div className="flex items-center justify-between text-[11px] text-zinc-500">
                      <span className="font-mono">{i.produto}</span>
                      {loja && <a href={loja} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-orange-300">ver na loja <ExternalLink className="w-3 h-3" /></a>}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
