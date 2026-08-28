"use client";

import { useEffect, useState } from "react";
import { Clock, Trash2, Send, RefreshCw, AlertTriangle, CheckCircle2, Loader2, Tag } from "lucide-react";
import { cn } from "@/lib/utils";

interface Offer {
  id: string;
  title: string | null;
  image_url: string | null;
  price_current: number | null;
  price_original: number | null;
  discount_pct: number | null;
  platform: string | null;
  affiliate_url: string | null;
  url: string;
  ai_caption: string | null;
}

interface QueueItem {
  id: string;
  offer_id: string;
  campaign_ids: string[];
  position: number;
  scheduled_at: string | null;
  status: "pending" | "publishing" | "published" | "error";
  published_at: string | null;
  error_message: string | null;
  created_at: string;
  offer: Offer | null;
}

interface Campaign {
  id: string;
  name: string;
  is_active: boolean;
  timer_minutes: number;
}

const STATUS_META: Record<
  QueueItem["status"],
  { label: string; className: string; icon: React.ElementType }
> = {
  pending:    { label: "Na fila",     className: "bg-zinc-800/80 text-zinc-300",         icon: Clock },
  publishing: { label: "Publicando",  className: "bg-orange-500/15 text-orange-300",     icon: Loader2 },
  published:  { label: "Publicado",   className: "bg-emerald-500/10 text-emerald-400",   icon: CheckCircle2 },
  error:      { label: "Erro",        className: "bg-red-500/10 text-red-400",           icon: AlertTriangle },
};

export default function FilaClient() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [publishing, setPublishing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ id: string; text: string; ok: boolean } | null>(null);

  async function load(silent = false) {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetch("/api/queue", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setItems(data.items ?? []);
        setCampaigns(data.campaigns ?? []);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(() => load(true), 15000);
    return () => clearInterval(t);
  }, []);

  async function handlePublish(item: QueueItem) {
    setPublishing(item.id);
    setFeedback(null);
    const res = await fetch(`/api/queue/${item.id}/publish`, { method: "POST" });
    const data = await res.json();
    if (res.ok) {
      const totalSuccess = data.results?.reduce((a: number, r: { successes: number }) => a + r.successes, 0) ?? 0;
      const totalFail = data.results?.reduce((a: number, r: { failures: number }) => a + r.failures, 0) ?? 0;
      setFeedback({
        id: item.id,
        text: `${totalSuccess} envio${totalSuccess !== 1 ? "s" : ""} OK${totalFail > 0 ? ` · ${totalFail} falha${totalFail !== 1 ? "s" : ""}` : ""}`,
        ok: totalSuccess > 0,
      });
    } else {
      setFeedback({ id: item.id, text: data.error || "erro ao publicar", ok: false });
    }
    setPublishing(null);
    await load(true);
    setTimeout(() => setFeedback(null), 6000);
  }

  async function handleDelete(item: QueueItem) {
    if (!confirm("Remover essa oferta da fila?")) return;
    setDeleting(item.id);
    const res = await fetch(`/api/queue/${item.id}`, { method: "DELETE" });
    if (res.ok) setItems((prev) => prev.filter((i) => i.id !== item.id));
    setDeleting(null);
  }

  function campaignName(id: string) {
    return campaigns.find((c) => c.id === id)?.name ?? id.slice(0, 6);
  }

  return (
    <div>
      <div className="flex items-end justify-between mb-8 gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-display font-semibold text-white tracking-tightest">Fila de publicações</h1>
          <p className="text-zinc-500 text-sm mt-1">
            Ofertas prontas pra sair. O motor dispara automaticamente respeitando o intervalo de cada campanha.
          </p>
        </div>
        <button
          onClick={() => load()}
          disabled={refreshing}
          className="flex items-center gap-2 px-3.5 py-2 bg-zinc-900/70 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs rounded-full transition-colors disabled:opacity-50"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", refreshing && "animate-spin")} strokeWidth={1.75} />
          Atualizar
        </button>
      </div>

      {loading ? (
        <div className="glass rounded-2xl p-12 text-center">
          <Loader2 className="w-6 h-6 mx-auto text-zinc-500 animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-zinc-900/70 border border-zinc-800/60 mb-4">
            <Clock className="w-7 h-7 text-zinc-600" strokeWidth={1.5} />
          </div>
          <p className="text-zinc-200 font-medium tracking-tight">Fila vazia</p>
          <p className="text-zinc-500 text-sm mt-1.5">
            Adicione ofertas em <span className="text-orange-400">Nova oferta</span> pra elas aparecerem aqui
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const meta = STATUS_META[item.status];
            const StatusIcon = meta.icon;
            const isPublishing = publishing === item.id;
            const fb = feedback?.id === item.id ? feedback : null;

            return (
              <div
                key={item.id}
                className="glass rounded-2xl p-4 flex flex-col md:flex-row md:items-center gap-3 md:gap-4 hover:border-zinc-700/80 transition-colors"
              >
                <div className="flex items-start md:items-center gap-3 md:gap-4 min-w-0 flex-1">
                {/* Thumb */}
                {item.offer?.image_url ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={item.offer.image_url}
                    alt=""
                    className="w-16 h-16 rounded-xl object-cover shrink-0 bg-zinc-900"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : (
                  <div className="w-16 h-16 rounded-xl bg-zinc-900/80 shrink-0 flex items-center justify-center">
                    <Tag className="w-6 h-6 text-zinc-600" strokeWidth={1.5} />
                  </div>
                )}

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-white font-medium tracking-tight truncate">
                    {item.offer?.title ?? <span className="text-zinc-500 italic">sem título</span>}
                  </p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-medium px-1.5 py-0.5 rounded",
                        meta.className
                      )}
                    >
                      <StatusIcon className={cn("w-3 h-3", item.status === "publishing" && "animate-spin")} strokeWidth={2} />
                      {meta.label}
                    </span>
                    {item.offer?.price_current !== null && item.offer?.price_current !== undefined && (
                      <span className="text-[11px] text-emerald-400 font-semibold">
                        R$ {Number(item.offer.price_current).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </span>
                    )}
                    {item.offer?.discount_pct ? (
                      <span className="text-[10px] bg-orange-500/15 text-orange-300 font-bold px-1.5 py-0.5 rounded">
                        -{item.offer.discount_pct}%
                      </span>
                    ) : null}
                    <span className="text-[11px] text-zinc-500">
                      {item.campaign_ids.length} campanha{item.campaign_ids.length !== 1 ? "s" : ""}: {" "}
                      {item.campaign_ids.slice(0, 2).map(campaignName).join(", ")}
                      {item.campaign_ids.length > 2 ? "..." : ""}
                    </span>
                    {item.scheduled_at && (
                      <span className="text-[11px] text-orange-300 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(item.scheduled_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    )}
                  </div>
                  {item.error_message && (
                    <p className="text-[11px] text-red-400 mt-1 truncate" title={item.error_message}>
                      ⚠ {item.error_message}
                    </p>
                  )}
                  {fb && (
                    <p
                      className={cn(
                        "text-[11px] mt-1",
                        fb.ok ? "text-emerald-400" : "text-red-400"
                      )}
                    >
                      {fb.text}
                    </p>
                  )}
                </div>

                </div>
                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0 justify-end md:justify-start border-t md:border-t-0 border-zinc-800/60 pt-3 md:pt-0">
                  <button
                    onClick={() => handlePublish(item)}
                    disabled={isPublishing || item.status === "published"}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs rounded-full transition-all glow-orange-sm"
                    title="Publicar agora"
                  >
                    {isPublishing ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5" strokeWidth={2} />
                    )}
                    Publicar
                  </button>
                  <button
                    onClick={() => handleDelete(item)}
                    disabled={deleting === item.id}
                    className="p-2 text-zinc-500 hover:text-red-400 hover:bg-zinc-800/60 rounded-lg transition-colors disabled:opacity-50"
                    title="Remover da fila"
                  >
                    <Trash2 className="w-4 h-4" strokeWidth={1.75} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
