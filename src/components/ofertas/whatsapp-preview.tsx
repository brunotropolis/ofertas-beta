"use client";

import { ExternalLink } from "lucide-react";

interface Props {
  title: string;
  price_current: number | null;
  price_original: number | null;
  discount_pct: number | null;
  image_url: string | null;
  affiliate_url: string;
  caption: string;
  platform: string | null;
}

const PLATFORM_LABELS: Record<string, string> = {
  amazon: "amazon.com.br",
  shopee: "shopee.com.br",
  ml: "mercadolivre.com.br",
};

export default function WhatsAppPreview({
  title,
  price_current,
  price_original,
  discount_pct,
  image_url,
  affiliate_url,
  caption,
  platform,
}: Props) {
  const domain = platform ? PLATFORM_LABELS[platform] ?? platform : "";
  const shortUrl = affiliate_url
    ? affiliate_url.replace(/^https?:\/\//, "").slice(0, 45) + (affiliate_url.length > 50 ? "…" : "")
    : "";

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-2">
        Preview WhatsApp
      </p>

      {/* WhatsApp bubble */}
      <div className="bg-[#1a1a1a] rounded-xl p-3 max-w-sm">
        {/* Caption */}
        {caption && (
          <div className="mb-2 text-sm text-white/90 whitespace-pre-wrap leading-relaxed">
            {caption}
          </div>
        )}

        {/* Link card */}
        {(title || image_url) && (
          <div className="bg-[#2a2a2a] rounded-lg overflow-hidden border border-white/5">
            <div className="flex gap-0">
              {/* Image */}
              {image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={image_url}
                  alt={title}
                  className="w-16 h-16 object-cover shrink-0"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : (
                <div className="w-16 h-16 bg-[#3a3a3a] shrink-0 flex items-center justify-center">
                  <ExternalLink className="w-5 h-5 text-gray-600" />
                </div>
              )}

              {/* Info */}
              <div className="p-2 flex-1 min-w-0">
                {domain && (
                  <p className="text-[10px] text-[#00a884] font-medium truncate mb-0.5">
                    {domain}
                  </p>
                )}
                <p className="text-xs text-white/90 leading-tight line-clamp-2 font-medium">
                  {title || "Título do produto"}
                </p>
                {shortUrl && (
                  <p className="text-[10px] text-white/40 truncate mt-0.5">{shortUrl}</p>
                )}
              </div>
            </div>

            {/* Price row */}
            {price_current && (
              <div className="px-3 py-2 border-t border-white/5 flex items-center gap-2">
                <span className="text-[#00a884] font-bold text-sm">
                  R$ {Number(price_current).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </span>
                {price_original && price_original > price_current && (
                  <span className="text-white/40 text-xs line-through">
                    R$ {Number(price_original).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </span>
                )}
                {discount_pct && discount_pct > 0 && (
                  <span className="ml-auto bg-red-500/20 text-red-400 text-xs font-bold px-1.5 py-0.5 rounded">
                    -{discount_pct}%
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
