/**
 * Legenda no padrão do grupo As Ofertas Maternas (mapeado 05/Out em 337 posts reais).
 * Fonte única: o dispatcher (post de verdade) e o preview do painel usam as mesmas funções.
 *
 * Produto:  [OFERTAS DE FRALDAS 🚼 | 2 linhas da IA]
 *           *Título*
 *           💰 Por *R$X*  /  *(0,79 por unidade)*  /  > Custa R$Y
 *           _Exclusivo para Membros Prime_
 *           🏷️Utilize o cupom: *COD*
 *           ✔️Selecione a opção "programe e poupe" / ✔️Confira o desconto na tela de pagamento / ...
 *           🚚 Frete Grátis c/ Amazon PRIME
 *           Compre aqui 👇 link
 * Cupom:    *🟡CUPOM LOJA 🟡*  +  🎟️ *COD* / regra  +  Resgate aqui 👇 link
 */

export interface PromoMeta {
  prime_exclusive?: boolean;
  badge?: string | null;
  deal_end?: string | null;
  unit_price?: number | null; // preço por unidade (Amazon pricePerUnit) — só quando a unidade é "unidade"
  amazon_seller?: boolean; // vendido pela própria Amazon
  vendido_por?: string | null; // "✔️Selecione item vendido por X" (do post de origem)
  programe_poupe?: boolean;
  confira_pagamento?: boolean;
  adicione_n?: number | null;
  // coletores ML/Shopee (gatilhos de compra do próprio anúncio)
  rating?: number | null; // 4.9
  vendidos?: string | null; // "+100mil" / "+800"
  loja_oficial?: boolean;
  cupom_anuncio?: string | null; // ML: "20% OFF com Cupom"
  frete_gratis?: boolean;
  chega_amanha?: boolean;
  full?: boolean;
}

export interface CaptionOffer {
  title: string | null;
  affiliate_url?: string | null;
  url: string;
  ai_caption?: string | null;
  extra_text?: string | null;
  price_current?: number | null;
  price_original?: number | null;
  kind?: string | null;
  coupon_code?: string | null;
  coupon_meta?: { codes?: string[]; loja?: string; regra?: string } | null;
  promo_meta?: PromoMeta | null;
  platform?: string | null;
  discount_pct?: number | null;
  cupom_dia?: { code: string; regra: string } | null; // cupom geral do dia que vale pro preço (lib/cupom-do-dia)
}

// aviso de urgência sempre que o post leva cupom (gatilho do grupo)
export const AVISO_CUPOM = "⚠️ _Cupons podem encerrar a qualquer momento!_";

const LOJA: Record<string, string> = { shopee: "Shopee", ml: "Mercado Livre", amazon: "Amazon" };

export function moneyBRL(v: number): string {
  return "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
const num2 = (v: number) => Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** É fralda/lenço? (cabeçalho de fralda + cálculo por unidade) */
export function isFralda(title: string | null | undefined): boolean {
  return /\bfralda/i.test(title || "");
}
const isPorUnidade = (title: string | null | undefined) => /\bfralda|len[cç]os? umedecid|toalhas? umedecid/i.test(title || "");

/** Quantidade no título: "com 34", "36 unidades", "140 unid", "80 fraldas", "Kit 12 ... 140un" (pega a maior). */
export function qtyFromTitle(title: string | null | undefined): number | null {
  const t = title || "";
  const nums = [...t.matchAll(/(?:\bcom\s+(\d{2,4})\b|\b(\d{2,4})\s*(?:unidades|unid\.?|un\b|fraldas|folhas|len[cç]os))/gi)]
    .map((m) => +(m[1] || m[2]))
    .filter((n) => n >= 10 && n <= 2000);
  return nums.length ? Math.max(...nums) : null;
}

function unitLine(offer: CaptionOffer): string | null {
  if (!isPorUnidade(offer.title)) return null;
  const u = offer.promo_meta?.unit_price;
  if (u && u > 0) return `*(${num2(u)} por unidade)*`;
  const q = qtyFromTitle(offer.title);
  if (q && offer.price_current) return `*(${num2(offer.price_current / q)} por unidade)*`;
  return null;
}

function priceBlock(offer: CaptionOffer): string {
  const a = offer.price_current;
  if (a == null) return "";
  const o0 = offer.price_original;
  // % sempre dos preços mostrados (o % guardado podia ficar velho ou vir de outra base)
  const pct = o0 && o0 > a ? Math.round((1 - a / o0) * 100) : 0;
  // trava: acima de 80% quase sempre é preço "de" errado/inflado → mostra só o preço (Bruno 10/Out)
  const confiavel = pct > 0 && pct <= 80;
  const lines = [`💰 Por *${moneyBRL(a)}*${confiavel && pct >= 5 ? ` (${pct}% OFF)` : ""}`];
  const u = unitLine(offer);
  if (u) lines.push(u);
  if (confiavel) lines.push(`> Custa ${moneyBRL(o0!)}`);
  return lines.join("\n");
}

function couponLine(offer: CaptionOffer): string | null {
  const codes = offer.coupon_meta?.codes?.length ? offer.coupon_meta.codes : offer.coupon_code ? [offer.coupon_code] : [];
  if (!codes.length && offer.cupom_dia) return `🏷️Utilize o cupom: *${offer.cupom_dia.code}*\n_(${offer.cupom_dia.regra})_`;
  if (!codes.length) return null;
  return `🏷️Utilize o cupom: ${codes.map((c) => `*${c}*`).join(" ou ")}`;
}

function instructionLines(offer: CaptionOffer): string[] {
  const p = offer.promo_meta || {};
  const out: string[] = [];
  if (p.programe_poupe) out.push(`✔️Selecione a opção "programe e poupe"`);
  if (p.cupom_anuncio) out.push(`✔️Ative o cupom de ${p.cupom_anuncio.replace(/\s*com cupom/i, "")} no anúncio`);
  if (p.vendido_por) out.push(`✔️Selecione item vendido por ${p.vendido_por}.`);
  if (p.adicione_n && p.adicione_n > 1) out.push(`✔️Adicione ${p.adicione_n} ou mais unidades`);
  if (p.programe_poupe || p.confira_pagamento) out.push(`✔️Confira o desconto na tela de pagamento`);
  return out;
}

function provaSocial(offer: CaptionOffer): string | null {
  const p = offer.promo_meta || {};
  const bits: string[] = [];
  // nota (⭐) fora da legenda — pedido do Bruno 10/Out
  if (p.vendidos) bits.push(`${p.vendidos} vendidos`);
  if (p.loja_oficial) bits.push("Loja oficial");
  return bits.length ? bits.join(" · ") : null;
}

function freteLine(offer: CaptionOffer): string | null {
  if (offer.platform !== "amazon") {
    const p = offer.promo_meta || {};
    const bits = [p.frete_gratis && "Frete grátis", p.chega_amanha && "Chega amanhã", p.full && "FULL"].filter(Boolean);
    return bits.length ? `🚚 ${bits.join(" · ")}` : null;
  }
  return offer.promo_meta?.amazon_seller === false
    ? `🚚 Frete c/ condição especial Amazon PRIME`
    : `🚚 Frete Grátis c/ Amazon PRIME`;
}

// extra_text antigo do leitor Telegram ("🏷️ Use o cupom: *X*") — agora o cupom sai do coupon_code
const isLegacyCouponExtra = (s: string) => /^🏷️\s*Use o cupom/i.test(s.trim());

/**
 * Corpo do post de PRODUTO (estilo maternidade). `creative` = 2 linhas da IA (ou null).
 * Fralda usa o cabeçalho do grupo no lugar das linhas da IA.
 */
export function buildMaternityCaption(offer: CaptionOffer, creative: string | null): string {
  const parts: string[] = [];
  parts.push(isFralda(offer.title) ? "OFERTAS DE FRALDAS 🚼" : creative || "🌟 OFERTA DO DIA 🌟");
  if (offer.title) parts.push(`*${offer.title.trim()}*`);
  const pb = priceBlock(offer);
  if (pb) parts.push(pb);
  const ps = provaSocial(offer);
  if (ps) parts.push(ps);
  if (offer.promo_meta?.prime_exclusive) parts.push(`_Exclusivo para Membros Prime_`);
  const cl = couponLine(offer);
  if (cl) parts.push(cl);
  const ins = instructionLines(offer);
  if (ins.length) parts.push(ins.join("\n"));
  const fr = freteLine(offer);
  if (fr) parts.push(fr);
  if (cl || offer.promo_meta?.cupom_anuncio) parts.push(AVISO_CUPOM);
  if (offer.extra_text?.trim() && !isLegacyCouponExtra(offer.extra_text)) parts.push(offer.extra_text.trim());
  parts.push(`Compre aqui 👇\n${offer.affiliate_url || offer.url}`);
  return parts.join("\n\n");
}

/** Post de CUPOM (sem IA), no formato do grupo. */
export function buildCouponCaption(offer: CaptionOffer): string {
  const loja = LOJA[offer.coupon_meta?.loja || offer.platform || ""] || "";
  const codes = offer.coupon_meta?.codes?.length ? offer.coupon_meta.codes : offer.coupon_code ? [offer.coupon_code] : [];
  const regras = (offer.coupon_meta?.regra || offer.extra_text || "")
    .split("\n").map((l) => l.replace(/[🎟📍✅🔥💥🏷️]/gu, "").trim()).filter(Boolean)
    // tira o código de dentro da regra ("R$15 OFF em R$89: C0RR1D41010")
    .map((l) => codes.reduce((acc, c) => acc.replace(new RegExp(`[:\\s-]*\\b${c}\\b`, "g"), ""), l).trim())
    .filter(Boolean);
  const parts: string[] = [`*🟡CUPOM ${loja.toUpperCase()} 🟡*`];
  if (codes.length && regras.length === codes.length) {
    parts.push(codes.map((c, i) => `🎟️ *${c}*\n${regras[i]}`).join("\n\n"));
  } else {
    if (codes.length) parts.push(codes.map((c) => `🎟️ *${c}*`).join("\n"));
    if (regras.length) parts.push(regras.join("\n"));
  }
  parts.push(AVISO_CUPOM);
  parts.push(`Resgate aqui 👇\n${offer.affiliate_url || offer.url}`);
  return parts.join("\n\n");
}

/**
 * Preview no painel (bate 100% com o post quando `ai_caption` está preenchido).
 * Sem legenda salva, mostra um marcador no lugar das 2 linhas da IA.
 */
export function buildCaptionPreview(offer: CaptionOffer): { text: string; usedFallback: boolean } {
  if (offer.kind === "cupom") return { text: buildCouponCaption(offer), usedFallback: false };
  const creativeRaw = offer.ai_caption?.trim() || "";
  const usedFallback = !creativeRaw && !isFralda(offer.title);
  return { text: buildMaternityCaption(offer, creativeRaw || "✍️ (2 linhas da IA na hora do post)"), usedFallback };
}
