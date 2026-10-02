"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Send, CheckCircle2, PackageSearch, Wallet, Clock, CalendarClock, ArrowRight, Zap, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePerfil } from "@/lib/profile-context";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const PLAT: Record<string, { label: string; bar: string; chip: string }> = {
  shopee: { label: "Shopee", bar: "bg-orange-500", chip: "bg-orange-500/15 text-orange-300 border-orange-500/30" },
  ml: { label: "Merc. Livre", bar: "bg-yellow-400", chip: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30" },
  amazon: { label: "Amazon", bar: "bg-sky-400", chip: "bg-sky-500/15 text-sky-300 border-sky-500/30" },
};
const plat = (p?: string | null) => (p && PLAT[p]) || { label: (p || "outro").toUpperCase(), bar: "bg-zinc-500", chip: "bg-zinc-700/40 text-zinc-300 border-zinc-600/40" };

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
const dayLabel = (d: string) => {
  const dt = new Date(`${d}T12:00:00Z`);
  return {
    wd: dt.toLocaleDateString("pt-BR", { weekday: "short", timeZone: "UTC" }).replace(".", ""),
    dm: `${d.slice(8, 10)}/${d.slice(5, 7)}`,
  };
};
const ago = (iso?: string | null) => {
  if (!iso) return "nunca";
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 60) return `há ${min} min`;
  if (min < 48 * 60) return `há ${Math.round(min / 60)}h`;
  return `há ${Math.round(min / 1440)} dias`;
};

export default function InicioClient() {
  const { perfilId, perfil } = usePerfil();
  const [data, setData] = useState<Any>(null);
  const [queue, setQueue] = useState<Any[] | null>(null);
  const [vendas, setVendas] = useState<Any>(null);
  const [vendasErr, setVendasErr] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!perfilId) return;
    let alive = true;
    setData(null); setQueue(null);
    const q = `?perfil=${perfilId}`;
    fetch(`/api/inicio${q}`, { cache: "no-store" }).then((r) => r.json()).then((d) => alive && setData(d)).catch(() => {});
    fetch(`/api/queue${q}`, { cache: "no-store" }).then((r) => r.json()).then((d) => alive && setQueue(d.items ?? [])).catch(() => alive && setQueue([]));
    return () => { alive = false; };
  }, [perfilId, tick]);

  useEffect(() => {
    let alive = true;
    setVendas(null); setVendasErr(false);
    fetch(`/api/vendas?days=7`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => alive && setVendas(d))
      .catch(() => alive && setVendasErr(true));
    return () => { alive = false; };
  }, [tick]);

  const k = data?.kpis;
  const camps: Any[] = data?.campaigns ?? [];
  const autoOn = camps.some((c) => c.is_active && c.auto_enqueue);
  const maxDay = Math.max(1, ...((data?.perDay ?? []) as Any[]).map((d) => d.posts));
  const platTotal = Object.values((data?.perPlatform ?? {}) as Record<string, number>).reduce((a, b) => a + b, 0);
  const pending = (queue ?? []).filter((i) => i.status !== "error");

  return (
    <div>
      {/* Cabeçalho */}
      <div className="flex items-end justify-between gap-4 flex-wrap mb-7">
        <div>
          <h1 className="text-3xl font-display font-semibold text-white tracking-tightest">Início</h1>
          <p className="text-zinc-500 text-sm mt-1">
            {perfil?.nome ?? "—"} · últimos 7 dias (hoje incluso)
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn(
            "flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border",
            autoOn ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300" : "bg-zinc-900/70 border-zinc-800 text-zinc-400"
          )}>
            <Zap className="w-3.5 h-3.5" strokeWidth={1.75} />
            Automático {autoOn ? "ligado" : "desligado"}
          </span>
          <span className="text-xs text-zinc-500">último envio {ago(k?.lastSent)}</span>
          <button onClick={() => setTick((t) => t + 1)} className="p-2 rounded-full text-zinc-500 hover:text-white hover:bg-zinc-800/60" title="Atualizar">
            <RefreshCw className="w-4 h-4" strokeWidth={1.75} />
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Kpi tone="orange" icon={Send} label="Posts publicados" value={k ? String(k.posts) : "…"}
          hint={k ? `média ${k.mediaDia.toFixed(1).replace(".", ",")}/dia` : ""} />
        <Kpi tone="emerald" icon={CheckCircle2} label="Envios nos grupos" value={k ? String(k.envios) : "…"}
          hint={k ? (k.taxa == null ? "sem envios" : `${Math.round(k.taxa * 100)}% sucesso · ${k.erros} erro(s)`) : ""} />
        <Kpi tone="sky" icon={PackageSearch} label="Ofertas coletadas" value={k ? String(k.coletadas) : "…"}
          hint={data ? Object.entries(data.coletadas as Record<string, number>).map(([p, n]) => `${plat(p).label} ${n}`).join(" · ") : ""} />
        <Kpi tone="violet" icon={Wallet} label="Comissão (7d)"
          value={vendas ? brl(vendas.combined?.commission ?? 0) : vendasErr ? "erro" : "…"}
          hint={vendas ? `${vendas.combined?.conversions ?? 0} vendas · todas as plataformas` : "carregando vendas…"} />
      </div>

      {/* Posts por dia + por plataforma */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <section className="glass rounded-2xl p-5 lg:col-span-2 border-l-2 border-l-orange-500/70">
          <h3 className="text-sm font-semibold text-white mb-4">Posts por dia</h3>
          {!data ? <Skeleton h={160} /> : (
            <div className="flex items-end gap-2 h-[170px]">
              {(data.perDay as Any[]).map((d) => {
                const l = dayLabel(d.day);
                const h = Math.round((d.posts / maxDay) * 120);
                return (
                  <div key={d.day} className="flex-1 flex flex-col items-center justify-end gap-1.5 min-w-0">
                    <span className="text-xs font-semibold text-white">{d.posts}</span>
                    <div
                      className="w-full max-w-[44px] rounded-t-md bg-gradient-to-t from-orange-600 to-orange-400 shadow-[0_0_14px_-4px_rgba(255,107,53,0.6)]"
                      style={{ height: Math.max(h, d.posts ? 4 : 2), opacity: d.posts ? 1 : 0.25 }}
                    />
                    <span className="text-[10.5px] text-zinc-400 capitalize">{l.wd}</span>
                    <span className="text-[10px] text-zinc-600">{l.dm}</span>
                    {d.erros > 0 && <span className="text-[10px] text-red-400">{d.erros} erro</span>}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="glass rounded-2xl p-5 border-l-2 border-l-sky-500/70">
          <h3 className="text-sm font-semibold text-white mb-4">Publicados por plataforma</h3>
          {!data ? <Skeleton h={120} /> : platTotal === 0 ? (
            <p className="text-sm text-zinc-500">Nenhum post na semana.</p>
          ) : (
            <div className="space-y-3.5">
              {Object.entries(data.perPlatform as Record<string, number>).sort((a, b) => b[1] - a[1]).map(([p, n]) => (
                <div key={p}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-zinc-300">{plat(p).label}</span>
                    <span className="text-zinc-400">{n} · {Math.round((n / platTotal) * 100)}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-zinc-800/80 overflow-hidden">
                    <div className={cn("h-full rounded-full", plat(p).bar)} style={{ width: `${(n / platTotal) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
          {data && Object.keys(data.perGroup).length > 0 && (
            <div className="mt-5 pt-4 border-t border-zinc-800/70">
              <p className="text-[11px] uppercase tracking-wider text-zinc-500 mb-2">Envios por grupo</p>
              {Object.entries(data.perGroup as Record<string, number>).sort((a, b) => b[1] - a[1]).map(([g, n]) => (
                <div key={g} className="flex justify-between text-xs py-0.5">
                  <span className="text-zinc-300 truncate pr-2">{g}</span><span className="text-zinc-400">{n}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Fila + Agendados */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <section className="glass rounded-2xl p-5 border-l-2 border-l-emerald-500/70">
          <div className="flex items-center justify-between mb-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
              <Clock className="w-4 h-4 text-emerald-400" strokeWidth={1.75} /> Na fila
              {queue && <span className="text-zinc-500 font-normal">({pending.length})</span>}
            </h3>
            <Link href="/fila" className="flex items-center gap-1 text-xs text-zinc-400 hover:text-orange-300">Abrir fila <ArrowRight className="w-3 h-3" /></Link>
          </div>
          {!queue ? <Skeleton h={160} /> : pending.length === 0 ? (
            <p className="text-sm text-zinc-500">Fila vazia.{autoOn ? " O automático põe a próxima oferta em até 5 min (dentro da janela)." : ""}</p>
          ) : (
            <ul className="divide-y divide-zinc-800/70">
              {pending.slice(0, 8).map((i) => (
                <li key={i.id} className="flex items-center gap-3 py-2.5">
                  {i.offer?.image_url
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={i.offer.image_url} alt="" className="h-10 w-10 rounded-lg object-cover bg-zinc-800 shrink-0" />
                    : <div className="h-10 w-10 rounded-lg bg-zinc-800 shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-zinc-200 truncate">{i.offer?.title ?? "(sem título)"}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={cn("text-[10px] px-1.5 py-px rounded border", plat(i.offer?.platform).chip)}>{plat(i.offer?.platform).label}</span>
                      <span className="text-[10.5px] text-zinc-500">{i.created_by ? "manual" : "automático"}</span>
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-emerald-300 tabular-nums shrink-0">
                    {i.status === "publishing" ? "enviando" : i.eta ? hhmm(i.eta) : "—"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="glass rounded-2xl p-5 border-l-2 border-l-violet-500/70">
          <div className="flex items-center justify-between mb-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
              <CalendarClock className="w-4 h-4 text-violet-400" strokeWidth={1.75} /> Agendados
              {data && <span className="text-zinc-500 font-normal">({data.agendados.length})</span>}
            </h3>
            <Link href="/agendamento" className="flex items-center gap-1 text-xs text-zinc-400 hover:text-orange-300">Agendamento <ArrowRight className="w-3 h-3" /></Link>
          </div>
          {!data ? <Skeleton h={120} /> : data.agendados.length === 0 ? (
            <p className="text-sm text-zinc-500">Nenhum post agendado.</p>
          ) : (
            <ul className="divide-y divide-zinc-800/70">
              {(data.agendados as Any[]).slice(0, 8).map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm text-zinc-200 truncate">{s.title}</p>
                    <p className="text-[10.5px] text-zinc-500">
                      {s.repeat_type === "once" ? "uma vez" : s.repeat_type === "daily" ? "diário" : "semanal"}
                      {s.repeat_type !== "once" && ` · ${s.repeat_count}/${s.repeat_limit}`}
                    </p>
                  </div>
                  <span className="text-xs text-violet-300 shrink-0">
                    {new Date(s.scheduled_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Vendas por plataforma */}
      <section className="glass rounded-2xl p-5 border-l-2 border-l-violet-500/70">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white">Vendas de afiliado · 7 dias</h3>
          <Link href="/vendas" className="flex items-center gap-1 text-xs text-zinc-400 hover:text-orange-300">Ver vendas <ArrowRight className="w-3 h-3" /></Link>
        </div>
        {!vendas ? (vendasErr ? <p className="text-sm text-red-400">Não consegui carregar as vendas.</p> : <Skeleton h={70} />) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {(["shopee", "ml", "amazon"] as const).map((src) => {
              const s = vendas.sources?.[src];
              const stale = s?.lastSync && Date.now() - new Date(s.lastSync).getTime() > 3 * 86400_000;
              return (
                <div key={src} className="rounded-xl bg-zinc-900/60 border border-zinc-800/70 p-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className={cn("text-[10.5px] px-1.5 py-px rounded border", plat(src).chip)}>{plat(src).label}</span>
                    <span className={cn("text-[10.5px]", stale ? "text-amber-400" : "text-zinc-500")}>
                      {s?.live ? "ao vivo" : s?.lastSync ? `sync ${ago(s.lastSync)}` : s?.ok === false ? "erro" : "—"}
                    </span>
                  </div>
                  <p className="text-xl font-display font-semibold text-white">{s?.agg ? brl(s.agg.kpis.commission) : "—"}</p>
                  <p className="text-[11px] text-zinc-500">{s?.agg ? `${s.agg.kpis.conversions} vendas · GMV ${brl(s.agg.kpis.gmv)}` : s?.error ?? ""}</p>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

const TONES: Record<string, string> = {
  orange: "from-orange-500/20 to-orange-500/[0.02] border-orange-500/25 text-orange-300",
  emerald: "from-emerald-500/20 to-emerald-500/[0.02] border-emerald-500/25 text-emerald-300",
  sky: "from-sky-500/20 to-sky-500/[0.02] border-sky-500/25 text-sky-300",
  violet: "from-violet-500/20 to-violet-500/[0.02] border-violet-500/25 text-violet-300",
};

function Kpi({ tone, icon: Icon, label, value, hint }: { tone: string; icon: React.ElementType; label: string; value: string; hint: string }) {
  return (
    <div className={cn("rounded-2xl p-5 border bg-gradient-to-br", TONES[tone])}>
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4" strokeWidth={1.75} />
        <span className="text-[11px] uppercase tracking-wider text-zinc-300">{label}</span>
      </div>
      <p className="text-3xl font-display font-semibold text-white tracking-tightest">{value}</p>
      <p className="text-[11.5px] text-zinc-400 mt-1 min-h-[1rem]">{hint}</p>
    </div>
  );
}

function Skeleton({ h }: { h: number }) {
  return <div className="rounded-xl bg-zinc-800/40 animate-pulse" style={{ height: h }} />;
}
