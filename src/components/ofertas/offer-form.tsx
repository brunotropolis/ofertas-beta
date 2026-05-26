"use client";

import { useState } from "react";
import {
  Search, Sparkles, RefreshCw, Send, Edit3, CheckCircle2,
  ShoppingCart, Clock, Link2, Smartphone
} from "lucide-react";
import WhatsAppPreview from "./whatsapp-preview";
import type { Database } from "@/lib/types/database";
import { cn } from "@/lib/utils";

type Campaign = Database["public"]["Tables"]["campaigns"]["Row"];

interface ParsedProduct {
  platform: "amazon" | "shopee" | "ml";
  title: string;
  price_current: number | null;
  price_original: number | null;
  discount_pct: number | null;
  image_url: string | null;
  product_url: string;
}

const PLATFORM_NAMES: Record<string, string> = {
  amazon: "Amazon",
  shopee: "Shopee",
  ml: "Mercado Livre",
};

interface Props {
  campaigns: Campaign[];
}

export default function OfferForm({ campaigns }: Props) {
  const [url, setUrl] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState("");
  const [product, setProduct] = useState<ParsedProduct | null>(null);

  const [title, setTitle] = useState("");
  const [priceCurrent, setPriceCurrent] = useState("");
  const [priceOriginal, setPriceOriginal] = useState("");
  const [discountPct, setDiscountPct] = useState("");
  const [affiliateUrl, setAffiliateUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [extraText, setExtraText] = useState("");

  const [generatingCaption, setGeneratingCaption] = useState(false);
  const [selectedCampaigns, setSelectedCampaigns] = useState<string[]>([]);
  const [scheduledAt, setScheduledAt] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);

  const activeCampaigns = campaigns.filter((c) => c.is_active);

  async function handleParseUrl() {
    if (!url.trim()) return;
    setParsing(true);
    setParseError("");
    setProduct(null);
    setCaption("");

    const res = await fetch("/api/ofertas/parse-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: url.trim() }),
    });

    if (res.ok) {
      const data: ParsedProduct = await res.json();
      setProduct(data);
      setTitle(data.title || "");
      setPriceCurrent(data.price_current?.toString() ?? "");
      setPriceOriginal(data.price_original?.toString() ?? "");
      setDiscountPct(data.discount_pct?.toString() ?? "");
      setAffiliateUrl(data.product_url || url.trim());
      setSelectedCampaigns(activeCampaigns.map((c) => c.id));
    } else {
      const err = await res.json();
      setParseError(err.error || "Erro ao analisar URL");
    }
    setParsing(false);
  }

  async function handleGenerateCaption() {
    setGeneratingCaption(true);
    const selectedCampaign = campaigns.find((c) => selectedCampaigns.includes(c.id));
    const res = await fetch("/api/ofertas/caption", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        price_current: priceCurrent ? Number(priceCurrent) : null,
        price_original: priceOriginal ? Number(priceOriginal) : null,
        discount_pct: discountPct ? Number(discountPct) : null,
        platform: product?.platform,
        ai_prompt: selectedCampaign?.ai_prompt || null,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      setCaption(data.caption || "");
    }
    setGeneratingCaption(false);
  }

  async function handlePublish() {
    if (!product) return;
    setPublishing(true);
    const res = await fetch("/api/ofertas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: product.product_url,
        affiliate_url: affiliateUrl || product.product_url,
        platform: product.platform,
        title,
        price_current: priceCurrent ? Number(priceCurrent) : null,
        price_original: priceOriginal ? Number(priceOriginal) : null,
        discount_pct: discountPct ? Number(discountPct) : null,
        image_url: product.image_url,
        ai_caption: caption,
        extra_text: extraText || null,
        campaign_ids: selectedCampaigns,
        scheduled_at: scheduledAt || null,
      }),
    });
    if (res.ok) {
      setPublished(true);
      setTimeout(() => {
        setPublished(false);
        setProduct(null);
        setUrl("");
        setTitle("");
        setPriceCurrent("");
        setPriceOriginal("");
        setDiscountPct("");
        setCaption("");
        setExtraText("");
        setAffiliateUrl("");
        setSelectedCampaigns([]);
        setScheduledAt("");
      }, 2500);
    }
    setPublishing(false);
  }

  function recalcDiscount() {
    const curr = Number(priceCurrent);
    const orig = Number(priceOriginal);
    if (curr > 0 && orig > 0 && orig > curr) {
      setDiscountPct(Math.round((1 - curr / orig) * 100).toString());
    }
  }

  const previewCaption = caption + (extraText ? "\n\n" + extraText : "");

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
      {/* Left column — Form */}
      <div className="space-y-4">
        {/* URL Input */}
        <Section title="URL do produto" icon={Link2}>
          <div className="flex gap-2">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleParseUrl()}
              placeholder="https://amazon.com.br/... ou shopee.com.br/..."
              className="flex-1 bg-zinc-900/70 border border-zinc-800 rounded-xl px-4 py-2.5 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-orange-500/60 focus:ring-2 focus:ring-orange-500/15 transition"
            />
            <button
              onClick={handleParseUrl}
              disabled={parsing || !url.trim()}
              className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-all glow-orange-sm shrink-0"
            >
              {parsing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" strokeWidth={2} />}
              {parsing ? "Analisando..." : "Analisar"}
            </button>
          </div>
          {parseError && (
            <p className="text-red-400 text-xs mt-2">{parseError}</p>
          )}
          {product && (
            <div className="mt-3 flex items-center gap-2 text-xs">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]" />
              <span className="text-emerald-400 font-medium tracking-tight">{PLATFORM_NAMES[product.platform]}</span>
              <span className="text-zinc-500">detectado</span>
            </div>
          )}
        </Section>

        {product && (
          <>
            <Section title="Dados do produto" icon={ShoppingCart}>
              <div className="space-y-4">
                <FormField label="Título">
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="form-input"
                  />
                </FormField>

                <div className="grid grid-cols-3 gap-3">
                  <FormField label="Preço atual">
                    <input
                      type="number"
                      step="0.01"
                      value={priceCurrent}
                      onChange={(e) => setPriceCurrent(e.target.value)}
                      onBlur={recalcDiscount}
                      placeholder="0,00"
                      className="form-input"
                    />
                  </FormField>
                  <FormField label="Preço original">
                    <input
                      type="number"
                      step="0.01"
                      value={priceOriginal}
                      onChange={(e) => setPriceOriginal(e.target.value)}
                      onBlur={recalcDiscount}
                      placeholder="0,00"
                      className="form-input"
                    />
                  </FormField>
                  <FormField label="Desconto %">
                    <input
                      type="number"
                      value={discountPct}
                      onChange={(e) => setDiscountPct(e.target.value)}
                      placeholder="0"
                      className="form-input"
                    />
                  </FormField>
                </div>

                <FormField label="Link de afiliado">
                  <input
                    type="url"
                    value={affiliateUrl}
                    onChange={(e) => setAffiliateUrl(e.target.value)}
                    className="form-input"
                  />
                </FormField>
              </div>
            </Section>

            {/* Caption */}
            <Section
              title="Legenda"
              icon={Edit3}
              action={
                <button
                  onClick={handleGenerateCaption}
                  disabled={generatingCaption}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-orange-500/15 to-orange-500/5 border border-orange-500/30 hover:border-orange-500/60 disabled:opacity-50 text-orange-300 text-xs rounded-full transition-colors font-medium"
                >
                  {generatingCaption ? (
                    <RefreshCw className="w-3 h-3 animate-spin" />
                  ) : (
                    <Sparkles className="w-3 h-3" strokeWidth={2} />
                  )}
                  {generatingCaption ? "Gerando..." : "Gerar com IA"}
                </button>
              }
            >
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                rows={5}
                placeholder="Legenda da oferta — gerada pela IA ou escrita manualmente"
                className="form-input resize-none"
              />
              <FormField label="Texto extra (opcional)" className="mt-3">
                <textarea
                  value={extraText}
                  onChange={(e) => setExtraText(e.target.value)}
                  rows={2}
                  placeholder="Ex: ⚠️ Frete grátis para Prime!"
                  className="form-input resize-none"
                />
              </FormField>
            </Section>

            {/* Campaign selection */}
            <Section title="Campanhas">
              {activeCampaigns.length === 0 ? (
                <p className="text-zinc-500 text-sm">Nenhuma campanha ativa. Crie uma campanha primeiro.</p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {activeCampaigns.map((c) => {
                    const selected = selectedCampaigns.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        onClick={() =>
                          setSelectedCampaigns((prev) =>
                            selected ? prev.filter((id) => id !== c.id) : [...prev, c.id]
                          )
                        }
                        className={cn(
                          "flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm border transition-all text-left",
                          selected
                            ? "bg-gradient-to-r from-orange-500/15 to-transparent border-orange-500/40 text-white"
                            : "bg-zinc-900/50 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                        )}
                      >
                        <div
                          className={cn(
                            "w-4 h-4 rounded-md border flex items-center justify-center shrink-0 transition-colors",
                            selected ? "bg-gradient-to-br from-orange-500 to-orange-600 border-transparent" : "border-zinc-600"
                          )}
                        >
                          {selected && <CheckCircle2 className="w-3 h-3 text-white" strokeWidth={2.5} />}
                        </div>
                        <span className="truncate tracking-tight">{c.name}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              <FormField
                label={
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-3 h-3" strokeWidth={1.75} />
                    Agendar para (opcional)
                  </span>
                }
                className="mt-4"
              >
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className="form-input max-w-sm"
                />
              </FormField>
            </Section>

            <button
              onClick={handlePublish}
              disabled={publishing || published || !title || selectedCampaigns.length === 0}
              className={cn(
                "w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-white font-medium text-sm transition-all",
                published
                  ? "bg-emerald-600"
                  : "bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 disabled:opacity-50 glow-orange-sm hover:glow-orange"
              )}
            >
              {published ? (
                <><CheckCircle2 className="w-5 h-5" /> Adicionado à fila!</>
              ) : publishing ? (
                <><RefreshCw className="w-4 h-4 animate-spin" /> Publicando...</>
              ) : (
                <><Send className="w-4 h-4" strokeWidth={2} /> Adicionar à fila ({selectedCampaigns.length} campanha{selectedCampaigns.length !== 1 ? "s" : ""})</>
              )}
            </button>
          </>
        )}
      </div>

      {/* Right column — Preview */}
      <div>
        {product ? (
          <div className="sticky top-24">
            <WhatsAppPreview
              title={title}
              price_current={priceCurrent ? Number(priceCurrent) : null}
              price_original={priceOriginal ? Number(priceOriginal) : null}
              discount_pct={discountPct ? Number(discountPct) : null}
              image_url={product.image_url}
              affiliate_url={affiliateUrl || product.product_url}
              caption={previewCaption}
              platform={product.platform}
            />
          </div>
        ) : (
          <div className="glass rounded-2xl p-12 text-center sticky top-24">
            <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-zinc-900/70 border border-zinc-800/60 mb-4">
              <Smartphone className="w-7 h-7 text-zinc-600" strokeWidth={1.5} />
            </div>
            <p className="text-zinc-200 font-medium tracking-tight">Preview WhatsApp</p>
            <p className="text-zinc-500 text-sm mt-1.5">Cole uma URL para ver o preview aqui</p>
          </div>
        )}
      </div>

      <style jsx global>{`
        .form-input {
          width: 100%;
          background: rgba(24, 24, 27, 0.7);
          border: 1px solid rgb(39 39 42);
          border-radius: 0.75rem;
          padding: 0.625rem 0.875rem;
          color: rgb(244 244 245);
          font-size: 0.875rem;
          transition: all 0.15s;
        }
        .form-input::placeholder { color: rgb(82 82 91); }
        .form-input:focus {
          outline: none;
          border-color: rgb(255 107 53 / 0.6);
          box-shadow: 0 0 0 3px rgb(255 107 53 / 0.12);
        }
      `}</style>
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  action,
  children,
}: {
  title: string;
  icon?: React.ElementType;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-white font-display font-semibold tracking-tight flex items-center gap-2 text-sm">
          {Icon && (
            <span className="h-7 w-7 rounded-lg bg-zinc-900/80 border border-zinc-800/70 flex items-center justify-center">
              <Icon className="w-3.5 h-3.5 text-orange-400" strokeWidth={1.75} />
            </span>
          )}
          {title}
        </h2>
        {action}
      </div>
      {children}
    </div>
  );
}

function FormField({
  label,
  className,
  children,
}: {
  label: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label className="block text-[11px] uppercase tracking-wider font-medium text-zinc-500 mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}
