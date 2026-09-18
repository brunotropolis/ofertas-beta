"use client";

import { useEffect, useState } from "react";
import {
  List, Loader2, RefreshCw, Send, Trash2, Tag, X, Check, ExternalLink,
  Pencil, Copy, Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePerfil } from "@/lib/profile-context";
import { buildCaptionPreview } from "@/lib/caption";

interface Offer {
  id: string;
  source: "manual" | "telegram" | "whatsapp" | "auto";
  platform: string | null;
  title: string | null;
  url: string;
  affiliate_url: string | null;
  image_url: string | null;
  price_current: number | null;
  price_original: number | null;
  discount_pct: number | null;
  ai_caption: string | null;
  extra_text: string | null;
  status: string;
  created_at: string;
}

interface Campaign { id: string; name: string; is_active: boolean }

const SOURCES = [
  { key: "all",      label: "Todas" },
  { key: "manual",   label: "Manual" },
  { key: "telegram", label: "Telegram" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "auto",     label: "Auto" },
] as const;

const SOURCE_BADGE: Record<string, string> = {
  manual:   "bg-zinc-700/50 text-zinc-300",
  telegram: "bg-sky-500/15 text-sky-300",
  whatsapp: "bg-emerald-500/15 text-emerald-300",
  auto:     "bg-violet-500/15 text-violet-300",
};

export default function PublicacoesClient() {
  const [source, setSource] = useState<(typeof SOURCES)[number]["key"]>("all");
  const [offers, setOffers] = useState<Offer[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [enqueueFor, setEnqueueFor] = useState<Offer | null>(null);
  const [editing, setEditing] = useState<Offer | null>(null);
  const { perfilId } = usePerfil();

  async function load(silent = false) {
    silent ? setRefreshing(true) : setLoading(true);
    try {
      const params = new URLSearchParams();
      if (source !== "all") params.set("source", source);
      if (perfilId) params.set("perfil", perfilId);
      const qs = params.toString();
      const campQs = perfilId ? `?perfil=${perfilId}` : "";
      const [oRes, cRes] = await Promise.all([
        fetch(`/api/ofertas${qs ? "?" + qs : ""}`, { cache: "no-store" }),
        fetch(`/api/campanhas${campQs}`, { cache: "no-store" }),
      ]);
      if (oRes.ok) setOffers(await oRes.json());
      if (cRes && cRes.ok) setCampaigns(await cRes.json());
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [source, perfilId]);

  async function handleDiscard(o: Offer) {
    if (!confirm("Descartar essa oferta?")) return;
    const res = await fetch(`/api/ofertas/${o.id}`, { method: "DELETE" });
    if (res.ok) setOffers((prev) => prev.filter((x) => x.id !== o.id));
  }

  function applyEdited(updated: Offer) {
    setOffers((prev) => prev.map((x) => (x.id === updated.id ? { ...x, ...updated } : x)));
    setEditing(null);
  }

  // Já publicados saem da lista (Publicações = só o que falta revisar/postar)
  const visible = offers.filter((o) => o.status !== "published");

  return (
    <div>
      <div className="flex items-end justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-display font-semibold text-white tracking-tightest">Publicações</h1>
          <p className="text-zinc-500 text-sm mt-1">Ofertas capturadas das fontes. Revise a legenda, edite, enfileire ou descarte.</p>
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

      <div className="flex gap-1.5 mb-6 bg-zinc-900/40 border border-zinc-800/70 rounded-full p-1 w-fit flex-wrap">
        {SOURCES.map((s) => (
          <button
            key={s.key}
            onClick={() => setSource(s.key)}
            className={cn(
              "px-4 py-1.5 text-xs font-medium rounded-full transition-all",
              source === s.key
                ? "bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-[0_0_12px_rgba(255,107,53,0.35)]"
                : "text-zinc-400 hover:text-white"
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="glass rounded-2xl p-12 text-center"><Loader2 className="w-6 h-6 mx-auto text-zinc-500 animate-spin" /></div>
      ) : visible.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-zinc-900/70 border border-zinc-800/60 mb-4">
            <List className="w-7 h-7 text-zinc-600" strokeWidth={1.5} />
          </div>
          <p className="text-zinc-200 font-medium tracking-tight">Nenhuma oferta {source !== "all" ? `de ${source}` : "pra revisar"}</p>
          <p className="text-zinc-500 text-sm mt-1.5">As fontes empurram ofertas pra cá via <code className="text-orange-400">/api/ingest</code></p>
        </div>
      ) : (
        <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {visible.map((o) => (
            <OfferCard
              key={o.id}
              offer={o}
              onEnqueue={() => setEnqueueFor(o)}
              onEdit={() => setEditing(o)}
              onDiscard={() => handleDiscard(o)}
            />
          ))}
        </div>
      )}

      {enqueueFor && (
        <EnqueueModal
          offer={enqueueFor}
          campaigns={campaigns}
          onClose={() => setEnqueueFor(null)}
          onDone={() => { setEnqueueFor(null); load(true); }}
        />
      )}
      {editing && (
        <EditModal
          offer={editing}
          perfilId={perfilId}
          onClose={() => setEditing(null)}
          onSaved={applyEdited}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function OfferCard({
  offer, onEnqueue, onEdit, onDiscard,
}: {
  offer: Offer;
  onEnqueue: () => void;
  onEdit: () => void;
  onDiscard: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const { text: caption, usedFallback } = buildCaptionPreview(offer);
  const link = offer.affiliate_url || offer.url;

  async function copyLink() {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  }

  return (
    <div className="glass rounded-2xl overflow-hidden flex flex-col hover:border-zinc-700/80 transition-colors">
      <div className="relative">
        {offer.image_url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={offer.image_url} alt="" className="w-full aspect-square object-cover bg-zinc-900" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
        ) : (
          <div className="w-full aspect-square bg-zinc-900/80 flex items-center justify-center"><Tag className="w-8 h-8 text-zinc-700" /></div>
        )}
        <div className="absolute top-2 left-2 flex items-center gap-1.5 flex-wrap">
          <span className={cn("text-[10px] uppercase tracking-wider font-medium px-1.5 py-0.5 rounded backdrop-blur-sm", SOURCE_BADGE[offer.source] ?? SOURCE_BADGE.manual)}>{offer.source}</span>
          {offer.status === "queued" && <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/80 text-white">na fila</span>}
          {offer.status === "published" && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/80 text-white">publicado</span>}
        </div>
      </div>

      <div className="p-3.5 flex flex-col flex-1">
        <div className="flex items-center gap-2 mb-1.5">
          {offer.platform && <span className="text-[10px] uppercase tracking-wider text-zinc-500">{offer.platform}</span>}
          {offer.price_current != null && (
            <span className="text-sm text-emerald-400 font-semibold ml-auto">R$ {Number(offer.price_current).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
          )}
          {offer.discount_pct ? <span className="text-[10px] bg-orange-500/15 text-orange-300 font-bold px-1.5 py-0.5 rounded">-{offer.discount_pct}%</span> : null}
        </div>

        {/* Legenda completa (como vai sair) */}
        <div className="rounded-xl bg-zinc-950/60 border border-zinc-800/70 p-2.5 mb-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">Legenda</span>
            {usedFallback && <span className="text-[10px] text-amber-400/80" title="Sem legenda salva — a IA gera na hora do post">IA na hora</span>}
          </div>
          <p className="text-[11px] leading-relaxed text-zinc-300 whitespace-pre-wrap max-h-28 overflow-y-auto scroll-thin break-words">
            {caption}
          </p>
        </div>

        {/* Link */}
        <button
          onClick={copyLink}
          className="group flex items-center gap-1.5 text-[11px] text-zinc-500 hover:text-orange-300 mb-3 min-w-0"
          title="Copiar link"
        >
          {copied ? <Check className="w-3 h-3 text-emerald-400 shrink-0" /> : <Copy className="w-3 h-3 shrink-0" />}
          <span className="truncate">{link}</span>
          <a href={link} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="shrink-0 text-zinc-600 hover:text-orange-400"><ExternalLink className="w-3 h-3" /></a>
        </button>

        <div className="flex items-center gap-2 mt-auto pt-3 border-t border-zinc-800/60">
          <button
            onClick={onEnqueue}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-white text-xs rounded-full transition-all glow-orange-sm"
          >
            <Send className="w-3.5 h-3.5" strokeWidth={2} /> Enfileirar
          </button>
          <button
            onClick={onEdit}
            className="flex items-center gap-1.5 px-3 py-1.5 text-zinc-200 bg-zinc-800/70 hover:bg-zinc-700 border border-zinc-700/60 text-xs rounded-full transition-colors"
            title="Editar legenda, título, preço e link"
          >
            <Pencil className="w-3.5 h-3.5" strokeWidth={1.75} /> Editar
          </button>
          <button
            onClick={onDiscard}
            className="p-2 text-zinc-500 hover:text-red-400 hover:bg-zinc-800/60 rounded-lg transition-colors"
            title="Descartar"
          >
            <Trash2 className="w-4 h-4" strokeWidth={1.75} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function EditModal({
  offer, perfilId, onClose, onSaved,
}: {
  offer: Offer;
  perfilId: string | null;
  onClose: () => void;
  onSaved: (o: Offer) => void;
}) {
  const [title, setTitle] = useState(offer.title ?? "");
  const [caption, setCaption] = useState(offer.ai_caption ?? "");
  const [extra, setExtra] = useState(offer.extra_text ?? "");
  const [priceCur, setPriceCur] = useState(offer.price_current != null ? String(offer.price_current) : "");
  const [priceOrig, setPriceOrig] = useState(offer.price_original != null ? String(offer.price_original) : "");
  const [affiliate, setAffiliate] = useState(offer.affiliate_url ?? "");
  const [saving, setSaving] = useState(false);
  const [genAI, setGenAI] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preview = buildCaptionPreview({
    title, ai_caption: caption, extra_text: extra, url: offer.url, affiliate_url: affiliate || offer.affiliate_url,
    price_current: priceCur === "" ? null : Number(priceCur),
    price_original: priceOrig === "" ? null : Number(priceOrig),
  });

  async function generateCaption() {
    setGenAI(true); setError(null);
    try {
      let ai_prompt: string | undefined;
      if (perfilId) {
        const pr = await fetch(`/api/perfis`, { cache: "no-store" }).then((r) => r.ok ? r.json() : []).catch(() => []);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ai_prompt = (pr as any[]).find((p) => p.id === perfilId)?.ai_prompt || undefined;
      }
      const res = await fetch(`/api/ofertas/caption`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title || "Produto",
          price_current: priceCur === "" ? null : Number(priceCur),
          price_original: priceOrig === "" ? null : Number(priceOrig),
          discount_pct: offer.discount_pct,
          platform: offer.platform,
          ai_prompt,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.caption) setCaption(data.caption.trim());
      else setError(data.error || "falha ao gerar legenda");
    } finally { setGenAI(false); }
  }

  async function save() {
    setSaving(true); setError(null);
    const res = await fetch(`/api/ofertas/${offer.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title, ai_caption: caption, extra_text: extra, affiliate_url: affiliate,
        price_current: priceCur, price_original: priceOrig,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (res.ok) onSaved(data as Offer);
    else setError(data.error || data.details?.[0]?.message || "erro ao salvar");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="glass rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto scroll-thin p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-lg font-semibold text-white tracking-tight">Editar oferta</h2>
          <button onClick={onClose} className="p-1.5 text-zinc-500 hover:text-white rounded-lg"><X className="w-4 h-4" /></button>
        </div>

        <div className="grid md:grid-cols-2 gap-5">
          {/* Form */}
          <div className="space-y-3">
            <div>
              <label className="text-xs uppercase tracking-wider text-zinc-500">Título</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 w-full px-3 py-2 bg-zinc-900/60 border border-zinc-800 rounded-xl text-sm text-zinc-200 focus:border-orange-500/60 outline-none" />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <label className="text-xs uppercase tracking-wider text-zinc-500">Legenda (linhas criativas)</label>
                <button onClick={generateCaption} disabled={genAI} className="flex items-center gap-1 text-[11px] text-violet-300 hover:text-violet-200 disabled:opacity-50">
                  {genAI ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />} Gerar com IA
                </button>
              </div>
              <textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={5} placeholder="Se vazio, a IA gera na hora do post" className="mt-1 w-full px-3 py-2 bg-zinc-900/60 border border-zinc-800 rounded-xl text-sm text-zinc-200 focus:border-orange-500/60 outline-none resize-y" />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-zinc-500">Texto extra (opcional)</label>
              <input value={extra} onChange={(e) => setExtra(e.target.value)} className="mt-1 w-full px-3 py-2 bg-zinc-900/60 border border-zinc-800 rounded-xl text-sm text-zinc-200 focus:border-orange-500/60 outline-none" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs uppercase tracking-wider text-zinc-500">Preço (R$)</label>
                <input value={priceCur} onChange={(e) => setPriceCur(e.target.value)} inputMode="decimal" className="mt-1 w-full px-3 py-2 bg-zinc-900/60 border border-zinc-800 rounded-xl text-sm text-zinc-200 focus:border-orange-500/60 outline-none" />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wider text-zinc-500">De (R$, opcional)</label>
                <input value={priceOrig} onChange={(e) => setPriceOrig(e.target.value)} inputMode="decimal" className="mt-1 w-full px-3 py-2 bg-zinc-900/60 border border-zinc-800 rounded-xl text-sm text-zinc-200 focus:border-orange-500/60 outline-none" />
              </div>
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-zinc-500">Link de afiliado</label>
              <input value={affiliate} onChange={(e) => setAffiliate(e.target.value)} className="mt-1 w-full px-3 py-2 bg-zinc-900/60 border border-zinc-800 rounded-xl text-sm text-zinc-200 focus:border-orange-500/60 outline-none" />
            </div>
          </div>

          {/* Preview */}
          <div>
            <label className="text-xs uppercase tracking-wider text-zinc-500">Prévia (como vai sair)</label>
            <div className="mt-1 rounded-xl bg-zinc-950/70 border border-zinc-800/70 p-3">
              {offer.image_url && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={offer.image_url} alt="" className="w-full h-32 object-cover rounded-lg mb-2 bg-zinc-900" />
              )}
              <p className="text-[12px] leading-relaxed text-zinc-200 whitespace-pre-wrap break-words">{preview.text}</p>
            </div>
          </div>
        </div>

        {error && <p className="text-xs text-red-400 mt-3">{error}</p>}

        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm text-zinc-300 bg-zinc-900/60 hover:bg-zinc-800 border border-zinc-800 rounded-full transition-colors">Cancelar</button>
          <button onClick={save} disabled={saving} className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 text-sm text-white bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 rounded-full transition-all disabled:opacity-50 glow-orange-sm">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Salvar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function EnqueueModal({
  offer, campaigns, onClose, onDone,
}: {
  offer: Offer;
  campaigns: Campaign[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [scheduledAt, setScheduledAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function submit() {
    if (selected.length === 0) { setError("Escolha ao menos 1 campanha"); return; }
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/ofertas/${offer.id}/enqueue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaign_ids: selected,
        scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (res.ok) onDone();
    else setError(data.error || data.details?.[0]?.message || "erro ao enfileirar");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="glass rounded-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-white tracking-tight">Enfileirar oferta</h2>
            <p className="text-xs text-zinc-500 mt-0.5 line-clamp-1">{offer.title ?? "sem título"}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-zinc-500 hover:text-white rounded-lg"><X className="w-4 h-4" /></button>
        </div>

        <p className="text-xs uppercase tracking-wider text-zinc-500 mb-2">Campanhas</p>
        <div className="space-y-1.5 max-h-64 overflow-y-auto scroll-thin mb-4">
          {campaigns.length === 0 && <p className="text-sm text-zinc-500">Nenhuma campanha cadastrada.</p>}
          {campaigns.map((c) => {
            const on = selected.includes(c.id);
            return (
              <button
                key={c.id}
                onClick={() => toggle(c.id)}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-sm text-left transition-colors",
                  on ? "border-orange-500/60 bg-orange-500/10 text-white" : "border-zinc-800 bg-zinc-900/40 text-zinc-300 hover:border-zinc-700"
                )}
              >
                <span className={cn("w-4 h-4 rounded flex items-center justify-center shrink-0", on ? "bg-orange-500" : "border border-zinc-600")}>
                  {on && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                </span>
                <span className="flex-1 truncate">{c.name}</span>
                {!c.is_active && <span className="text-[10px] text-zinc-500">inativa</span>}
              </button>
            );
          })}
        </div>

        <p className="text-xs uppercase tracking-wider text-zinc-500 mb-1.5">Agendar (opcional)</p>
        <input
          type="datetime-local"
          value={scheduledAt}
          onChange={(e) => setScheduledAt(e.target.value)}
          className="w-full px-3 py-2 bg-zinc-900/60 border border-zinc-800 rounded-xl text-sm text-zinc-200 mb-4 focus:border-orange-500/60 outline-none"
        />

        {error && <p className="text-xs text-red-400 mb-3">{error}</p>}

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm text-zinc-300 bg-zinc-900/60 hover:bg-zinc-800 border border-zinc-800 rounded-full transition-colors">Cancelar</button>
          <button
            onClick={submit}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 text-sm text-white bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 rounded-full transition-all disabled:opacity-50 glow-orange-sm"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Enfileirar
          </button>
        </div>
      </div>
    </div>
  );
}
