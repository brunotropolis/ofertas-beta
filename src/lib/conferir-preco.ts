// 18/Nov (Bruno: "não podemos mais ter esse tipo de erro na hora de postar"): conferência de preço na hora de
// postar, igual o Amazon Refresh já faz na Amazon. Vale pra Shopee (API oficial de afiliado) e Mercado Livre
// (página do produto). Regra:
//  - loja igual ou mais barata (até +3%): posta com o preço da loja (corrige centavos e queda de preço);
//  - loja até 25% mais cara: posta com o PREÇO DA LOJA (o cupom, se houver, continua no post como economia extra);
//  - loja mais de 25% mais cara: a oferta acabou, não posta;
//  - Shopee sem o produto na API: não posta (saiu do ar / esgotou).
//  - ML sem conseguir ler a página: só posta se o preço foi pego há menos de 12h.
// O preço novo é gravado na oferta (price_current/price_original/discount_pct) e o post sai com ele.
import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { caminhoDaUrl, lerMagalu, pedirLeituraMagalu } from "./magalu";

type DB = SupabaseClient;

export interface OfertaPreco {
  id: string;
  platform?: string | null;
  kind?: string | null;
  url: string;
  affiliate_url?: string | null;
  price_current: number | null;
  price_original: number | null;
  discount_pct: number | null;
  ai_caption?: string | null;
  created_at?: string | null;
  source_ref?: string | null;
  promo_meta?: { cupom_anuncio?: string | null; aviso?: unknown; exclusiva?: unknown } | null;
}

export type ResultadoConferencia =
  | { ok: true; loja: number | null; antes: number | null; mudou: boolean; motivo: string }
  | { ok: false; loja: number | null; antes: number | null; motivo: string };

const UA = {
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36",
  "accept-language": "pt-BR,pt;q=0.9",
};
const TOLERANCIA = 1.03; // até 3% acima conta como "mesmo preço" (arredondamento, frete de centavos)
const VARIACAO_MAX = 2.5; // Shopee: maior variação / menor acima disso = preço de isca
const TETO_SUBIDA = 1.25; // acima disso a oferta acabou
const ML_FRESCO_MS = 12 * 3600_000;

const brl = (s: string) => Number(s.replace(/\./g, "").replace(",", "."));

const idsShopee = (u: string) => u.match(/\/product\/(\d+)\/(\d+)/) || u.match(/-i\.(\d+)\.(\d+)/) || u.match(/shopee\.com\.br\/[^/?]+\/(\d+)\/(\d+)/);

/** shopId/itemId: do link, do source_ref ("shp:loja.item") ou seguindo o link curto s.shopee.com.br */
async function shopeeIds(o: OfertaPreco): Promise<RegExpMatchArray | null> {
  for (const u of [o.url, o.affiliate_url]) { const m = u ? idsShopee(u) : null; if (m) return m; }
  const ref = o.source_ref?.match(/^shp:(\d+)\.(\d+)$/);
  if (ref) return ref;
  let u = [o.url, o.affiliate_url].find((x) => x && /s\.shopee\.com\.br/.test(x)) ?? null;
  for (let i = 0; u && i < 6; i++) {
    const r = await fetch(u, { headers: UA, redirect: "manual", signal: AbortSignal.timeout(8000) });
    const loc = r.headers.get("location");
    if (!loc) break;
    u = new URL(loc, u).toString();
    const m = idsShopee(decodeURIComponent(u));
    if (m) return m;
  }
  return null;
}

async function precoShopee(o: OfertaPreco): Promise<{ achou: boolean; preco: number | null; max?: number | null }> {
  const appId = process.env.SHOPEE_APP_ID, secret = process.env.SHOPEE_APP_SECRET;
  if (!appId || !secret) throw new Error("SHOPEE_APP_ID/SECRET ausentes");
  const m = await shopeeIds(o);
  if (!m) throw new Error("link Shopee sem shopId/itemId");
  const body = JSON.stringify({ query: `{productOfferV2(shopId:${+m[1]},itemId:${+m[2]},limit:1){nodes{priceMin priceMax}}}` });
  const ts = Math.floor(Date.now() / 1000);
  const sig = crypto.createHash("sha256").update(`${appId}${ts}${body}${secret}`).digest("hex");
  const r = await fetch("https://open-api.affiliate.shopee.com.br/graphql", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `SHA256 Credential=${appId},Timestamp=${ts},Signature=${sig}` },
    body, signal: AbortSignal.timeout(8000),
  });
  const j = await r.json();
  if (j?.errors?.length) throw new Error("Shopee API: " + JSON.stringify(j.errors).slice(0, 120));
  const n = j?.data?.productOfferV2?.nodes?.[0];
  if (!n) return { achou: false, preco: null };
  return { achou: true, preco: n.priceMin ? parseFloat(n.priceMin) : null, max: n.priceMax ? parseFloat(n.priceMax) : null };
}

/** preço do ML pela página do produto: og:title "... - R$ 48,90" ou itemprop="price" */
export async function precoML(url: string): Promise<number | null> {
  const r = await fetch(url.split("#")[0], { headers: UA, redirect: "follow", signal: AbortSignal.timeout(10000) });
  if (/account-verification|captcha|login/.test(r.url)) return null;
  const t = await r.text();
  const og = t.match(/og:title"\s+content="[^"]*?- R\$ ([\d.]+(?:,\d{1,2})?)"/);
  if (og) return brl(og[1]);
  const ip = t.match(/itemprop="price"\s+content="([\d.]+)"/);
  if (ip) return Number(ip[1]);
  return null;
}

// meli.la (nosso link) abre a página/vitrine com o produto e o og:title traz o preço
function urlProdutoML(o: OfertaPreco): string | null {
  return [o.url, o.affiliate_url].find((u) => u && /meli\.la|mercadolivre\.com\.br/.test(u)) ?? null;
}

/** cupom do próprio anúncio do ML ("20% OFF com Cupom") explica o post abaixo da página */
function fatorCupomAnuncio(o: OfertaPreco): number {
  const p = o.promo_meta?.cupom_anuncio?.match(/(\d{1,2})\s*%/);
  return p ? 1 / (1 - Number(p[1]) / 100) : 1;
}

export async function conferirPrecoAntesDePostar(db: DB, o: OfertaPreco): Promise<ResultadoConferencia> {
  const antes = o.price_current;
  const plat = o.platform;
  if (o.kind === "cupom" || o.promo_meta?.aviso || (plat !== "shopee" && plat !== "ml" && plat !== "magalu")) {
    return { ok: true, loja: null, antes, mudou: false, motivo: "não confere (cupom/aviso/Amazon)" };
  }

  let loja: number | null = null;
  try {
    if (plat === "magalu") {
      // 20/Nov: preço lido pelo Chrome do operador (extensão). Leitura com mais de 12h = pede de novo e só posta com
      // leitura fresca; sem estoque = não posta.
      const c = caminhoDaUrl(o.url ?? "");
      const l = c ? await lerMagalu(db, c.sku) : null;
      if (l && l.disponivel === false) return { ok: false, loja: null, antes, motivo: "produto sem estoque na Magalu" };
      const fresca = l?.lido_em && Date.now() - Date.parse(l.lido_em) < 12 * 3600_000;
      if (!fresca) {
        if (c) await pedirLeituraMagalu(db, c.sku, c.caminho);
        return { ok: false, loja: null, antes, motivo: "esperando o Chrome ler o preço na Magalu" };
      }
      loja = l?.preco ?? null;
    } else if (plat === "shopee") {
      const s = await precoShopee(o);
      if (!s.achou) return { ok: false, loja: null, antes, motivo: "produto não está mais na Shopee (saiu do ar ou esgotou)" };
      // 25/Nov (pente fino: lençol queen "R$ 12,40" no canal dos adultos, era a variação de R$ 12,40 a R$ 41,58):
      // anúncio com variação 2,5x+ mais cara que o preço do post = o preço é de um tamanho/peça menor, não posta.
      if (s.preco && s.max && s.max >= s.preco * VARIACAO_MAX) {
        return { ok: false, loja: s.preco, antes, motivo: `preço é da variação mais barata (R$ ${s.preco} a R$ ${s.max})` };
      }
      loja = s.preco;
    } else {
      const u = urlProdutoML(o);
      loja = u ? await precoML(u) : null;
    }
  } catch (e) {
    loja = null;
    console.warn("[conferir-preco]", o.id, e instanceof Error ? e.message : e);
  }

  if (loja == null || !(loja > 0)) {
    const idade = Date.now() - Date.parse(o.created_at ?? "");
    if (plat === "ml" && !(idade < ML_FRESCO_MS)) {
      return { ok: false, loja: null, antes, motivo: "não consegui conferir o preço no ML e o preço guardado tem mais de 12h" };
    }
    return { ok: true, loja: null, antes, mudou: false, motivo: "sem leitura da loja agora; preço recente, segue" };
  }

  if (antes != null && antes > 0) {
    const fator = plat === "ml" ? fatorCupomAnuncio(o) : 1;
    // preço idêntico (centavo a centavo) = confere; qualquer outra diferença vira o preço exato da loja
    if (Math.abs(loja - antes) < 0.01) {
      return { ok: true, loja, antes, mudou: false, motivo: "preço confere" };
    }
    if (loja > antes * TETO_SUBIDA * fator) {
      return { ok: false, loja, antes, motivo: `preço subiu na loja (post R$ ${antes} x loja R$ ${loja})` };
    }
    if (fator > 1 && loja > antes * TOLERANCIA && loja <= antes * TOLERANCIA * fator) {
      // diferença explicada pelo cupom do anúncio do ML: mantém o preço com cupom
      return { ok: true, loja, antes, mudou: false, motivo: "confere com o cupom do anúncio" };
    }
  }

  // corrige pro preço da loja (mais caro até 25%, ou mais barato)
  const orig = o.price_original != null && o.price_original > loja * 1.02 ? o.price_original : null;
  const desconto = orig ? Math.round((1 - loja / orig) * 100) : null;
  const patch: Record<string, unknown> = { price_current: loja, price_original: orig, discount_pct: desconto };
  // a frase da IA pode citar o preço antigo: descarta pra gerar de novo
  if (o.ai_caption && /R\$\s*\d/.test(o.ai_caption)) patch.ai_caption = null;
  await db.from("offers").update(patch).eq("id", o.id);
  o.price_current = loja;
  o.price_original = orig;
  o.discount_pct = desconto;
  if (patch.ai_caption === null) o.ai_caption = null;
  return { ok: true, loja, antes, mudou: true, motivo: `preço corrigido pro da loja (R$ ${antes} > R$ ${loja})` };
}
