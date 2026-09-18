/**
 * Montagem da legenda final (espelha o `buildCaption` do dispatcher, estilo
 * maternidade) pra PREVIEW no painel. Se a oferta tem `ai_caption`, ela vira as
 * linhas criativas; senão cai num fallback simples (no post real, quando
 * `ai_caption` está vazio, o dispatcher gera com a IA na hora — o preview avisa).
 */

export interface CaptionOffer {
  title: string | null;
  affiliate_url?: string | null;
  url: string;
  ai_caption?: string | null;
  extra_text?: string | null;
  price_current?: number | null;
  price_original?: number | null;
}

export function moneyBRL(v: number): string {
  return "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function priceBlockMaternity(offer: CaptionOffer): string {
  const a = offer.price_current;
  if (a == null) return "";
  const o = offer.price_original;
  const lines = [`💰 Por *${moneyBRL(a)}*`];
  if (o != null && o > a) lines.push(`> Custa ${moneyBRL(o)}`);
  return lines.join("\n");
}

/**
 * Monta a legenda como vai sair (quando `ai_caption` está preenchido, o preview
 * bate 100% com o post). Retorna também se usou fallback (pra UI avisar).
 */
export function buildCaptionPreview(offer: CaptionOffer): { text: string; usedFallback: boolean } {
  const creativeRaw = offer.ai_caption?.trim() || "";
  const usedFallback = !creativeRaw;
  const creative = creativeRaw || `✨ ${offer.title || "Oferta imperdível"}`;

  const parts: string[] = [creative];
  if (offer.title) parts.push(`*${offer.title.trim()}*`);

  const pb = priceBlockMaternity(offer);
  if (pb) parts.push(pb);
  if (offer.extra_text?.trim()) parts.push(offer.extra_text.trim());

  const url = offer.affiliate_url || offer.url;
  parts.push(`Compre aqui 👇\n${url}`);
  return { text: parts.join("\n\n"), usedFallback };
}
