"use client";

import { useEffect, useRef, useState } from "react";
import {
  Clock, Trash2, Send, RefreshCw, AlertTriangle, CheckCircle2, Loader2, Tag, GripVertical, Lock, History, CalendarClock,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, arrayMove, verticalListSortingStrategy, useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { usePerfil } from "@/lib/profile-context";

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
  extra_text?: string | null;
  promo_meta?: { aviso?: { descricao?: string } } | null;
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
  created_by: string | null;
  eta: string | null;
  has_active_campaign?: boolean;
  offer: Offer | null;
}

// Hora compacta pro rail: "17:40" (+ "amanhã"/"dd/mm" só se não for hoje)
function fmtShort(iso: string): { time: string; day: string | null } {
  const d = new Date(iso);
  const now = new Date();
  const time = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return { time, day: null };
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
  if (d.toDateString() === tomorrow.toDateString()) return { time, day: "amanhã" };
  return { time, day: d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) };
}

const PLAT_META: Record<string, { label: string; cls: string }> = {
  amazon:  { label: "Amazon", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  shopee:  { label: "Shopee", cls: "bg-orange-500/15 text-orange-300 border-orange-500/30" },
  ml:      { label: "Merc. Livre", cls: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30" },
};
function platMeta(p: string | null | undefined) {
  return (p && PLAT_META[p]) || { label: (p || "—").toUpperCase(), cls: "bg-zinc-700/40 text-zinc-300 border-zinc-600/40" };
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
  const [savingOrder, setSavingOrder] = useState(false);
  const [feedback, setFeedback] = useState<{ id: string; text: string; ok: boolean } | null>(null);
  const dragging = useRef(false);
  const { perfilId, loading: perfilLoading } = usePerfil();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  async function load(silent = false) {
    if (dragging.current) return; // não pisa por cima de um reorder em andamento
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const q = perfilId ? `?perfil=${perfilId}` : "";
      const res = await fetch(`/api/queue${q}`, { cache: "no-store" });
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
    if (perfilLoading) return; // espera o perfil (senão busca 2x: sem filtro e com perfil)
    load();
    const t = setInterval(() => load(true), 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfilId, perfilLoading]);

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

  async function handleDragEnd(event: DragEndEvent) {
    dragging.current = false;
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const reordered = arrayMove(items, oldIndex, newIndex);
    setItems(reordered); // otimista

    setSavingOrder(true);
    try {
      await fetch("/api/queue/reorder", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: reordered.map((i) => i.id) }),
      });
    } finally {
      setSavingOrder(false);
    }
  }

  function campaignName(id: string) {
    return campaigns.find((c) => c.id === id)?.name ?? id.slice(0, 6);
  }

  const activeCount = campaigns.filter((c) => c.is_active).length;
  // 09/Nov: avisos agendados (aba Agendamento) ficam numa coluna à parte; os produtos são o principal da fila
  const ehAviso = (i: QueueItem) => !!i.offer?.promo_meta?.aviso;
  const produtos = items.filter((i) => !ehAviso(i));
  const agendados = items.filter(ehAviso).sort((a, b) => String(a.scheduled_at ?? "").localeCompare(String(b.scheduled_at ?? "")));

  return (
    <div>
      <div className="flex items-end justify-between mb-8 gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-display font-semibold text-white tracking-tightest">Fila de publicações</h1>
          <p className="text-zinc-500 text-sm mt-1">
            Arraste pra reordenar. O motor dispara automaticamente respeitando o intervalo de cada campanha
            {activeCount > 0 ? ` (${activeCount} ativa${activeCount !== 1 ? "s" : ""})` : ""}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {savingOrder && (
            <span className="flex items-center gap-1.5 text-[11px] text-orange-300">
              <Loader2 className="w-3 h-3 animate-spin" /> salvando ordem
            </span>
          )}
          <Link
            href="/historico"
            className="flex items-center gap-2 px-3.5 py-2 bg-zinc-900/70 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs rounded-full transition-colors"
          >
            <History className="w-3.5 h-3.5" strokeWidth={1.75} />
            Histórico
          </Link>
          <button
            onClick={() => load()}
            disabled={refreshing}
            className="flex items-center gap-2 px-3.5 py-2 bg-zinc-900/70 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs rounded-full transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", refreshing && "animate-spin")} strokeWidth={1.75} />
            Atualizar
          </button>
        </div>
      </div>

      {loading ? (
        <div className="glass rounded-2xl p-12 text-center">
          <Loader2 className="w-6 h-6 mx-auto text-zinc-500 animate-spin" />
        </div>
      ) : produtos.length === 0 && agendados.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-zinc-900/70 border border-zinc-800/60 mb-4">
            <Clock className="w-7 h-7 text-zinc-600" strokeWidth={1.5} />
          </div>
          <p className="text-zinc-200 font-medium tracking-tight">Fila vazia</p>
          <p className="text-zinc-500 text-sm mt-1.5">
            Adicione ofertas em <span className="text-orange-400">Nova oferta</span> ou enfileire de{" "}
            <Link href="/publicacoes" className="text-orange-400 hover:underline">Publicações</Link>
          </p>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px] items-start">
        <section className="min-w-0">
        <div className="flex items-center gap-2 mb-3">
          <Tag className="w-4 h-4 text-orange-400" strokeWidth={2} />
          <h2 className="text-sm font-semibold text-white tracking-tight">Produtos na fila</h2>
          <span className="text-xs text-zinc-500 tabular-nums">{produtos.filter((i) => i.status !== "error").length}</span>
        </div>
        {produtos.length === 0 && <div className="glass rounded-2xl p-8 text-center text-sm text-zinc-500">Nenhum produto na fila agora.</div>}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={() => { dragging.current = true; }}
          onDragEnd={handleDragEnd}
          onDragCancel={() => { dragging.current = false; }}
        >
          <SortableContext items={produtos.filter((i) => i.status !== "error").map((i) => i.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-3">
              {produtos.filter((i) => i.status !== "error").map((item) => (
                <SortableRow
                  key={item.id}
                  item={item}
                  publishing={publishing === item.id}
                  deleting={deleting === item.id}
                  feedback={feedback?.id === item.id ? feedback : null}
                  campaignName={campaignName}
                  onPublish={handlePublish}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          </SortableContext>
          {/* itens com erro não saem sozinhos: ficam recolhidos no fim (publicar de novo ou excluir) */}
          {produtos.some((i) => i.status === "error") && (
            <details className="mt-5 group">
              <summary className="cursor-pointer select-none text-xs text-red-300/80 hover:text-red-300 px-1 mb-3 list-none flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" /> Com erro ({produtos.filter((i) => i.status === "error").length}) — clique pra ver
              </summary>
              <SortableContext items={produtos.filter((i) => i.status === "error").map((i) => i.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-3 opacity-80">
                  {produtos.filter((i) => i.status === "error").map((item) => (
                    <SortableRow
                      key={item.id}
                      item={item}
                      publishing={publishing === item.id}
                      deleting={deleting === item.id}
                      feedback={feedback?.id === item.id ? feedback : null}
                      campaignName={campaignName}
                      onPublish={handlePublish}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              </SortableContext>
            </details>
          )}
        </DndContext>
        </section>
        <AgendadosLateral itens={agendados} campaignName={campaignName} />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function SortableRow({
  item, publishing, deleting, feedback, campaignName, onPublish, onDelete,
}: {
  item: QueueItem;
  publishing: boolean;
  deleting: boolean;
  feedback: { text: string; ok: boolean } | null;
  campaignName: (id: string) => string;
  onPublish: (i: QueueItem) => void;
  onDelete: (i: QueueItem) => void;
}) {
  const locked = item.status === "publishing";
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: item.id, disabled: locked });

  const meta = STATUS_META[item.status];
  const StatusIcon = meta.icon;

  const plat = platMeta(item.offer?.platform);
  const whenIso = item.scheduled_at || item.eta;
  const when = item.status === "pending" && whenIso ? fmtShort(whenIso) : null;
  const whenFallback =
    item.status === "publishing" ? "postando…" :
    item.status === "error" ? "erro" :
    item.has_active_campaign === false ? "pausada" : "—";

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "glass rounded-2xl p-4 flex flex-col md:flex-row md:items-center gap-3 md:gap-4 transition-colors",
        isDragging ? "border-orange-500/50 shadow-lg" : "hover:border-zinc-700/80"
      )}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        disabled={locked}
        className={cn(
          "hidden md:flex shrink-0 items-center justify-center w-6 h-full text-zinc-600",
          locked ? "cursor-not-allowed opacity-40" : "cursor-grab active:cursor-grabbing hover:text-zinc-300"
        )}
        title={locked ? "Publicando — travado" : "Arrastar pra reordenar"}
        aria-label="Reordenar"
      >
        {locked ? <Lock className="w-4 h-4" /> : <GripVertical className="w-4 h-4" />}
      </button>

      {/* Rail destacado (fora da caixa): plataforma + horário */}
      <div className={cn("shrink-0 flex flex-col items-center justify-center gap-0.5 rounded-xl border px-2.5 py-2 min-w-[84px]", plat.cls)}>
        <span className="text-[10px] uppercase font-bold tracking-wide leading-none">{plat.label}</span>
        {when ? (
          <span className="text-center leading-tight mt-1">
            {when.day && <span className="block text-[9px] opacity-80">{when.day}</span>}
            <span className="block text-base font-bold tabular-nums text-white">{when.time}</span>
          </span>
        ) : (
          <span className="text-[11px] text-zinc-300 mt-1">{whenFallback}</span>
        )}
      </div>

      <div className="flex items-start md:items-center gap-3 md:gap-4 min-w-0 flex-1">
        {item.offer?.image_url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            loading="lazy"
            decoding="async"
            src={item.offer.image_url}
            alt=""
            className="w-16 h-16 rounded-xl object-cover shrink-0 bg-zinc-900"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <div className="w-16 h-16 rounded-xl bg-zinc-900/80 shrink-0 flex items-center justify-center">
            <Tag className="w-6 h-6 text-zinc-600" strokeWidth={1.5} />
          </div>
        )}

        <div className="flex-1 min-w-0">
          <p className="text-white font-medium tracking-tight truncate">
            {item.offer?.title ?? <span className="text-zinc-500 italic">sem título</span>}
          </p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className={cn("inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-medium px-1.5 py-0.5 rounded", meta.className)}>
              <StatusIcon className={cn("w-3 h-3", item.status === "publishing" && "animate-spin")} strokeWidth={2} />
              {meta.label}
            </span>
            {/* Origem: automático (created_by null) x manual */}
            <span className={cn(
              "inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-medium px-1.5 py-0.5 rounded",
              item.created_by ? "bg-sky-500/15 text-sky-300" : "bg-violet-500/15 text-violet-300"
            )}>
              {item.created_by ? "Manual" : "Auto"}
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
              {item.campaign_ids.length} campanha{item.campaign_ids.length !== 1 ? "s" : ""}:{" "}
              {item.campaign_ids.slice(0, 2).map(campaignName).join(", ")}
              {item.campaign_ids.length > 2 ? "..." : ""}
            </span>
            {item.scheduled_at && (
              <span className="text-[11px] text-orange-300/90" title="Agendado manualmente">agendado</span>
            )}
          </div>
          {item.error_message && (
            <p className="text-[11px] text-red-400 mt-1 truncate" title={item.error_message}>⚠ {item.error_message}</p>
          )}
          {feedback && (
            <p className={cn("text-[11px] mt-1", feedback.ok ? "text-emerald-400" : "text-red-400")}>{feedback.text}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0 justify-end md:justify-start border-t md:border-t-0 border-zinc-800/60 pt-3 md:pt-0">
        <button
          onClick={() => onPublish(item)}
          disabled={publishing || item.status === "published"}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs rounded-full transition-all glow-orange-sm"
          title="Publicar agora"
        >
          {publishing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" strokeWidth={2} />}
          Publicar
        </button>
        <button
          onClick={() => onDelete(item)}
          disabled={deleting}
          className="p-2 text-zinc-500 hover:text-red-400 hover:bg-zinc-800/60 rounded-lg transition-colors disabled:opacity-50"
          title="Remover da fila"
        >
          <Trash2 className="w-4 h-4" strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
}

// Coluna lateral: posts agendados (avisos com arte). Só leitura aqui; editar/cancelar na aba Agendamento.
function AgendadosLateral({ itens, campaignName }: { itens: QueueItem[]; campaignName: (id: string) => string }) {
  return (
    <aside className="lg:sticky lg:top-6 rounded-2xl border border-dashed border-zinc-700/70 bg-zinc-950/40 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-zinc-400" strokeWidth={1.75} />
          <h2 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">Agendados</h2>
          <span className="text-xs text-zinc-500 tabular-nums">{itens.length}</span>
        </div>
        <Link href="/agendamento" className="text-[11px] text-orange-300 hover:text-orange-200">editar</Link>
      </div>
      {itens.length === 0 ? (
        <p className="text-xs text-zinc-500">Nenhum aviso agendado.</p>
      ) : (
        <ul className="space-y-2.5">
          {itens.map((i) => {
            const quando = i.scheduled_at ? fmtShort(i.scheduled_at) : null;
            const linha = (i.offer?.extra_text || i.offer?.title || "").replace(/\*/g, "").split("\n").find((l) => l.trim()) || "Aviso";
            return (
              <li key={i.id} className="flex gap-2.5 items-start">
                {i.offer?.image_url
                  ? <img src={i.offer.image_url} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0 opacity-90" />
                  : <div className="w-10 h-10 rounded-lg bg-zinc-800 shrink-0" />}
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <span className="font-semibold text-zinc-200 tabular-nums">{quando ? quando.time : "--:--"}</span>
                    {quando?.day && <span className="text-zinc-500">{quando.day}</span>}
                    {i.status === "publishing" && <span className="text-sky-300">saindo</span>}
                    {i.status === "error" && <span className="text-red-300">erro</span>}
                  </div>
                  <p className="text-xs text-zinc-400 line-clamp-2">{linha}</p>
                  <p className="text-[10px] text-zinc-600 truncate">{i.campaign_ids.map(campaignName).join(", ")}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
