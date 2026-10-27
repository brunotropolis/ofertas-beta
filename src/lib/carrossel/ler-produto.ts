import crypto from "crypto";
import { isUrlPermitida } from "@/lib/schemas";

// Leitura de produto pra Fábrica de Carrossel: nome, foto e preço a partir do link da loja.
// Ordem: segue link curto (só por hosts permitidos) → API oficial (Shopee afiliado / Amazon Creators)
// → oferta que o painel já coletou → tags OG da página. Preço e foto vêm da fonte, nunca de IA.

export type Plataforma = "amazon" | "shopee" | "ml";

export interface ProdutoLido {
  platform: Plataforma;
  url: string; // link final (depois dos redirects)
  title: string;
  price_current: number | null;
  image_url: string | null;
  fonte: string; // de onde veio (pra depurar)
}

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export function detectar(url: string): Plataforma | null {
  const h = new URL(url).hostname;
  if (/(^|\.)amazon\.com(\.br)?$|amzn\.to$|(^|\.)a\.co$/i.test(h)) return "amazon";
  if (/shopee\.com\.br$|shope\.ee$/i.test(h)) return "shopee";
  if (/mercadolivre\.com\.br$|meli\.la$/i.test(h)) return "ml";
  return null;
}

// Segue redirects na mão pra validar cada salto contra a allowlist (anti-SSRF).
export async function resolver(url: string): Promise<string> {
  let atual = url;
  for (let i = 0; i < 5; i++) {
    const r = await fetch(atual, { method: "GET", redirect: "manual", headers: { "User-Agent": UA }, signal: AbortSignal.timeout(6000) });
    const loc = r.headers.get("location");
    if (r.status < 300 || r.status >= 400 || !loc) return atual;
    const prox = new URL(loc, atual).toString();
    if (!isUrlPermitida(prox)) return atual;
    atual = prox;
  }
  return atual;
}

export function chave(platform: Plataforma, url: string): string | null {
  if (platform === "amazon") return url.match(/\/(?:dp|gp\/product|d)\/([A-Z0-9]{10})/i)?.[1]?.toUpperCase() ?? null;
  if (platform === "ml") {
    const m = url.match(/MLB-?(\d+)/i);
    return m ? `MLB${m[1]}` : null;
  }
  const m = url.match(/i\.(\d+)\.(\d+)/) || url.match(/\/product\/(\d+)\/(\d+)/) || url.match(/shopee\.com\.br\/[^/?]+\/(\d+)\/(\d+)/);
  return m ? `${m[1]}.${m[2]}` : null;
}

export async function shopeeOficial(shopItem: string) {
  const appId = process.env.SHOPEE_APP_ID;
  const secret = process.env.SHOPEE_APP_SECRET;
  if (!appId || !secret) return null;
  const [shopId, itemId] = shopItem.split(".");
  const body = JSON.stringify({ query: `{productOfferV2(shopId:${+shopId},itemId:${+itemId},limit:1){nodes{productName imageUrl priceMin}}}` });
  const ts = Math.floor(Date.now() / 1000);
  const sig = crypto.createHash("sha256").update(`${appId}${ts}${body}${secret}`).digest("hex");
  const r = await fetch("https://open-api.affiliate.shopee.com.br/graphql", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `SHA256 Credential=${appId},Timestamp=${ts},Signature=${sig}` },
    body,
    signal: AbortSignal.timeout(8000),
  });
  const n = (await r.json())?.data?.productOfferV2?.nodes?.[0];
  if (!n) return null;
  return { title: n.productName as string, image: (n.imageUrl as string) || null, price: n.priceMin ? parseFloat(n.priceMin) : null };
}

export async function amazonOficial(asin: string) {
  const id = process.env.AMAZON_ACCESS_KEY;
  const secret = process.env.AMAZON_SECRET_KEY;
  const tag = process.env.AMAZON_PARTNER_TAG;
  if (!id || !secret || !tag) return null;
  const t = await fetch("https://api.amazon.com/auth/o2/token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ grant_type: "client_credentials", client_id: id, client_secret: secret, scope: "creatorsapi::default" }),
    signal: AbortSignal.timeout(8000),
  });
  const token = (await t.json())?.access_token;
  if (!token) return null;
  const r = await fetch("https://creatorsapi.amazon/catalog/v1/getItems", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer " + token, "x-marketplace": "www.amazon.com.br" },
    body: JSON.stringify({ itemIds: [asin], partnerTag: tag, marketplace: "www.amazon.com.br", resources: ["images.primary.large", "itemInfo.title", "offersV2.listings.price"] }),
    signal: AbortSignal.timeout(8000),
  });
  const it = (await r.json())?.itemsResult?.items?.[0];
  if (!it) return null;
  return {
    title: (it.itemInfo?.title?.displayValue as string) || "",
    image: (it.images?.primary?.large?.url as string) || null,
    price: (it.offersV2?.listings?.[0]?.price?.money?.amount as number) ?? null,
  };
}

export async function mlOficial(mlb: string) {
  const r = await fetch(`https://api.mercadolibre.com/items/${mlb}`, { signal: AbortSignal.timeout(6000) });
  if (!r.ok) return null;
  const d = await r.json();
  return {
    title: d.title as string,
    image: ((d.pictures?.[0]?.url || d.thumbnail || "") as string).replace("-I.jpg", "-O.jpg") || null,
    price: (d.price as number) ?? null,
  };
}

export async function ogDaPagina(url: string) {
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html", "Accept-Language": "pt-BR,pt;q=0.9" }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) return null;
  const html = await r.text();
  const og = (n: string) =>
    html.match(new RegExp(`<meta[^>]+property=["']og:${n}["'][^>]+content=["']([^"']+)["']`, "i"))?.[1] ||
    html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:${n}["']`, "i"))?.[1] ||
    "";
  const title = og("title") || html.match(/<title[^>]*>([^<]{5,})<\/title>/i)?.[1]?.trim() || "";
  if (!title && !og("image")) return null;
  return { title, image: og("image") || null, price: null as number | null };
}
