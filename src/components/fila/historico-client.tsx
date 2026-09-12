"use client";

import { useEffect, useState } from "react";
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

interface Summary { total_24h: number; success_24h: number; error_24h: number }

export default function HistoricoClient() {
  const [items, setItems] = useState<LogItem[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<"all" | "success" | "error">("all");

  async function load(silent = false) {
    silent ? setRefreshing(true) : setLoading(true);
    try {
      const res = await fetch("/api/queue/history?limit=300", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setItems(data.items ?? []);
        setSummary(data.summary ?? null);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { load(); }, []);

  const shown = items.filter((i) => filter === "all" || i.status === filter);

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
          <p className="text-zinc-500 text-sm mt-1">Cada linha = um envio pra um grupo. Sucesso ou erro, com o telefone usado.</p>
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

      {/* Resumo 24h */}
      {summary && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <Stat label="Envios (24h)" value={summary.total_24h} tone="neutral" />
          <Stat label="Sucessos (24h)" value={summary.success_24h} tone="ok" />
          <Stat label="Erros (24h)" value={summary.error_24h} tone={summary.error_24h > 0 ? "err" : "neutral"} />
        </div>
      )}

      {/* Filtro */}
      <div className="flex gap-1.5 mb-6 bg-zinc-900/40 border border-zinc-800/70 rounded-full p-1 w-fit">
        {(["all", "success", "error"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "px-4 py-1.5 text-xs font-medium rounded-full transition-all",
              filter === f
                ? "bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-[0_0_12px_rgba(255,107,53,0.35)]"
                : "text-zinc-400 hover:text-white"
            )}
          >
            {f === "all" ? "Todos" : f === "success" ? "Sucesso" : "Erro"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="glass rounded-2xl p-12 text-center"><Loader2 className="w-6 h-6 mx-auto text-zinc-500 animate-spin" /></div>
      ) : shown.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center">
          <p className="text-zinc-200 font-medium tracking-tight">Sem envios ainda</p>
          <p className="text-zinc-500 text-sm mt-1.5">Quando o motor publicar, o registro aparece aqui.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {[...byDay.entries()].map(([day, logs]) => (
            <div key={day}>
              <p className="text-xs uppercase tracking-wider text-zinc-500 mb-2 px-1">{day} · {logs.length}</p>
              <div className="glass rounded-2xl divide-y divide-zinc-800/60 overflow-hidden">
                {logs.map((l) => (
                  <div key={l.id} className="flex items-center gap-3 p-3">
                    {l.offer?.image_url ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={l.offer.image_url} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0 bg-zinc-900" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-zinc-900/80 shrink-0 flex items-center justify-center"><Tag className="w-4 h-4 text-zinc-600" /></div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-zinc-200 truncate">{l.offer?.title ?? <span className="text-zinc-500 italic">oferta removida</span>}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap text-[11px] text-zinc-500">
                        <span className="flex items-center gap-1"><Users className="w-3 h-3" />{l.group_name ?? l.group_jid.slice(0, 12)}</span>
                        {l.campaign_name && <span>· {l.campaign_name}</span>}
                        {l.phone_used && <span className="flex items-center gap-1"><Smartphone className="w-3 h-3" />{l.phone_used}</span>}
                        <span>· {new Date(l.sent_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                      </div>
                      {l.error_message && <p className="text-[11px] text-red-400 mt-0.5 truncate" title={l.error_message}>⚠ {l.error_message}</p>}
                    </div>
                    {l.status === "success" ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                    )}
                  </div>
                ))}
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
