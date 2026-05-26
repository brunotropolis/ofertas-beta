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
    <div>
      <p className="text-[11px] text-zinc-500 uppercase tracking-wider font-medium mb-3">
        Preview WhatsApp
      </p>

      {/* Phone-like frame */}
      <div className="glass rounded-2xl p-4">
        {/* WhatsApp bubble */}
        <div className="bg-[#0f0f0f] rounded-2xl p-3.5 max-w-sm ring-1 ring-white/5">
          {/* Caption */}
          {caption && (
            <div className="mb-2.5 text-sm text-white/90 whitespace-pre-wrap leading-relaxed">
              {caption}
            </div>
          )}

          {/* Link card */}
          {(title || image_url) && (
            <div className="bg-[#1c1c1c] rounded-xl overflow-hidden border border-white/5">
              <div className="flex gap-0">
                {image_url ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={image_url}
                    alt={title}
                    className="w-[72px] h-[72px] object-cover shrink-0"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : (
                  <div className="w-[72px] h-[72px] bg-[#2a2a2a] shrink-0 flex items-center justify-center">
                    <ExternalLink className="w-5 h-5 text-zinc-600" />
                  </div>
                )}

                <div className="p-2.5 flex-1 min-w-0">
                  {domain && (
                    <p className="text-[10px] text-[#00a884] font-medium truncate mb-0.5 tracking-wide">
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
                <div className="px-3 py-2.5 border-t border-white/5 flex items-center gap-2">
                  <span className="text-[#00a884] font-bold text-sm">
                    R$ {Number(price_current).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </span>
                  {price_original && price_original > price_current && (
                    <span className="text-white/40 text-xs line-through">
                      R$ {Number(price_original).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </span>
                  )}
                  {discount_pct && discount_pct > 0 && (
                    <span className="ml-auto bg-orange-500/15 text-orange-400 text-[11px] font-bold px-1.5 py-0.5 rounded">
                      -{discount_pct}%
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
