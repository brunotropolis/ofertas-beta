"use client";

import { useEffect, useState } from "react";
import { Smartphone, Store, Tag, RefreshCw, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import KeywordsTab from "./keywords-tab";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export type Numero = {
  url: string; tag: string; ordem: number; numero: string; nome: string; status: string;
  luz: "verde" | "amarelo" | "vermelho"; motivo: string; grupos: number;
  envios_hoje: number; erros_24h: number; rate_24h: number; ultimo_rate: string | null; ultimo_envio: string | null;
};

const LUZ: Record<string, { dot: string; ring: string; label: string }> = {
  verde: { dot: "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]", ring: "border-emerald-500/30", label: "OK" },
  amarelo: { dot: "bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.8)]", ring: "border-amber-500/40", label: "Atenção" },
  vermelho: { dot: "bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)] animate-pulse", ring: "border-red-500/50", label: "Parado" },
};

const ago = (iso?: string | null) => {
  if (!iso) return "nunca";
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 60) return `há ${min} min`;
  if (min < 48 * 60) return `há ${Math.round(min / 60)}h`;
  return `há ${Math.round(min / 1440)} dias`;
};
const final = (n: string) => (n ? n.slice(-4) : "—");

export function Luz({ luz, className }: { luz: string; className?: string }) {
  return <span className={cn("inline-block h-2.5 w-2.5 rounded-full shrink-0", LUZ[luz]?.dot, className)} />;
}

/**
 * O que é do PERFIL (vale pra todas as campanhas): números que disparam, plataformas e palavras-chave.
 * Fica no topo da tela de Campanhas; a campanha só mostra configuração + grupos.
 */
export default function PerfilSaude({ perfilId, perfilNome, onNumeros }: { perfilId: string; perfilNome: string | null; onNumeros?: (n: Numero[]) => void }) {
  const [data, setData] = useState<Any>(null);
  const [tick, setTick] = useState(0);
  const [kwAberto, setKwAberto] = useState(false);

  useEffect(() => {
    let alive = true;
    setData(null);
    fetch(`/api/perfis/${perfilId}/saude${tick > 0 ? "?fresh=1" : ""}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d) { setData(d); onNumeros?.(d.numeros); } })
      .catch(() => {});
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfilId, tick]);

  const numeros: Numero[] = data?.numeros ?? [];
  const plataformas: Any[] = data?.plataformas ?? [];

  return (
    <div className="mb-8 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-wider text-zinc-500">Do perfil {perfilNome ?? ""} · vale pra todas as campanhas</p>
        <button onClick={() => setTick((t) => t + 1)} className="p-1.5 rounded-full text-zinc-500 hover:text-white hover:bg-zinc-800/60" title="Atualizar status">
          <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.75} />
        </button>
      </div>

      {/* Números */}
      <section className="glass rounded-2xl p-5 border-l-2 border-l-emerald-500/60">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-white mb-4">
          <Smartphone className="w-4 h-4 text-emerald-400" strokeWidth={1.75} /> Números que disparam
          {numeros.length > 0 && <span className="text-zinc-500 font-normal">({numeros.length})</span>}
        </h3>
        {!data ? <Skel /> : numeros.length === 0 ? (
          <p className="text-sm text-zinc-500">Nenhum número ligado a este perfil.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {numeros.map((n) => (
              <div key={n.url} className={cn("rounded-xl bg-zinc-900/60 border p-4", LUZ[n.luz]?.ring)}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Luz luz={n.luz} />
                    <span className="text-white font-semibold tabular-nums">final {final(n.numero)}</span>
                  </div>
                  <span className={cn("text-[10.5px] px-1.5 py-px rounded border",
                    n.luz === "verde" ? "text-emerald-300 border-emerald-500/30 bg-emerald-500/10"
                    : n.luz === "amarelo" ? "text-amber-300 border-amber-500/30 bg-amber-500/10"
                    : "text-red-300 border-red-500/30 bg-red-500/10")}>{LUZ[n.luz]?.label}</span>
                </div>
                <p className="text-[11.5px] text-zinc-400 mt-1 truncate">{n.nome || "—"} · {n.numero ? `+${n.numero}` : "sem número"}</p>
                <p className={cn("text-[11.5px] mt-2", n.luz === "verde" ? "text-zinc-500" : n.luz === "amarelo" ? "text-amber-300" : "text-red-300")}>{n.motivo}</p>
                <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-zinc-800/70 text-center">
                  <Mini v={n.grupos} l="grupos" />
                  <Mini v={n.envios_hoje} l="envios hoje" />
                  <Mini v={n.erros_24h} l="erros 24h" alerta={n.erros_24h > 0} />
                </div>
                <p className="text-[10.5px] text-zinc-600 mt-2">
                  último envio {ago(n.ultimo_envio)}
                  {n.rate_24h > 0 && <> · último limite do WhatsApp {ago(n.ultimo_rate)} ({n.rate_24h}x em 24h)</>}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Disparo por campanha */}
      {data?.campanhas?.length > 0 && (
        <section className="glass rounded-2xl p-4 border-l-2 border-l-orange-500/60">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {(data.campanhas as Any[]).map((c) => (
              <div key={c.id} className={cn("rounded-lg bg-zinc-900/60 border px-3 py-2", LUZ[c.luz]?.ring)} title={c.motivo}>
                <div className="flex items-center gap-2">
                  <Luz luz={c.luz} className="h-2 w-2" />
                  <span className="text-[12px] text-white font-medium truncate">{c.nome}</span>
                  <span className="ml-auto text-[10.5px] text-zinc-500 tabular-nums shrink-0">{c.posts_hoje} hoje</span>
                </div>
                <p className={cn("text-[10.5px] mt-0.5 truncate", c.luz === "vermelho" ? "text-red-300" : "text-zinc-500")}>
                  {c.motivo} · último {ago(c.ultimo_envio)}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Plataformas */}
      <section className="glass rounded-2xl p-5 border-l-2 border-l-sky-500/60">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-white mb-4">
          <Store className="w-4 h-4 text-sky-400" strokeWidth={1.75} /> Plataformas
          <span className="text-[11px] text-zinc-500 font-normal">· cadastro das credenciais aqui em breve</span>
        </h3>
        {!data ? <Skel /> : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {plataformas.map((p) => (
              <div key={p.plataforma} className={cn("rounded-xl bg-zinc-900/60 border p-4", LUZ[p.luz]?.ring)}>
                <div className="flex items-center gap-2">
                  <Luz luz={p.luz} />
                  <span className="text-white font-semibold">{p.nome}</span>
                </div>
                <p className={cn("text-[11.5px] mt-2", p.luz === "verde" ? "text-zinc-500" : p.luz === "amarelo" ? "text-amber-300" : "text-red-300")}>{p.motivo}</p>
                <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-zinc-800/70 text-[11px]">
                  <div><p className="text-zinc-500">última coleta</p><p className="text-zinc-200">{ago(p.ultima_coleta)} · {p.coletadas_24h} em 24h</p></div>
                  <div><p className="text-zinc-500">vendas</p><p className="text-zinc-200">{p.vendas && p.vendas.includes("ao vivo") ? p.vendas : `sync ${ago(p.vendas)}`}</p></div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Palavras-chave (perfil) */}
      <section className="glass rounded-2xl border-l-2 border-l-violet-500/60">
        <button onClick={() => setKwAberto((v) => !v)} className="w-full flex items-center justify-between p-5">
          <span className="flex items-center gap-2 text-sm font-semibold text-white">
            <Tag className="w-4 h-4 text-violet-400" strokeWidth={1.75} /> Palavras-chave dos coletores
          </span>
          <span className="flex items-center gap-2 text-[11px] text-zinc-500">
            buscam produto na Shopee, ML e Amazon pro Ofertas Maternas e o Enxoval · Fraldas e Cupons não usam
            <ChevronDown className={cn("w-4 h-4 transition-transform", kwAberto && "rotate-180")} />
          </span>
        </button>
        {kwAberto && <div className="px-5 pb-5"><KeywordsTab perfilId={perfilId} perfilNome={perfilNome} /></div>}
      </section>
    </div>
  );
}

function Mini({ v, l, alerta }: { v: number; l: string; alerta?: boolean }) {
  return (
    <div>
      <p className={cn("text-base font-semibold tabular-nums", alerta ? "text-amber-300" : "text-white")}>{v}</p>
      <p className="text-[10px] text-zinc-500">{l}</p>
    </div>
  );
}

function Skel() {
  return <div className="h-28 rounded-xl bg-zinc-800/40 animate-pulse" />;
}
