/**
 * Escolha do automático pras campanhas de CATEGORIA (campaigns.categoria ≠ 'geral') — 19/Out.
 *
 *   fraldas → fraldas em promoção do Fralda Barata (fraldas.produtos): no menor preço dos últimos 30 dias,
 *             com desconto ≥15% ou bem abaixo da mediana do preço por fralda do mesmo tamanho. Vira oferta
 *             (source='fraldabarata', source_ref=id do produto) e entra na fila.
 *   cupons  → cupons do Telegram com o nosso link (últimas 3h), sem repetir código já postado hoje na campanha.
 *   enxoval → produtos de enxoval por palavra-chave (coletores + Telegram, últimas 48h), sem repetir em 7 dias.
 *
 * Essas campanhas NÃO mudam offers.status (o Ofertas Maternas continua podendo postar a mesma oferta).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = SupabaseClient<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export type Categoria = "geral" | "fraldas" | "cupons" | "enxoval";

interface Camp { id: string; perfil_id: string | null }

const chave = (t: string | null) => (t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim().slice(0, 40);

/** ofertas que a campanha já pôs na fila desde `desde` (qualquer status) */
async function jaDaCampanha(db: DB, campId: string, desde: string): Promise<Any[]> {
  const { data } = await db
    .from("publication_queue")
    .select("offer:offers(id, title, source_ref, coupon_code, coupon_meta)")
    .contains("campaign_ids", [campId])
    .gte("created_at", desde)
    .limit(1000);
  return ((data ?? []) as Any[]).map((r) => r.offer).filter(Boolean);
}

// ── FRALDAS ────────────────────────────────────────────────────────────────
async function escolherFraldas(db: DB, c: Camp, n: number): Promise<string[]> {
  const fresco = new Date(Date.now() - 12 * 3600_000).toISOString();
  const { data: prods } = await db.schema("fraldas").from("produtos")
    .select("id, marketplace, titulo, tamanho, quantidade, preco, preco_original, desconto_pct, preco_por_fralda, link_afiliado, imagem_url, rating, oficial, menor_preco_30d, dias_historico")
    .eq("ativo", true).eq("categoria", "fralda").eq("confianca", "ok")
    .not("link_afiliado", "is", null).not("imagem_url", "is", null).not("preco_por_fralda", "is", null)
    .gte("atualizado_em", fresco)
    .limit(3000);
  const lista = (prods ?? []) as Any[];
  if (!lista.length) return [];

  // mediana do preço por fralda por tamanho
  const porTam = new Map<string, number[]>();
  for (const p of lista) { const k = p.tamanho || "?"; if (!porTam.has(k)) porTam.set(k, []); porTam.get(k)!.push(Number(p.preco_por_fralda)); }
  const mediana = new Map<string, number>();
  for (const [k, v] of porTam) { v.sort((a, b) => a - b); mediana.set(k, v[Math.floor(v.length / 2)]); }

  const noMinimo = (p: Any) => p.menor_preco_30d != null && (p.dias_historico ?? 0) >= 3 && Number(p.preco) <= Number(p.menor_preco_30d);
  const score = (p: Any) => Number(p.preco_por_fralda) / (mediana.get(p.tamanho || "?") || Number(p.preco_por_fralda));
  const promo = lista.filter((p) => noMinimo(p) || (p.desconto_pct ?? 0) >= 15 || score(p) <= 0.8);

  // sem repetir: produto postado pela campanha nos últimos 3 dias / mesmo título hoje
  const feitos = await jaDaCampanha(db, c.id, new Date(Date.now() - 3 * 86400_000).toISOString());
  const refs = new Set(feitos.map((o) => o.source_ref).filter(Boolean));
  const titulos = new Set(feitos.map((o) => chave(o.title)));
  const cands = promo
    .filter((p) => !refs.has(p.id) && !titulos.has(chave(p.titulo)))
    .sort((a, b) => (Number(noMinimo(b)) - Number(noMinimo(a))) || score(a) - score(b));

  const ids: string[] = [];
  const tamanhosUsados = new Set<string>();
  // varia o tamanho: 1 por tamanho por rodada antes de repetir tamanho
  const ordem = [...cands.filter((p) => { const ok = !tamanhosUsados.has(p.tamanho); tamanhosUsados.add(p.tamanho); return ok; }), ...cands];
  const vistos = new Set<string>();
  for (const p of ordem) {
    if (ids.length >= n) break;
    if (vistos.has(p.id)) continue;
    vistos.add(p.id);
    const oferta = {
      source: "fraldabarata", source_ref: p.id, perfil_id: c.perfil_id, kind: "produto",
      platform: p.marketplace, url: p.link_afiliado, affiliate_url: p.link_afiliado,
      title: p.titulo, price_current: p.preco, price_original: p.preco_original, discount_pct: p.desconto_pct,
      // status "published": é espelho interno do Fralda Barata — não aparece em Publicações nem entra no mix
      // do Ofertas Maternas (que só pega draft de auto/telegram); a campanha de fraldas ignora status
      image_url: p.imagem_url, status: "published",
      promo_meta: { unit_price: Number(p.preco_por_fralda), rating: p.rating ?? null, loja_oficial: !!p.oficial, menor_30d: noMinimo(p) },
    };
    const { data: existe } = await db.from("offers").select("id").eq("source", "fraldabarata").eq("source_ref", p.id).maybeSingle();
    let id = existe?.id as string | undefined;
    if (id) await db.from("offers").update(oferta).eq("id", id);
    else {
      const ins = await db.from("offers").insert(oferta).select("id").single();
      if (ins.error) throw new Error(`fralda barata → offers: ${ins.error.message}`);
      id = (ins.data as Any)?.id;
    }
    if (id) ids.push(id);
  }
  return ids;
}

// ── CUPONS ─────────────────────────────────────────────────────────────────
const PALAVRAS = new Set(["UNICOS", "CUPONS", "OFERTA", "OFERTAS", "CORREE", "VOLTOU", "APROVEITA", "PROMOCAO", "MERCADO", "SHOPEE", "AMAZON", "GRATIS", "LIMITE", "LIBERADO", "LIBERADOS", "LIBERADA", "PREPARA", "ATIVOS", "CHEGOU", "ESGOTADO", "ESGOTANDO", "CORRENDO", "CORRAM", "RAPIDO", "URGENTE"]);
/**
 * Tira "códigos" que são palavra da frase do canal ("ÚNICOS QUE AINDA TEM" → NICOS, AINDA; "CORREEEE", "LIBERADO").
 * Com número (40OFF1910) vale; só letras precisa de 6+ letras, não ser palavra comum e não terminar em letra repetida (OBAAA).
 */
export function codigoValido(c: string): boolean {
  const s = (c || "").toUpperCase();
  if (!/^[A-Z0-9]{4,20}$/.test(s)) return false;
  if (/(.)\1{2,}/.test(s)) return false; // CORREEEE, UHUUU
  if (/\d/.test(s)) return true;
  if (s.length < 6 || PALAVRAS.has(s)) return false;
  return !/(.)\1$/.test(s); // SAINDOO
}

async function escolherCupons(db: DB, c: Camp, n: number, dayStart: string): Promise<string[]> {
  const desde = new Date(Date.now() - 3 * 3600_000).toISOString();
  const { data } = await db.from("offers")
    .select("id, title, extra_text, coupon_code, coupon_meta, created_at")
    .eq("perfil_id", c.perfil_id!).eq("kind", "cupom").eq("source", "telegram")
    .not("affiliate_url", "is", null).gte("created_at", desde)
    .order("created_at", { ascending: false }).limit(200);
  const feitos = await jaDaCampanha(db, c.id, dayStart);
  const usados = new Set<string>();
  for (const o of feitos) for (const k of (o.coupon_meta?.codes?.length ? o.coupon_meta.codes : [o.coupon_code])) if (k) usados.add(String(k).toUpperCase());

  // post de "ESGOTADO/ENCERRADO" não é cupom: não posta e mata o código pro resto do dia
  const MORTO = /esgotad|encerrad|acabou|expirad|n[aã]o (est[aá] )?funciona/i;
  const codigosDe = (o: Any): string[] => (o.coupon_meta?.codes?.length ? o.coupon_meta.codes : o.coupon_code ? [o.coupon_code] : []).map((k: string) => String(k).toUpperCase());
  const lista = (data ?? []) as Any[];
  const mortos = new Set<string>();
  for (const o of lista) if (MORTO.test(`${o.title} ${o.extra_text} ${o.coupon_meta?.regra ?? ""}`)) codigosDe(o).forEach((k) => mortos.add(k));

  const ids: string[] = [];
  for (const o of lista) {
    if (ids.length >= n) break;
    if (MORTO.test(`${o.title} ${o.extra_text} ${o.coupon_meta?.regra ?? ""}`)) continue;
    const brutos: string[] = o.coupon_meta?.codes?.length ? o.coupon_meta.codes : o.coupon_code ? [o.coupon_code] : [];
    const bons = [...new Set(brutos.map((k) => String(k).toUpperCase()).filter(codigoValido))];
    if (!bons.length || bons.some((k) => usados.has(k) || mortos.has(k))) continue;
    // limpa os códigos-palavra da oferta (a legenda mostra só os bons)
    if (bons.length !== brutos.length) {
      await db.from("offers").update({ coupon_code: bons[0], coupon_meta: { ...(o.coupon_meta || {}), codes: bons } }).eq("id", o.id);
    }
    bons.forEach((k) => usados.add(k));
    ids.push(o.id);
  }
  return ids;
}

// ── ENXOVAL ────────────────────────────────────────────────────────────────
// itens de enxoval/recém-nascido; roupa genérica só conta se for de bebê
const ENXOVAL = /enxoval|\bbod(y|ies)\b|macac[aã]o|mij[aã]o|cueiro|\bmanta\b|toalha (de banho|com capuz|fralda)|fralda de pano|kit ber[cç]o|protetor de ber[cç]o|len[cç]ol (de |para )?ber[cç]o|sa[ií]da (de )?maternidade|bolsa maternidade|\btouca\b|luvinha|pag[aã]o|kit (de )?higiene|banheira|trocador|fraldário|\bninho\b|mosquiteiro|saco de dormir|beb[eê] conforto|\bber[cç]o\b|carrinho de beb[eê]|travesseiro anti ?refluxo|kit (rec[eé]m|beb[eê])/i;
const ROUPA = /conjunto|roupa|roupinha|pijama|meias?\b|sapatinho|kit (de )?roupa/i;
const DE_BEBE = /beb[eê]|\brn\b|rec[eé]m|maternidade|0 ?a ?3 meses|\bmeses\b/i;
const FORA = /\b([2-9]|1[0-6]) anos\b|adulto|gestante|\bpet\b|cachorro|\bgato\b|boneca|brinquedo|fraldas? descart|pampers|huggies|turma da m[oô]nica|babysec|mamypoko|personal/i;
export const ehEnxoval = (t: string | null) => {
  const s = t || "";
  if (FORA.test(s)) return false;
  if (ENXOVAL.test(s)) return true;
  return ROUPA.test(s) && DE_BEBE.test(s);
};

async function escolherEnxoval(db: DB, c: Camp, n: number): Promise<string[]> {
  const { data } = await db.from("offers")
    .select("id, title, source, created_at")
    .eq("perfil_id", c.perfil_id!).eq("kind", "produto").in("source", ["auto", "telegram"])
    .not("image_url", "is", null).not("affiliate_url", "is", null)
    .gte("created_at", new Date(Date.now() - 48 * 3600_000).toISOString())
    .order("created_at", { ascending: false }).limit(600);
  const feitos = await jaDaCampanha(db, c.id, new Date(Date.now() - 7 * 86400_000).toISOString());
  const usados = new Set(feitos.map((o) => chave(o.title)));
  const ids: string[] = [];
  for (const o of (data ?? []) as Any[]) {
    if (ids.length >= n) break;
    if (!ehEnxoval(o.title) || usados.has(chave(o.title))) continue;
    usados.add(chave(o.title));
    ids.push(o.id);
  }
  return ids;
}

/** ids de ofertas pra enfileirar na campanha de categoria */
export async function escolherPorCategoria(db: DB, categoria: Categoria, c: Camp, n: number, dayStart: string): Promise<string[]> {
  if (categoria === "fraldas") return escolherFraldas(db, c, n);
  if (categoria === "cupons") return escolherCupons(db, c, n, dayStart);
  if (categoria === "enxoval") return escolherEnxoval(db, c, n);
  return [];
}
