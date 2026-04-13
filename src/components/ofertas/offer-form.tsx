"use client";

import { useState } from "react";
import {
  Search, Sparkles, RefreshCw, Send, Edit3, CheckCircle2,
  ShoppingCart, Clock, Link2
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

const PLATFORM_ICONS: Record<string, string> = {
  amazon: "🛒",
  shopee: "🧡",
  ml: "💛",
};

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

  // Editable fields
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

  // Select all active campaigns by default
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
      // Auto-select all active campaigns
      setSelectedCampaigns(activeCampaigns.map((c) => c.id));
    } else {
      const err = await res.json();
      setParseError(err.error || "Erro ao analisar URL");
    }
    setParsing(false);
  }

  async function handleGenerateCaption() {
    setGeneratingCaption(true);
    // Find the AI prompt from the first selected campaign
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
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      {/* Left column — Form */}
      <div className="space-y-4">
        {/* URL Input */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-white font-semibold mb-4 flex items-center gap-2">
            <Link2 className="w-4 h-4 text-blue-400" />
            URL do Produto
          </h2>
          <div className="flex gap-2">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleParseUrl()}
              placeholder="https://amazon.com.br/... ou shopee.com.br/... ou mercadolivre.com.br/..."
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={handleParseUrl}
              disabled={parsing || !url.trim()}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors shrink-0"
            >
              {parsing ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
              {parsing ? "Analisando..." : "Analisar"}
            </button>
          </div>
          {parseError && (
            <p className="text-red-400 text-sm mt-2">{parseError}</p>
          )}
          {product && (
            <div className="mt-2 flex items-center gap-2 text-sm">
              <span>{PLATFORM_ICONS[product.platform]}</span>
              <span className="text-green-400 font-medium">{PLATFORM_NAMES[product.platform]}</span>
              <span className="text-gray-500">detectado</span>
            </div>
          )}
        </div>

        {/* Product data — shown after parsing */}
        {product && (
          <>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
              <h2 className="text-white font-semibold flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-yellow-400" />
                Dados do Produto
              </h2>

              <div>
                <label className="text-xs text-gray-400 block mb-1">Título</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Preço atual (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={priceCurrent}
                    onChange={(e) => setPriceCurrent(e.target.value)}
                    onBlur={recalcDiscount}
                    placeholder="0,00"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Preço original (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={priceOriginal}
                    onChange={(e) => setPriceOriginal(e.target.value)}
                    onBlur={recalcDiscount}
                    placeholder="0,00"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Desconto (%)</label>
                  <input
                    type="number"
                    value={discountPct}
                    onChange={(e) => setDiscountPct(e.target.value)}
                    placeholder="0"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-400 block mb-1">Link de afiliado</label>
                <input
                  type="url"
                  value={affiliateUrl}
                  onChange={(e) => setAffiliateUrl(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* Caption */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-white font-semibold flex items-center gap-2">
                  <Edit3 className="w-4 h-4 text-purple-400" />
                  Legenda
                </h2>
                <button
                  onClick={handleGenerateCaption}
                  disabled={generatingCaption}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs rounded-lg transition-colors font-medium"
                >
                  {generatingCaption ? (
                    <RefreshCw className="w-3 h-3 animate-spin" />
                  ) : (
                    <Sparkles className="w-3 h-3" />
                  )}
                  {generatingCaption ? "Gerando..." : "Gerar com IA"}
                </button>
              </div>
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                rows={5}
                placeholder="Legenda da oferta — gerada pela IA ou escrita manualmente"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none"
              />
              <div>
                <label className="text-xs text-gray-400 block mb-1">Texto extra (opcional)</label>
                <textarea
                  value={extraText}
                  onChange={(e) => setExtraText(e.target.value)}
                  rows={2}
                  placeholder="Ex: ⚠️ Frete grátis para Prime!"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none"
                />
              </div>
            </div>

            {/* Campaign selection */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
              <h2 className="text-white font-semibold">Campanhas</h2>
              {activeCampaigns.length === 0 ? (
                <p className="text-gray-500 text-sm">Nenhuma campanha ativa. Crie uma campanha primeiro.</p>
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
                          "flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm border transition-colors text-left",
                          selected
                            ? "bg-blue-600/20 border-blue-500 text-white"
                            : "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600"
                        )}
                      >
                        <div className={cn("w-4 h-4 rounded border-2 flex items-center justify-center shrink-0", selected ? "bg-blue-600 border-blue-600" : "border-gray-600")}>
                          {selected && <CheckCircle2 className="w-3 h-3 text-white" />}
                        </div>
                        <span className="truncate">{c.name}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Optional: schedule */}
              <div>
                <label className="text-xs text-gray-400 block mb-1 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Agendar para (opcional)
                </label>
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* Publish button */}
            <button
              onClick={handlePublish}
              disabled={publishing || published || !title || selectedCampaigns.length === 0}
              className={cn(
                "w-full flex items-center justify-center gap-2 py-3 rounded-xl text-white font-semibold text-sm transition-colors",
                published
                  ? "bg-green-600"
                  : "bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
              )}
            >
              {published ? (
                <><CheckCircle2 className="w-5 h-5" /> Adicionado à fila!</>
              ) : publishing ? (
                <><RefreshCw className="w-4 h-4 animate-spin" /> Publicando...</>
              ) : (
                <><Send className="w-4 h-4" /> Adicionar à Fila ({selectedCampaigns.length} campanha{selectedCampaigns.length !== 1 ? "s" : ""})</>
              )}
            </button>
          </>
        )}
      </div>

      {/* Right column — Preview */}
      <div>
        {product ? (
          <div className="sticky top-6">
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
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
            <div className="text-5xl mb-3">📱</div>
            <p className="text-gray-400">Digite uma URL para ver o preview</p>
            <p className="text-gray-600 text-sm mt-1">O preview do WhatsApp aparece aqui</p>
          </div>
        )}
      </div>
    </div>
  );
}
