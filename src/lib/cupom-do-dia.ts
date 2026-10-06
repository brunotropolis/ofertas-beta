/**
 * "Cupom do dia" pros posts de produto: o leitor do Telegram captura cupons gerais da loja
 * (ex.: Shopee "R$15 OFF acima de R$89", ML "SITE30 = R$30 OFF em R$299"). Pra um produto,
 * escolhe o cupom de LOJA INTEIRA de hoje que vale pro preço e dá o maior desconto.
 * Cupom de categoria/itens selecionados nunca entra (não dá pra garantir que vale pro produto).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export interface CupomDia {
  loja: string; // shopee | ml
  code: string;
  regra: string; // "R$30 OFF acima de R$299"
  min: number; // valor mínimo do pedido
  fixo: number | null; // R$ OFF
  pct: number | null; // % OFF
  max: number | null; // teto do % OFF
  cond: "full" | "oficial" | null; // cupom restrito a entregas Full / lojas oficiais
}

const CATEGORIA = /selecionad|itens|categoria|produtos? |moda|beleza|casa|decor|brinq|crian|eletr|celular|pet|mercado\b|supermercado|livro|games?|esporte|ferrament|autom|bebidas?|primeira compra|novos? usu[aá]rios?|app\b/i;
const money = (s: string) => parseFloat(s.replace(/\./g, "").replace(",", "."));

const brl = (n: number) => "R$" + (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(".", ","));

function parseRegra(line: string): Omit<CupomDia, "loja" | "code"> | null {
  const cond: CupomDia["cond"] = /full/i.test(line) ? "full" : /lojas? oficia/i.test(line) ? "oficial" : null;
  if (CATEGORIA.test(line.replace(/lojas? oficia\w*|entregas? full/gi, ""))) return null;
  const min = line.match(/(?:acima de|em compras? (?:acima|a partir) de|a partir de|\bem)\s*R\$\s*([\d.]+(?:,\d{1,2})?)/i);
  const fixo = line.match(/R\$\s*([\d.]+(?:,\d{1,2})?)\s*(?:de\s*)?OFF/i);
  const pct = line.match(/(\d{1,2})\s*%\s*(?:de\s*)?(?:OFF|desconto)/i);
  const max = line.match(/(?:m[aá]x(?:imo)?\.?|limit(?:e|ado)(?: a)?(?: de)?)\s*R\$\s*([\d.]+(?:,\d{1,2})?)/i);
  if (!min || (!fixo && !pct)) return null;
  const r = { min: money(min[1]), fixo: fixo ? money(fixo[1]) : null, pct: !fixo && pct ? +pct[1] : null, max: max ? money(max[1]) : null };
  // frase limpa e padronizada (o texto do canal vem com "acesse o link", ":" etc.)
  const regra = (r.fixo ? `${brl(r.fixo)} OFF acima de ${brl(r.min)}` : `${r.pct}% OFF acima de ${brl(r.min)}${r.max ? ` (máx ${brl(r.max)})` : ""}`)
    + (cond === "full" ? " em entregas Full" : cond === "oficial" ? " em lojas oficiais" : "");
  return { regra, cond, ...r };
}

/** Cupons gerais capturados nas últimas 24h, por loja (deduplicados por código). */
export async function loadCuponsDoDia(db: SupabaseClient): Promise<CupomDia[]> {
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (db as any)
    .from("offers")
    .select("platform, coupon_code, coupon_meta, extra_text, created_at")
    .eq("source", "telegram")
    .eq("kind", "cupom")
    .in("platform", ["shopee", "ml"])
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(200);
  const out = new Map<string, CupomDia>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const o of (data ?? []) as any[]) {
    const codes: string[] = o.coupon_meta?.codes?.length ? o.coupon_meta.codes : o.coupon_code ? [o.coupon_code] : [];
    const lines: string[] = String(o.coupon_meta?.regra || o.extra_text || "").split("\n").map((l: string) => l.trim()).filter(Boolean);
    codes.forEach((code, i) => {
      if (out.has(`${o.platform}:${code}`)) return;
      // regra do código: mesma posição quando bate 1:1; senão a linha que cita o código; senão (1 código) a 1ª regra válida
      const own = lines.find((l) => l.includes(code)) || (lines.length === codes.length ? lines[i] : codes.length === 1 ? lines.find((l) => parseRegra(l)) : undefined);
      const r = own ? parseRegra(own.replace(code, "")) : null;
      if (!r) return;
      // restrição também pelo nome do código (o canal nem sempre escreve "entregas Full"/"lojas oficiais")
      const cond = r.cond ?? (/FULL/.test(code) ? "full" : /OFICIA/.test(code) ? "oficial" : null);
      const regra = r.cond || !cond ? r.regra : r.regra + (cond === "full" ? " em entregas Full" : " em lojas oficiais");
      out.set(`${o.platform}:${code}`, { loja: o.platform, code, ...r, cond, regra });
    });
  }
  return [...out.values()];
}

const desconto = (c: CupomDia, price: number) =>
  c.fixo ?? (c.pct ? Math.min((price * c.pct) / 100, c.max ?? Infinity) : 0);

/** Melhor cupom que vale pro produto (loja certa, preço ≥ mínimo). */
export function melhorCupom(
  cupons: CupomDia[], platform: string | null | undefined, price: number | null | undefined,
  promo?: { full?: boolean; loja_oficial?: boolean } | null,
): CupomDia | null {
  if (!platform || !price) return null;
  const ok = cupons.filter((c) => c.loja === platform && price >= c.min
    && (c.cond !== "full" || !!promo?.full) && (c.cond !== "oficial" || !!promo?.loja_oficial));
  if (!ok.length) return null;
  return ok.sort((a, b) => desconto(b, price) - desconto(a, price))[0];
}
