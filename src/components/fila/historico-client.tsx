"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, CheckCircle2, AlertTriangle, RefreshCw, Loader2, Tag, Users, Smartphone,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface LogItem {
  id: string;
  campaign_id: string | null;
  campaign_name: string | null;
  group_jid: string;
  group_name: string | null;
  phone_used: string | null;
  status: "success" | "error";
  sent_at: string;
  error_message: string | null;
  offer: { title: string | null; image_url: string | null; platform: string | null } | null;
}

const PLAT_META: Record<string, { label: string; cls: string }> = {
  amazon: { label: "Amazon", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  shopee: { label: "Shopee", cls: "bg-orange-500/15 text-orange-300 border-orange-500/30" },
  ml:     { label: "Merc. Livre", cls: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30" },
};
function platMeta(p: string | null | undefined) {
  return (p && PLAT_META[p]) || { label: (p || "—").toUpperCase(), cls: "bg-zinc-700/40 text-zinc-300 border-zinc-600/40" };
}

// yyyy-mm-dd (local) de hoje / hoje-N
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function todayStr() { return ymd(new Date()); }
function daysAgoStr(n: number) { const d = new Date(); d.setDate(d.getDate() - n); return ymd(d); }

type Preset = "hoje" | "7d" | "custom";

export default function HistoricoClient() {
  const [items, setItems] = useState<LogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [status, setStatus] = useState<"all" | "success" | "error">("all");
  const [platform, setPlatform] = useState<"all" | "amazon" | "shopee" | "ml">("all");
  const [preset, setPreset] = useState<Preset>("hoje");
  const [from, setFrom] = useState(todayStr());
  const [to, setTo] = useState(todayStr());

  function applyPreset(p: Preset) {
    setPreset(p);
    if (p === "hoje") { setFrom(todayStr()); setTo(todayStr()); }
    else if (p === "7d") { setFrom(daysAgoStr(6)); setTo(todayStr()); }
  }

  async function load(silent = false) {
    silent ? setRefreshing(true) : setLoading(true);
    try {
      const since = new Date(`${from}T00:00:00`).toISOString();
      const until = new Date(`${to}T23:59:59`).toISOString();
      const res = await fetch(`/api/queue/history?since=${since}&until=${until}&limit=1000`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setItems(data.items ?? []);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [from, to]);

  const shown = items.filter((i) =>
    (status === "all" || i.status === status) &&
    (platform === "all" || i.offer?.platform === platform)
  );

  const summary = useMemo(() => ({
    total: shown.length,
    success: shown.filter((i) => i.status === "success").length,
    error: shown.filter((i) => i.status === "error").length,
  }), [shown]);

  // Agrupa por dia (BRT)
  const byDay = new Map<string, LogItem[]>();
  for (const it of shown) {
    const d = new Date(it.sent_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d)!.push(it);
  }

  return (
    <div>
      <div className="flex items-end justify-between mb-6 gap-4 flex-wrap">
        <div>
          <Link href="/fila" className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-orange-400 mb-2 transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" /> Voltar pra fila
          </Link>
          <h1 className="text-3xl font-display font-semibold text-white tracking-tightest">Histórico de envios</h1>
          <p className="text-zinc-500 text-sm mt-1">O que já foi postado, por dia. Cada linha = um envio pra um grupo.</p>
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

      {/* Resumo do período */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <Stat label="Envios" value={summary.total} tone="neutral" />
        <Stat label="Sucessos" value={summary.success} tone="ok" />
        <Stat label="Erros" value={summary.error} tone={summary.error > 0 ? "err" : "neutral"} />
      </div>

      {/* Controles: período + plataforma + status */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <div className="flex gap-1.5 bg-zinc-900/40 border border-zinc-800/70 rounded-full p-1">
          {(["hoje", "7d", "custom"] as const).map((p) => (
            <button
              key={p}
              onClick={() => applyPreset(p)}
              className={cn("px-3.5 py-1.5 text-xs font-medium rounded-full transition-all",
                preset === p ? "bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-[0_0_12px_rgba(255,107,53,0.35)]" : "text-zinc-400 hover:text-white")}
            >
              {p === "hoje" ? "Hoje" : p === "7d" ? "7 dias" : "Personalizado"}
            </button>
          ))}
        </div>

        {preset === "custom" && (
          <div className="flex items-center gap-1.5">
            <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)}
              className="px-2.5 py-1.5 bg-zinc-900/60 border border-zinc-800 rounded-lg text-xs text-zinc-200 focus:border-orange-500/60 outline-none" />
            <span className="text-zinc-600 text-xs">até</span>
            <input type="date" value={to} min={from} max={todayStr()} onChange={(e) => setTo(e.target.value)}
              className="px-2.5 py-1.5 bg-zinc-900/60 border border-zinc-800 rounded-lg text-xs text-zinc-200 focus:border-orange-500/60 outline-none" />
          </div>
        )}

        {/* Plataforma */}
        <div className="flex gap-1.5 bg-zinc-900/40 border border-zinc-800/70 rounded-full p-1">
          {(["all", "amazon", "shopee", "ml"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPlatform(p)}
              className={cn("px-3 py-1.5 text-xs font-medium rounded-full transition-all",
                platform === p ? "bg-zinc-100 text-zinc-900" : "text-zinc-400 hover:text-white")}
            >
              {p === "all" ? "Todas" : p === "ml" ? "ML" : p === "amazon" ? "Amazon" : "Shopee"}
            </button>
          ))}
        </div>

        {/* Status */}
        <div className="flex gap-1.5 bg-zinc-900/40 border border-zinc-800/70 rounded-full p-1">
          {(["all", "success", "error"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setStatus(f)}
              className={cn("px-3 py-1.5 text-xs font-medium rounded-full transition-all",
                status === f ? "bg-gradient-to-r from-orange-500 to-orange-600 text-white" : "text-zinc-400 hover:text-white")}
            >
              {f === "all" ? "Todos" : f === "success" ? "Sucesso" : "Erro"}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="glass rounded-2xl p-12 text-center"><Loader2 className="w-6 h-6 mx-auto text-zinc-500 animate-spin" /></div>
      ) : shown.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center">
          <p className="text-zinc-200 font-medium tracking-tight">Nada postado nesse período</p>
          <p className="text-zinc-500 text-sm mt-1.5">Ajuste o período ou os filtros acima.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {[...byDay.entries()].map(([day, logs]) => (
            <div key={day}>
              <p className="text-xs uppercase tracking-wider text-zinc-500 mb-2 px-1">{day} · {logs.length}</p>
              <div className="space-y-2">
                {logs.map((l) => {
                  const plat = platMeta(l.offer?.platform);
                  const time = new Date(l.sent_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
                  return (
                    <div key={l.id} className="glass rounded-xl flex items-center gap-3 p-2.5">
                      {/* Destaque: horário + plataforma (fora da caixa) */}
                      <div className={cn("shrink-0 flex flex-col items-center justify-center gap-0.5 rounded-xl border px-2.5 py-2 min-w-[84px]", plat.cls)}>
                        <span className="text-[10px] uppercase font-bold tracking-wide leading-none">{plat.label}</span>
                        <span className="text-base font-bold tabular-nums text-white leading-none mt-1">{time}</span>
                      </div>

                      {l.offer?.image_url ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={l.offer.image_url} alt="" className="w-11 h-11 rounded-lg object-cover shrink-0 bg-zinc-900" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                      ) : (
                        <div className="w-11 h-11 rounded-lg bg-zinc-900/80 shrink-0 flex items-center justify-center"><Tag className="w-4 h-4 text-zinc-600" /></div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-zinc-200 truncate">{l.offer?.title ?? <span className="text-zinc-500 italic">oferta removida</span>}</p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap text-[11px] text-zinc-500">
                          <span className="flex items-center gap-1"><Users className="w-3 h-3" />{l.group_name ?? l.group_jid.slice(0, 12)}</span>
                          {l.campaign_name && <span>· {l.campaign_name}</span>}
                          {l.phone_used && <span className="flex items-center gap-1"><Smartphone className="w-3 h-3" />{l.phone_used}</span>}
                        </div>
                        {l.error_message && <p className="text-[11px] text-red-400 mt-0.5 truncate" title={l.error_message}>⚠ {l.error_message}</p>}
                      </div>
                      {l.status === "success" ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "neutral" | "ok" | "err" }) {
  const toneCls = tone === "ok" ? "text-emerald-400" : tone === "err" ? "text-red-400" : "text-white";
  return (
    <div className="glass rounded-2xl p-4">
      <p className="text-[11px] uppercase tracking-wider text-zinc-500">{label}</p>
      <p className={cn("text-2xl font-semibold mt-1 tabular-nums", toneCls)}>{value}</p>
    </div>
  );
}
