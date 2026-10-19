"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, AlertTriangle, RefreshCw, Loader2, Tag, Users, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

// 1 item = 1 POST (queue × campanha), somado no banco — ver /api/queue/history
interface PostItem {
  queue_id: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
  primeiro: string;
  ultimo: string;
  sucesso: number;
  erros: number;
  numeros: string[];
  erro_exemplo: string | null;
  offer: { title: string | null; image_url: string | null; platform: string | null; kind?: string | null } | null;
}

const PLAT_META: Record<string, { label: string; cls: string }> = {
  amazon: { label: "Amazon", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  shopee: { label: "Shopee", cls: "bg-orange-500/15 text-orange-300 border-orange-500/30" },
  ml:     { label: "Merc. Livre", cls: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30" },
};
function platMeta(p: string | null | undefined) {
  return (p && PLAT_META[p]) || { label: (p || "—").toUpperCase(), cls: "bg-zinc-700/40 text-zinc-300 border-zinc-600/40" };
}
// "waha:waha-ofertas-2" → "nº 2" (o painel de Campanhas mostra qual número é qual)
const numLabel = (t: string) => {
  const m = t.match(/^waha:waha-ofertas(?:-(\d+))?$/);
  return m ? `nº ${m[1] ?? "1"}` : t.replace(/^waha:/, "");
};

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function todayStr() { return ymd(new Date()); }
function daysAgoStr(n: number) { const d = new Date(); d.setDate(d.getDate() - n); return ymd(d); }

type Preset = "hoje" | "7d" | "custom";

export default function HistoricoClient() {
  const [items, setItems] = useState<PostItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [status, setStatus] = useState<"all" | "success" | "error">("all");
  const [platform, setPlatform] = useState<"all" | "amazon" | "shopee" | "ml">("all");
  const [campanha, setCampanha] = useState<string>("all");
  const [preset, setPreset] = useState<Preset>("hoje");
  const [from, setFrom] = useState(todayStr());
  const [to, setTo] = useState(todayStr());
  const [aberto, setAberto] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<Record<string, { group_name: string | null; error_message: string | null; phone_used: string | null }[]>>({});

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
      const res = await fetch(`/api/queue/history?since=${since}&until=${until}`, { cache: "no-store" });
      if (res.ok) setItems((await res.json()).items ?? []);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [from, to]);

  async function abrir(p: PostItem) {
    const k = `${p.queue_id}|${p.campaign_id}`;
    setAberto((a) => (a === k ? null : k));
    if (p.erros > 0 && !detalhe[k] && p.queue_id) {
      const r = await fetch(`/api/queue/history?queue_id=${p.queue_id}&campaign_id=${p.campaign_id ?? ""}`, { cache: "no-store" });
      if (r.ok) { const d = await r.json(); setDetalhe((x) => ({ ...x, [k]: d.erros ?? [] })); }
    }
  }

  const campanhas = useMemo(() => [...new Map(items.filter((i) => i.campaign_id).map((i) => [i.campaign_id!, i.campaign_name ?? "—"])).entries()], [items]);
  const shown = items.filter((i) =>
    (status === "all" || (status === "error" ? i.erros > 0 : i.erros === 0)) &&
    (platform === "all" || i.offer?.platform === platform) &&
    (campanha === "all" || i.campaign_id === campanha)
  );
  const summary = useMemo(() => ({
    posts: shown.length,
    envios: shown.reduce((a, i) => a + i.sucesso, 0),
    erros: shown.reduce((a, i) => a + i.erros, 0),
  }), [shown]);

  const byDay = new Map<string, PostItem[]>();
  for (const it of shown) {
    const d = new Date(it.primeiro).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d)!.push(it);
  }

  const Pill = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) => (
    <button onClick={onClick} className={cn("px-3 py-1.5 text-xs font-medium rounded-full transition-all", on ? "bg-zinc-100 text-zinc-900" : "text-zinc-400 hover:text-white")}>{children}</button>
  );

  return (
    <div>
      <div className="flex items-end justify-between mb-5 gap-4 flex-wrap">
        <div>
          <Link href="/fila" className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-orange-400 mb-2 transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" /> Voltar pra fila
          </Link>
          <h1 className="text-3xl font-display font-semibold text-white tracking-tightest">Histórico de envios</h1>
          <p className="text-zinc-500 text-sm mt-1">Cada linha = um post, com quantos grupos receberam. Clique pra ver os erros.</p>
        </div>
        <button onClick={() => load(true)} disabled={refreshing}
          className="flex items-center gap-2 px-3.5 py-2 bg-zinc-900/70 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs rounded-full transition-colors disabled:opacity-50">
          <RefreshCw className={cn("w-3.5 h-3.5", refreshing && "animate-spin")} strokeWidth={1.75} /> Atualizar
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <Stat label="Posts" value={summary.posts} tone="neutral" />
        <Stat label="Envios nos grupos" value={summary.envios} tone="ok" />
        <Stat label="Erros" value={summary.erros} tone={summary.erros > 0 ? "err" : "neutral"} />
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-5">
        <div className="flex gap-1.5 bg-zinc-900/40 border border-zinc-800/70 rounded-full p-1">
          {(["hoje", "7d", "custom"] as const).map((p) => (
            <button key={p} onClick={() => applyPreset(p)}
              className={cn("px-3.5 py-1.5 text-xs font-medium rounded-full transition-all",
                preset === p ? "bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-[0_0_12px_rgba(255,107,53,0.35)]" : "text-zinc-400 hover:text-white")}>
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
        <div className="flex gap-1 bg-zinc-900/40 border border-zinc-800/70 rounded-full p-1">
          {(["all", "amazon", "shopee", "ml"] as const).map((p) => (
            <Pill key={p} on={platform === p} onClick={() => setPlatform(p)}>{p === "all" ? "Todas" : p === "ml" ? "ML" : p === "amazon" ? "Amazon" : "Shopee"}</Pill>
          ))}
        </div>
        {campanhas.length > 1 && (
          <div className="flex gap-1 bg-zinc-900/40 border border-zinc-800/70 rounded-full p-1 flex-wrap">
            <Pill on={campanha === "all"} onClick={() => setCampanha("all")}>Todas campanhas</Pill>
            {campanhas.map(([id, nome]) => <Pill key={id} on={campanha === id} onClick={() => setCampanha(id)}>{nome}</Pill>)}
          </div>
        )}
        <div className="flex gap-1 bg-zinc-900/40 border border-zinc-800/70 rounded-full p-1">
          {(["all", "success", "error"] as const).map((f) => (
            <button key={f} onClick={() => setStatus(f)}
              className={cn("px-3 py-1.5 text-xs font-medium rounded-full transition-all",
                status === f ? "bg-gradient-to-r from-orange-500 to-orange-600 text-white" : "text-zinc-400 hover:text-white")}>
              {f === "all" ? "Todos" : f === "success" ? "Sem erro" : "Com erro"}
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
        <div className="space-y-5">
          {[...byDay.entries()].map(([day, posts]) => (
            <div key={day}>
              <p className="text-xs uppercase tracking-wider text-zinc-500 mb-2 px-1">{day} · {posts.length} posts</p>
              <div className="glass rounded-xl divide-y divide-zinc-800/60 overflow-hidden">
                {posts.map((p) => {
                  const k = `${p.queue_id}|${p.campaign_id}`;
                  const plat = platMeta(p.offer?.platform);
                  const hora = new Date(p.primeiro).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
                  const dur = Math.round((Date.parse(p.ultimo) - Date.parse(p.primeiro)) / 60000);
                  const total = p.sucesso + p.erros;
                  return (
                    <div key={k}>
                      <button onClick={() => abrir(p)} className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-zinc-900/40 transition-colors">
                        <span className="text-sm font-semibold tabular-nums text-white w-11 shrink-0">{hora}</span>
                        <span className={cn("text-[10px] px-1.5 py-px rounded border shrink-0 w-[74px] text-center", plat.cls)}>{p.offer?.kind === "cupom" ? "CUPOM" : plat.label}</span>
                        {p.offer?.image_url ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={p.offer.image_url} alt="" loading="lazy" decoding="async" className="w-8 h-8 rounded-md object-cover shrink-0 bg-zinc-900" onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }} />
                        ) : (
                          <div className="w-8 h-8 rounded-md bg-zinc-900/80 shrink-0 flex items-center justify-center"><Tag className="w-3.5 h-3.5 text-zinc-600" /></div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] text-zinc-200 truncate">{p.offer?.title ?? <span className="text-zinc-500 italic">oferta removida</span>}</p>
                          <p className="text-[11px] text-zinc-500 truncate">
                            {p.campaign_name ?? "—"} · {p.numeros.map(numLabel).join(", ")}{dur > 0 ? ` · ${dur} min` : ""}
                          </p>
                        </div>
                        <span className="flex items-center gap-1 text-[12px] tabular-nums text-zinc-300 shrink-0" title={`${p.sucesso} de ${total} grupos receberam`}>
                          <Users className="w-3.5 h-3.5 text-zinc-500" />{p.sucesso}{p.erros > 0 && <span className="text-zinc-500">/{total}</span>}
                        </span>
                        {p.erros > 0
                          ? <span className="flex items-center gap-1 text-[11px] text-red-400 shrink-0 w-16 justify-end"><AlertTriangle className="w-3.5 h-3.5" />{p.erros}</span>
                          : <span className="w-16 flex justify-end shrink-0"><CheckCircle2 className="w-4 h-4 text-emerald-400" /></span>}
                        <ChevronDown className={cn("w-3.5 h-3.5 text-zinc-600 shrink-0 transition-transform", aberto === k && "rotate-180")} />
                      </button>
                      {aberto === k && (
                        <div className="px-4 pb-3 pt-1 text-[11.5px] bg-zinc-950/40">
                          {p.erros === 0 ? (
                            <p className="text-emerald-400">Chegou em todos os {p.sucesso} grupos.</p>
                          ) : !detalhe[k] ? (
                            <p className="text-zinc-500">Carregando erros…</p>
                          ) : (
                            <ul className="space-y-1 max-h-60 overflow-y-auto scroll-thin">
                              {detalhe[k].map((e, i) => (
                                <li key={i} className="flex gap-2">
                                  <span className="text-zinc-300 shrink-0">{e.group_name ?? "grupo"}</span>
                                  <span className="text-zinc-600">{e.phone_used ? numLabel(e.phone_used) : ""}</span>
                                  <span className="text-red-400 truncate" title={e.error_message ?? ""}>{(e.error_message ?? "").slice(0, 140)}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
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
      <p className={cn("text-2xl font-semibold mt-1 tabular-nums", toneCls)}>{value.toLocaleString("pt-BR")}</p>
    </div>
  );
}
