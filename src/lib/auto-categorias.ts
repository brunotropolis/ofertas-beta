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
import { foraDoPerfil } from "@/lib/regras-perfil";
import { carregarBloqueios, motivoBloqueio } from "@/lib/bloqueados";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = SupabaseClient<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export type Categoria = "geral" | "fraldas" | "cupons" | "enxoval" | "canal";

interface Camp { id: string; perfil_id: string | null; niche?: string | null }

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
const TESTE_FRALDAS_ATE = "2026-12-02"; // último dia (BRT) do teste "jeito da equipe" no grupo de Fraldas
const brtHoje = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
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
  const emPromo = (p: Any) => noMinimo(p) || (p.desconto_pct ?? 0) >= 15 || score(p) <= 0.8;
  // 25/Nov TESTE (Bruno: "por favor", depois da análise Amazon × grupo de Fraldas): até 02/12 o grupo volta ao jeito da
  // equipe de setembro, só Pampers e Huggies da Amazon/ML (a equipe postava ~10/dia, quase tudo Amazon, e a Amazon vendia
  // 458 fraldas/mês; com 60/dia misturando lojas caiu pra ~6/dia). Em promoção primeiro, mas sem exigir promoção.
  // Volume (12/dia, 1 por hora) fica na campanha. Desfazer: TESTE_FRALDAS_ATE = "" (ou esperar a data) + cap 70 / timer 10.
  const teste = brtHoje() <= TESTE_FRALDAS_ATE;
  const base = teste ? lista.filter((p) => ["amazon", "ml"].includes(p.marketplace) && /pampers|huggies/i.test(p.titulo || "")) : lista;
  const promo = teste ? base : base.filter(emPromo);

  // sem repetir: produto postado pela campanha nos últimos 3 dias / mesmo título hoje
  const feitos = await jaDaCampanha(db, c.id, new Date(Date.now() - 3 * 86400_000).toISOString());
  const refs = new Set(feitos.map((o) => o.source_ref).filter(Boolean));
  const titulos = new Set(feitos.map((o) => chave(o.title)));
  let cands = promo
    .filter((p) => !refs.has(p.id) && !titulos.has(chave(p.titulo)))
    .sort((a, b) => (Number(emPromo(b)) - Number(emPromo(a))) || (Number(noMinimo(b)) - Number(noMinimo(a))) || score(a) - score(b));
  // no teste a lista é curta (~40 produtos): acabou o que não saiu em 3 dias, repete o que não saiu nas últimas 24 h
  if (teste && cands.length < n) {
    const dia = await jaDaCampanha(db, c.id, new Date(Date.now() - 86400_000).toISOString());
    const refsDia = new Set(dia.map((o) => o.source_ref).filter(Boolean));
    cands = [...cands, ...promo.filter((p) => refs.has(p.id) && !refsDia.has(p.id))];
  }

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
const PALAVRAS = new Set(["UNICOS", "CUPONS", "OFERTA", "OFERTAS", "CORREE", "VOLTOU", "APROVEITA", "PROMOCAO", "MERCADO", "SHOPEE", "AMAZON", "GRATIS", "LIMITE", "LIBERADO", "LIBERADOS", "LIBERADA", "PREPARA", "ATIVOS", "CHEGOU", "ESGOTADO", "ESGOTANDO", "CORRENDO", "CORRAM", "RAPIDO", "URGENTE", "DESBLOQUEADO", "DESBLOQUEADOS", "DESBLOQUEADA", "LIBERADAS", "ATIVADO", "ATIVADOS", "DISPONIVEL", "DISPONIVEIS", "VALIDOS", "NOVIDADE", "NOVIDADES", "ATENCAO", "AVISO", "COMPRE", "COMPRA", "MINUTOS", "ULTIMOS", "LTIMOS", "ULTIMAS", "LTIMAS", "HORAS", "AGORAA", "SOMENTE", "APENAS", "CUPOM"]);
/**
 * Tira "códigos" que são palavra da frase do canal ("ÚNICOS QUE AINDA TEM" → NICOS, AINDA; "CORREEEE", "LIBERADO").
 * Com número (40OFF1910) vale; só letras precisa de 6+ letras, não ser palavra comum e não terminar em letra repetida (OBAAA).
 */
export function codigoValido(c: string): boolean {
  const s = (c || "").toUpperCase();
  if (!/^[A-Z0-9]{4,20}$/.test(s)) return false;
  if (/(.)\1{2,}/.test(s)) return false; // CORREEEE, UHUUU
  if (/\d/.test(s)) return true;
  if (s.length < 6 || PALAVRAS.has(s) || PALAVRA_SOLTA.has(s)) return false;
  if (/(.)\1$/.test(s)) return false; // SAINDOO
  // 27/Out: "DISPON" (DISPONÍVEL cortado) e "INSERIR" saíram nos grupos como código. Código de verdade só de
  // letras é palavra COMPOSTA (TOPMELI, OFFHOJE, MELITECH, SUPERDESCONTO): vale se tem um pedaço típico de código
  // e mais 3+ letras além dele, ou se é longo (9+) e não é palavra solta conhecida.
  const pedaco = PEDACOS_CODIGO.find((p) => s.includes(p));
  if (pedaco && s.length >= pedaco.length + 3) return true;
  return s.length >= 9;
}
// pedaços que aparecem nos códigos reais (medido nos cupons de 12–27/Out)
const PEDACOS_CODIGO = ["MELI", "OFF", "NOML", "HOJE", "TECH", "PROMO", "CUPO", "DESCONTO", "OFERTA", "RESGATE", "SITE", "CLUB", "VALE", "MIMO", "COMPRA", "ECONOMIA", "ACHADO", "SUPER", "TOP", "AQUI", "LOJA", "ESTOQUE", "CARRINHO", "GARANTE"];
// palavras soltas que os canais escrevem em CAIXA ALTA e passavam como código
const PALAVRA_SOLTA = new Set(["DISPON", "INSERIR", "RESGATAR", "RESGATE", "SEMPRE", "PROMOS", "ECONOMIZE", "OPORTUNIDADE", "EXCLUSIVO", "EXCLUSIVA", "PRIMEIRA", "CASHBACK", "RENOVADOS", "SEXTOU", "APROVEITE", "DESCONTO", "DESCONTOS", "PRESENTE", "CLIQUE", "ACESSE", "APLIQUE", "UTILIZE", "DIGITE", "COPIE", "CODIGO", "INSIRA", "CONFIRA", "GARANTA", "PEGUE", "CHECKOUT", "PAGAMENTO", "CARRINHO", "ESTOQUE", "MERCADOPAGO", "ACIMA", "ABAIXO", "TODOSITE", "IMPERDIVEL", "INCRIVEL", "SELECIONADOS", "PRODUTOS",
  // 31/Out: "CUPOM SHOPEE VOLTANDO 98% UTILIZADO" saiu como código UTILIZADO (9+ letras passava)
  "UTILIZADO", "UTILIZADOS", "UTILIZADA", "UTILIZADAS", "VOLTANDO", "ACABANDO", "ACABOU", "FUNCIONANDO", "FUNCIONOU",
  "CONFIRMADO", "CONFIRMADA", "LIMITADO", "LIMITADA", "LIMITADOS", "VALENDO", "TESTADO", "TESTADOS", "ENCERRADO", "ENCERRANDO",
  "ATIVANDO", "LIBERANDO", "DISPONIBILIZADO", "RESGATADO", "RESGATADOS", "APROVEITEM", "CORRAMMM", "ULTIMOSDIAS"]);

async function escolherCupons(db: DB, c: Camp, n: number, dayStart: string): Promise<string[]> {
  const desde = new Date(Date.now() - 3 * 3600_000).toISOString();
  const { data } = await db.from("offers")
    .select("id, title, extra_text, coupon_code, coupon_meta, created_at")
    .eq("perfil_id", c.perfil_id!).eq("kind", "cupom").in("source", ["telegram", "auto"]) // auto = lista da página de Cupons do ML (26/Out)
    .not("affiliate_url", "is", null).gte("created_at", desde)
    .order("created_at", { ascending: false }).limit(200);
  const feitos = await jaDaCampanha(db, c.id, dayStart);
  const idsFeitos = new Set<string>(feitos.map((o) => o.id as string));
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
    // lista de cupons do ML (sem código pra conferir): entra 1x por campanha
    if (Array.isArray(o.coupon_meta?.lista) && o.coupon_meta.lista.length) {
      if (!idsFeitos.has(o.id)) { ids.push(o.id); idsFeitos.add(o.id); }
      continue;
    }
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
const FORA = /\b([2-9]|1[0-6]) anos\b|adulto|gestante|\bpet\b|cachorro|\bgato\b|boneca|brinquedo|fraldas? descart|pampers|huggies|turma da m[oô]nica|babysec|mamypoko|personal|sab[aã]o|amaciante|detergente|lava[- ]?roupa|para roupas|tira ?manchas|shampoo|condicionador|len[cç]os? umedecid/i;
export const ehEnxoval = (t: string | null) => {
  const s = t || "";
  if (FORA.test(s)) return false;
  if (ENXOVAL.test(s)) return true;
  return ROUPA.test(s) && DE_BEBE.test(s);
};

async function escolherEnxoval(db: DB, c: Camp, n: number): Promise<string[]> {
  const { data } = await db.from("offers")
    .select("id, title, source, created_at, url, affiliate_url, platform, extra_text, promo_meta")
    .eq("perfil_id", c.perfil_id!).eq("kind", "produto").in("source", ["auto", "telegram"])
    .not("image_url", "is", null).not("affiliate_url", "is", null)
    .gte("created_at", new Date(Date.now() - 48 * 3600_000).toISOString())
    .order("created_at", { ascending: false }).limit(600);
  const feitos = await jaDaCampanha(db, c.id, new Date(Date.now() - 7 * 86400_000).toISOString());
  const usados = new Set(feitos.map((o) => chave(o.title)));
  const bloqueios = await carregarBloqueios(db);
  const ids: string[] = [];
  for (const o of (data ?? []) as Any[]) {
    if (ids.length >= n) break;
    if (!ehEnxoval(o.title) || usados.has(chave(o.title))) continue;
    if (motivoBloqueio(bloqueios, c.perfil_id, o)) continue; // 26/Nov: lista de bloqueio + internacional
    usados.add(chave(o.title));
    ids.push(o.id);
  }
  return ids;
}

// ── CANAIS DE WHATSAPP (25/Nov) ────────────────────────────────────────────
// Bruno: "Manual do recém-nascido quero que poste produtos de bebês; Achados da Day, beleza, bem estar e decoração;
// Manual dos adultos, coisas para casa, escritório, eletrônicos... mas nada gamer ou sério demais, produtos para casal descolado".
// A campanha diz qual canal é pelo `campaigns.niche`. Pega dos perfis que já coletam (não muda o status da oferta,
// então os grupos continuam podendo postar o mesmo produto), sem repetir em 7 dias, maior desconto primeiro, revezando os perfis.
const PERFIL_ID = {
  maternas: "8e8332fa-ebd8-41d5-948f-21bb6cd27a97",
  lar: "9b2a012e-4d44-41b3-8f1c-896c55c57d18",
  mae: "aa6b7dcb-11c6-4e8f-bcab-5965ec51462d",
  geek: "f3887ae2-7b2c-462b-8984-e1e6618a0ba6",
};
const CRIANCA = /beb[eê]|infantil|crian[cç]a|\bkids?\b|\brn\b|rec[eé]m[- ]nascid|fralda|maternidade|chupeta|mamadeira|ber[cç]o/i; // 25/Nov: "berço" conta (lençol "Berço Solteiro Casal" saiu no canal dos adultos)
const DECOR = /decora|almofada|\bvaso|quadro|lumin[aá]ria|abajur|tapete (de sala|decorativo|felpudo|para sala|para quarto)|cortina|\bvela|aromatiz|difusor|espelho|porta[- ]retrato|cachep[oô]|planta|ta[cç]as?\b|jogo americano|toalha de mesa|manta|cobertor|edredom|len[cç]ol|organizador de (maquiagem|joias|bijuterias|acess[oó]rios)|cesto|bandeja|rel[oó]gio de parede|enfeite|fita de led/i;
const LIMPEZA = /sab[aã]o|amaciante|detergente|desinfetante|[aá]gua sanit[aá]ria|alvejante|papel higi[eê]nico|lava[- ]?roupas?|limpador|multiuso|tira ?manchas|esponja|saco de lixo|inseticida|veneno|ra[cç][aã]o|\bmop\b|\brod(o|inho)\b|esfreg|vassoura|balde|papel toalha|limpa ?vidros?|escorredor|m[aá]quina de lavar|porta ovos|\bovos\b/i;
const GAMER = /\bgam(e|er|ing)s?\b|console|playstation|\bps[345]\b|xbox|nintendo|\bswitch\b|joystick|controle (sem fio )?(ps|xbox|para (ps|xbox|switch))|headset gamer|cadeira gamer|funko|action figure|colecion[aá]vel|est[aá]tua|mang[aá]\b|\bhq\b|card ?game|pok[eé]mon|\brpg\b|cosplay|miniatura|boneco|figure|figura de a[cç][aã]o|dragon ball|one piece|naruto|pel[uú]cia/i;
const SERIO = /disjuntor|fus[ií]vel|parafus|furadeira|serra |esmerilhadeira|nobreak|rack\b|servidor|cabo de rede|switch de rede|roteador|impressora t[eé]rmica|ferramenta|chave de fenda|alicate|multimetro|mult[ií]metro|pneu|automotiv|veicular|inversor|[oó]leo de motor|bateria de carro|fralda geri|incontin[eê]ncia|ortop[eé]dic|cadeira de rodas|seguran[cç]a do trabalho|\bepi\b/i;
const CANAIS: Record<string, { fontes: { perfil: string; entra: RegExp | null; fora: RegExp }[] }> = {
  "canal-bebe": { fontes: [{ perfil: PERFIL_ID.maternas, entra: null, fora: /adulto|gestante|p[oó]s[- ]parto|absorvente|pet\b|cachorro/i }] },
  "canal-achados": { fontes: [
    { perfil: PERFIL_ID.mae, entra: null, fora: CRIANCA },
    { perfil: PERFIL_ID.lar, entra: DECOR, fora: new RegExp(`${CRIANCA.source}|${LIMPEZA.source}`, "i") },
  ] },
  "canal-adultos": { fontes: [
    { perfil: PERFIL_ID.lar, entra: null, fora: new RegExp(`${CRIANCA.source}|${LIMPEZA.source}|${SERIO.source}`, "i") },
    { perfil: PERFIL_ID.geek, entra: null, fora: new RegExp(`${CRIANCA.source}|${GAMER.source}|${SERIO.source}|camiseta|caneca (geek|nerd)|star wars|marvel|dc comics|harry potter|anime`, "i") },
  ] },
};

async function escolherCanal(db: DB, c: Camp, n: number): Promise<string[]> {
  const cfg = CANAIS[c.niche ?? ""];
  if (!cfg) return [];
  const feitos = await jaDaCampanha(db, c.id, new Date(Date.now() - 7 * 86400_000).toISOString());
  const usados = new Set(feitos.map((o) => chave(o.title)));
  const desde = new Date(Date.now() - 48 * 3600_000).toISOString();
  const bloqueios = await carregarBloqueios(db);
  const listas: Any[][] = [];
  for (const f of cfg.fontes) {
    const { data } = await db.from("offers")
      .select("id, title, discount_pct, price_current, url, affiliate_url, platform, extra_text, promo_meta")
      .eq("perfil_id", f.perfil).eq("kind", "produto").in("source", ["auto", "telegram"])
      .not("image_url", "is", null).not("affiliate_url", "is", null).not("price_current", "is", null)
      .gte("created_at", desde).order("discount_pct", { ascending: false, nullsFirst: false }).limit(800);
    // 25/Nov: o canal também passa pela regra do perfil de onde a oferta vem (a mesma dos grupos, regras-perfil.ts)
    listas.push(((data ?? []) as Any[]).filter((o) => o.title && !f.fora.test(o.title) && (!f.entra || f.entra.test(o.title)) && !foraDoPerfil(f.perfil, o.title) && !motivoBloqueio(bloqueios, f.perfil, o)));
  }
  const ids: string[] = [];
  const pos = listas.map(() => 0);
  // reveza as fontes (1 de cada por vez), maior desconto primeiro dentro de cada uma
  for (let volta = 0; ids.length < n && volta < 2000; volta++) {
    const i = volta % listas.length;
    while (pos[i] < listas[i].length) {
      const o = listas[i][pos[i]++];
      if (usados.has(chave(o.title))) continue;
      usados.add(chave(o.title));
      ids.push(o.id);
      break;
    }
    if (pos.every((p, k) => p >= listas[k].length)) break;
  }
  return ids;
}

/** ids de ofertas pra enfileirar na campanha de categoria */
export async function escolherPorCategoria(db: DB, categoria: Categoria, c: Camp, n: number, dayStart: string): Promise<string[]> {
  if (categoria === "fraldas") return escolherFraldas(db, c, n);
  if (categoria === "cupons") return escolherCupons(db, c, n, dayStart);
  if (categoria === "enxoval") return escolherEnxoval(db, c, n);
  if (categoria === "canal") return escolherCanal(db, c, n);
  return [];
}
