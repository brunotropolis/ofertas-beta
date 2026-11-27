/**
 * Auto-enqueue (trickle) — mantém a fila abastecida sozinha.
 *
 * Pra cada campanha com auto_enqueue=true e ativa:
 *   1. Respeita a janela de horário (auto_window_start/end, em BRT).
 *   2. Conta quantas ofertas AUTOMÁTICAS já foram publicadas hoje (BRT) pra
 *      essa campanha (queue publicada com created_by NULL = auto; manual tem
 *      created_by preenchido e NÃO conta no teto).
 *   3. Se já bateu o teto do dia (auto_daily_cap) → não enfileira.
 *   4. Se já tem 1 item automático pendente na fila → espera o dispatcher drenar
 *      (o timer da campanha é quem espaça os posts).
 *   5. Senão, escolhe pelas METAS do dia (escolherOfertas: fralda 35%, Amazon 45%,
 *      @promocaozinha primeiro, coletores de reserva) e enfileira nessa campanha. O dispatcher posta no próximo tick
 *      que estiver "due" pelo timer.
 *
 * Manual e automático dividem a mesma fila e o mesmo timer — é um único fluxo de
 * postagem; o teto só limita o quanto o sistema posta por conta própria.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { escolherPorCategoria, type Categoria } from "@/lib/auto-categorias";
import { tetoDoDia } from "@/lib/fim-de-semana";
import { comPlantao, emPausaPlantao } from "@/lib/plantao";
import { caminhoDaUrl, pedirLeituraMagalu } from "@/lib/magalu";
import { foraDoPerfil, MARCA_BOA, EQUIP, ALIMENTA, CASA, BELEZA, catDe } from "@/lib/regras-perfil";
import { carregarBloqueios, motivoBloqueio } from "@/lib/bloqueados";
import { lerRegras, categoriaDe, palavraQueCasou, temMarca, foraDasRegras, type RegrasCampanha, type CategoriaRegra } from "@/lib/regras-campanha";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = SupabaseClient<any>;

interface AutoCampaign {
  id: string;
  name: string;
  perfil_id: string | null;
  auto_daily_cap: number;
  auto_window_start: number;
  auto_window_end: number;
  auto_buffer: number;
  categoria?: Categoria | null;
  niche?: string | null;
  regras?: unknown;
}

export interface AutoEnqueueResult {
  campaigns_checked: number;
  enqueued: number;
  skipped: { campaign: string; reason: string }[];
}

// Início do dia de hoje em BRT (UTC-3), devolvido como ISO UTC.
function brtDayStartUtcIso(): string {
  const now = new Date();
  // "agora" em BRT
  const brt = new Date(now.getTime() - 3 * 3600_000);
  const y = brt.getUTCFullYear();
  const m = brt.getUTCMonth();
  const d = brt.getUTCDate();
  // meia-noite BRT = 03:00 UTC do mesmo dia
  return new Date(Date.UTC(y, m, d, 3, 0, 0)).toISOString();
}

// Hora atual (0-23) em BRT.
function brtHour(): number {
  const brt = new Date(Date.now() - 3 * 3600_000);
  return brt.getUTCHours();
}

// ── Metas do mix automático (decisão Bruno 08/Out: Amazon e fralda = melhor comissão) ──
// 22/Out (Bruno: "vamos retornar o que estava funcionando"): mix da operação MANUAL que vendia ~2x mais
// (grupo #2, 07–16/10: ML 45%, Amazon 33%, fralda 20%, Shopee o resto; 41% com cupom; preço mediano R$46).
// Era (08/Out): fralda 35% + Amazon 45%, só @promocaozinha.
// 12/Nov (Bruno, via Tio Patinhas: "postar menos fraldas... ofertas que vendem bem"): 3 meses de venda × posts mostraram
// fralda = 21% da geral e comissão caindo (ago R$3,7 mil > out R$2,1 mil); saúde do bebê 6% dos posts e 8% da venda;
// amamentação 10% × 6%, brinquedo 6% × 3%. Fralda na geral: meta 13%, teto 15%, só marca forte (Huggies/Pampers);
// o resto das fraldas fica pro grupo de Fraldas. Era 20% (22/Out).
const META_FRALDA = 0.13;
const TETO_FRALDA = 0.15;
const FRALDA_BOA = /huggies|pampers/i;
// 26/Nov (estudo produtos, Bruno: "pode aplicar as 5"): saúde era 10% (com Bepantol/assadura dentro) e os aparelhos
// (termômetro, aspirador nasal, umidificador) chegaram a 5% dos posts contra ~1% da equipe. Meta 6% + teto de aparelho 3%.
const META_SAUDE = 0.06;
const SAUDE_APAR = /aspirador nasal|sugador|term[oô]metro|nebuliz|inalador|umidificador|seringa|lavagem nasal|soro fisiol/i;
const TETO_SAUDE_APAR = 0.03;
const SAUDE = /aspirador nasal|sugador nasal|term[oô]metro|nebuliz|inalador|esteriliz|aquecedor de mamadeira|umidificador|bepantol|pomada|assadura|desitin|weleda|hipogl|bab[aá] eletr|monitor de beb|ru[ií]do branco/i;
// 26/Nov: lenço/algodão foi a 12% dos posts (equipe 3–5%, e vendia igual). Meta 4% e teto 5% (vale também pro campeão).
const META_LENCO = 0.04;
const TETO_LENCO = 0.05;
const LENCO = /len[çc]os? umedecid|toalhas? umedecid/i;
const TETO_AMAMENTA = 0.06;
const AMAMENTA = /mamadeira|bomba (de |tira )|tira ?leite|extrator|amamenta|chupeta|mordedor|copo de transi|prato|potinho|babador|cadeira de alimenta/i;
const TETO_BRINQUEDO = 0.04;
const BRINQUEDO = /brinquedo|pel[uú]cia|chocalho|boneca|blocos|m[oó]bile|montessori|quebra-?cabe/i;
// 12/Nov (Bruno: "pelo menos umas 3x por dia... eletrodomésticos, eletrônicos ou coisas pra maternidade, tipo babá
// eletrônica, airfryer, aspirador nasal"): 1 a cada 12 posts da geral (70/dia → ~6; fim de semana 30 → 3). Vem dos
// coletores das Maternas e, se faltar, do Geek (só o que serve pra mãe — GEEK_SERVE_MAE).
const GADGET_A_CADA = 12;
const GADGET = /bab[aá] eletr|air ?fryer|fritadeira|aspirador nasal|sugador nasal|esteriliz|aquecedor de mamadeira|umidificador|purificador|liquidificador|mixer|processador de alimento|aspirador (de )?p[oó]|aspirador vertical|rob[oô] aspirador|aspirador rob|panela el[eé]trica|cafeteira|ventilador|term[oô]metro (digital|infravermelho|de testa)|nebuliz|monitor de beb|c[aâ]mera (de seguran|wi-?fi|para beb)|extrator de leite|bomba (de |tira )?leite el|ru[ií]do branco|sanduicheira|batedeira|micro-?ondas|forno el[eé]trico/i;
/** tipo do aparelho (1ª palavra do que casou: "termometro", "baba", "air"...) — não repetir o mesmo tipo no dia */
const tipoGadget = (t: string | null) => ((t || "").match(GADGET)?.[0] || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/\s+/)[0].replace(/^air$/, "fritadeira").replace(/^sugador$/, "aspirador");
const ehGadget = (t: string | null) => !!t && GADGET.test(t) && !GEEK_SO_GEEK_RE.test(t);
// 26/Nov (estudo produtos): o que a equipe postava e o robô parou. Só na geral das Maternas.
//  - enxoval e equipamento de marca conhecida (cadeirão, carrinho, berço, babá, banheira, bomba, mamadeira, roupa):
//    ~20% dos posts. A equipe tinha 15% e essa família chegou a 19% da comissão em agosto.
//  - Natura (loja da Day): a equipe postava ~3%; hoje entrava quase nunca (sem meta).
//  - leite, fórmula, papinha: equipe ~2%, robô 0,2%.
//  - Shopee: teto 10% (foi a 18%), e genérico sem marca abaixo de R$ 20 só com nota ≥4,8 e 1.000+ vendidos.
const META_EQUIP = 0.20;
const META_NATURA = 0.04;
const META_ALIMENTA = 0.02;
const TETO_SHOPEE = 0.10;
const ehEquipBom = (o: { title?: string | null; price_current?: number | null }) => { const t = o.title || ""; const p = o.price_current ?? 0; return EQUIP.test(t) && MARCA_BOA.test(t) && p >= 30 && p <= 800; };
const ehEquipOk = (o: { title?: string | null; price_current?: number | null; platform?: string | null }) => { const t = o.title || ""; const p = o.price_current ?? 0; return EQUIP.test(t) && p >= 100 && p <= 800 && o.platform !== "shopee"; };
const ehEquip = (o: { title?: string | null; price_current?: number | null; platform?: string | null }) => ehEquipBom(o) || ehEquipOk(o);
/** tipo do equipamento (carrinho, berco, baba...) pra variar no dia: na simulação saíram 4 carrinhos Burigotto em 25 posts */
const tipoEquip = (t: string | null) => ((t || "").match(EQUIP)?.[0] || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/\s+/)[0];
const ehNatura = (o: { url?: string | null; affiliate_url?: string | null }) => /natura\.com/i.test(`${o.url ?? ""} ${o.affiliate_url ?? ""}`);
/** "+8,2 mil" > 8200 · "+500" > 500 */
const vendidosNum = (v: unknown) => { const s = String(v ?? "").toLowerCase().replace(/\+/g, "").trim(); const n = parseFloat(s.replace(/\.(?=\d{3})/g, "").replace(",", ".")); return Number.isFinite(n) ? (/mil/.test(s) ? n * 1000 : n) : 0; };
const genericoShopee = (o: Cand) => {
  if (o.platform !== "shopee" || (o.price_current ?? 0) >= 20 || MARCA_BOA.test(o.title || "")) return false;
  const pm = (o.promo_meta ?? {}) as Record<string, unknown>;
  return !(Number(pm.rating ?? 0) >= 4.8 && vendidosNum(pm.vendidos) >= 1000);
};
// 26/Nov (Bruno: "manda ver em tudo", orientação de casa e beleza tirada dos concorrentes, 40 posts/dia cada):
//  Lar: cozinha ~12, limpeza ~10, cama e banho ~6, eletroportátil ~6, organização ~4, eletro grande 1-2 (só com desconto forte).
//  Mãe: cabelo ~10, pele ~8, perfume e corpo ~8, bem-estar ~6, maquiagem ~5, aparelho ~3. Natura e Boticário dentro de corpo.
//  Marca conhecida primeiro em cada categoria; no Mãe, produto sem marca abaixo de R$ 20 fica de fora.
const PERFIL_MAE = "aa6b7dcb-11c6-4e8f-bcab-5965ec51462d";
const COTA_LAR: Record<string, number> = { cozinha: 0.30, limpeza: 0.25, cama_banho: 0.15, eletroportatil: 0.15, organizacao: 0.10, eletro_grande: 0.04 };
const COTA_MAE: Record<string, number> = { cabelo: 0.25, pele: 0.20, corpo_perfume: 0.20, bem_estar: 0.15, maquiagem: 0.12, aparelho: 0.08 };
const MARCA_CASA = /tramontina|brinox|oikos|marinex|electrolux|brastemp|consul|philco|mondial|arno|oster|brit[aâ]nia|walita|philips|wap\b|midea|samsung|\blg\b|black.?decker|cadence|karsten|buddemeyer|santista|altenburg|teka|emma|tok ?& ?stok|stanley|lyor|oxford|rochedo|panelux|tupperware|electrolux|omo\b|yp[eê]|downy|comfort|vanish|veja\b|brilhante|ariel|neve\b|lysoform|cif\b|scott|kitchenaid|nespresso|dolce gusto|tres cora|mallory|gallant|hamilton beach|ordene|plasutil|sanremo|coza|polishop/i;
const MARCA_BELEZA = /natura|botic[aá]rio|eudora|\bo\.u\.i\b|oc[eé]ane|granado|l.?occitane|lor[eé]al|elseve|pantene|wella|k[eé]rastase|redken|joico|lola|salon line|truss|siage|inoar|tresemm[eé]|cadiveu|bra[eé]\b|nivea|dove|neutrogena|cetaphil|la roche|vichy|cerave|bioderma|eucerin|principia|sallve|creamy|episol|isdin|bio.?oil|ruby rose|vult|maybelline|max love|mari maria|bruna tavares|boca rosa|philips|taiff|brit[aâ]nia|mondial|cadence|gama|oral.?b|vitafor|growth|integralmedica|max titanium|dux\b|essential nutrition|sanavita|verisol|nestl[eé]|tr[eê]s cora|melitta|nescaf[eé]/i;
const ehEletroGrandeBom = (o: { title?: string | null; price_current?: number | null; price_original?: number | null; discount_pct?: number | null }) => {
  const d = o.discount_pct ?? (o.price_original && o.price_current ? Math.round((1 - o.price_current / o.price_original) * 100) : 0);
  return d >= 25;
};
const META_ML = 0.45;
const META_AMAZON = 0.33;
// 20/Nov: Magalu entra nas Maternas (vitrine da Day, link sem API). Só aparece depois que o Chrome leu foto e preço.
const META_MAGALU = 0.10;
// 25/Nov (Bruno: "pode colocar Magalu para rodar novamente nos grupos de ofertas mas coloca nos grupos de lar"):
// no grupo do Lar a Magalu vira 30% (era o que a equipe postava de Magalu: lavanderia, cozinha, casa).
const PERFIL_LAR = "9b2a012e-4d44-41b3-8f1c-896c55c57d18";
const metaMagalu = (perfil: string | null) => (perfil === PERFIL_LAR ? 0.30 : META_MAGALU);
const CANAL_REF = "@promocaozinha"; // canal do Telegram mais parecido com o grupo real
const CANAL_FRESCO_MS = 6 * 3600_000; // item do canal vale se chegou nas últimas 6h (canal parado → cai nos coletores)
const isFralda = (t: string | null) => /\bfralda/i.test(t || "");
/** código do produto na loja (ASIN / item Shopee / MLB) — o mesmo produto vem com nome diferente do Telegram e do coletor */
const idProduto = (url: string | null | undefined): string | null => {
  const u = url || "";
  const m = u.match(/\/dp\/([A-Z0-9]{10})/) || u.match(/shopee\.com\.br\/(?:product\/\d+\/|.*-i\.\d+\.)(\d+)/) || u.match(/(MLBU?-?\d{6,})/i);
  return m ? m[1].replace("-", "").toUpperCase() : null;
};
const chaveProduto = (t: string | null) => (t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim().slice(0, 40);

interface Cand {
  id: string; title: string | null; platform: string | null; source: string;
  kind?: string | null; url?: string | null; discount_pct?: number | null; price_current?: number | null; price_original?: number | null;
  coupon_code?: string | null;
  extra_text?: string | null; promo_meta?: Record<string, unknown> | null;
  geek?: boolean;
}

// 11/11 (Bruno, via Mr. Ocean 10/Nov: "não postar nada no Brunotropolis"; o que serve pro público das mães vai pras
// Maternas). Do Geek só entra casa, cozinha, eletrônico de uso e utilidade; nada de game, colecionável ou cultura pop.
// No máximo 1 a cada 4 posts da geral das Maternas. Só no dia; no 12 volta sozinho.
const PERFIL_MATERNAS = "8e8332fa-ebd8-41d5-948f-21bb6cd27a97";
const PERFIL_GEEK = "f3887ae2-7b2c-462b-8984-e1e6618a0ba6";
const GEEK_SERVE_MAE = /air ?fryer|fritadeira|panela|liquidificador|cafeteira|chaleira|sanduicheira|batedeira|mixer|processador de alimento|forno|micro-?ondas|aspirador|\bmop\b|ventilador|umidificador|purificador|ferro de passar|vaporizador|secador|chapinha|escova (de dentes|alisadora|secadora)|l[âa]mpada|tomada inteligente|smart plug|plugue|echo (dot|pop|show|spot)|alexa|kindle|power ?bank|carregador|fone|earbuds?|smartwatch|rel[óo]gio inteligente|smart ?band|c[âa]mera de seguran|c[âa]mera wi-?fi|bab[áa] eletr|organizador|garrafa t[ée]rmica|copo t[ée]rmico|toalha|len[çc]ol|travesseiro|edredom|cobertor|balan[çc]a|term[ôo]metro|fita led|luminária|alimentador autom|smart tv|tv \d|tablet|celular|smartphone|caixa de som/i;
// brinquedo fora do Brunotropolis (25/Nov): palavra brinquedo, faixa etária de criança (5Y+, 3+ anos), marcas de brinquedo infantil
const BRINQUEDO_GEEK = /brinquedo|\b\d{1,2} ?y\+|\b\d{1,2}\+ ?anos|\bhot ?wheels\b|\bpista\b|boneca|barbie|pel[uú]cia|playmobil|\bnerf\b|massinha|play-?doh|fisher.?price|patrulha canina|infantil|\bkids\b|\bcrian[cç]a/i;
const GEEK_SO_GEEK_RE = /gamer|gaming|monitor gamer|light ?bar|retrovisor|espelho/i;
const GEEK_SO_GEEK = /gamer|gaming|\bgame|jogo|playstation|\bps[45]\b|xbox|nintendo|switch|controle|funko|estatueta|colecion|figura|action figure|star wars|marvel|\bdc\b|batman|homem[- ]aranha|spider|harry potter|hogwarts|mario|pok[ée]mon|anime|mang[áa]|lego|groot|dragon|mouse|teclado|headset|monitor|ssd|hd externo|placa de v|hub usb|hdmi|suporte|caneca|geek|nerd|programador/i;
const geekServeMae = (t: string | null) => !!t && GEEK_SERVE_MAE.test(t) && !GEEK_SO_GEEK.test(t);
const META_GEEK_1111 = 0.25;

// ── Data dupla (10/10, 11/11…): dia de mais venda (ML 2–3,5x nas duplas 7/7, 8/8, 9/9). Decisão Bruno 10/Out:
// puxa de TODOS os canais do Telegram (os que postam primeiro de manhã) alternando com os nossos coletores,
// maior desconto primeiro nos dois, + cupons de loja.
const META_CUPOM_DUPLA = 0.25;
// 26/Out (Bruno: "pela manhã, aumente as postagens de cupons no grupo do ofertas"): post de CUPOM volta pros
// 170 grupos em dia normal (no manual ~41% dos posts levavam cupom). Manhã 8h–11h = 40% dos posts; resto do dia 20%.
// Mesma régua do grupo de Cupons (código limpo, fresco 3h, sem repetir código no dia, mata o ESGOTADO).
// 31/Out (Bruno: "vamos diminuir os cupons, coloca concentrado pela manhã"): saíam 29% de posts só de cupom
// (20 de 70; equipe ~3%). Tarde sem post de cupom na Maternas; a antecipação também só vale até 11h na Maternas.
const META_CUPOM_MANHA = 0.40;
const META_CUPOM_DIA = 0;
// 29/Out (Bruno: "faz"): mapa manual × automático (grupo #1, 20/08–09/10 × 17–28/10) mostrou que o manual
// (1) repostava os campeões de venda da Amazon (Bepantol, Huggies, Pampers, Granado… até 11x em 51 dias) e
// (2) vendia produto caro de bebê no ML (babá eletrônica, cadeira de carro, carrinho, berço = 31% da comissão ML),
// que o "até R$60 primeiro" empurrava pro fim. Campeão = offers.campeao (Amazon Refresh mantém o preço do dia).
// 29/Out (Tio Patinhas, Bruno: "pode mandar ver"): lista foi de 19 pra 35 campeões e passa a valer também no
// fim de semana (com 19 só chegava a ~12% dos posts; o manual repetia em mais da metade dos posts de Amazon).
const META_CAMPEAO = 0.20;
const CAMPEAO_INTERVALO_MS = 1 * 86400_000; // o mesmo campeão no máx. 1x por dia (era 3 dias até 12/11, Tio Patinhas: saía ~4% contra meta de 20%)
const CAMPEAO_PRECO_FRESCO_MS = 6 * 3600_000; // Amazon: só reposta com preço conferido nas últimas 6h
const META_ML_CARO = 0.12;
const BEBE_CARO = /cadeira (de|para) (carro|auto)|cadeirinha|beb[eê] conforto|bab[aá] eletr|carrinho de beb|carrinho (de )?passeio|ber[çc]o|banheira|cercadinho|andador|canguru|monitor/i;
const ehMlCaro = (o: Cand) => o.platform === "ml" && BEBE_CARO.test(o.title || "") && (o.price_current ?? 0) >= 100;
function ehDataDupla(): boolean {
  const brt = new Date(Date.now() - 3 * 3600_000);
  return brt.getUTCDate() === brt.getUTCMonth() + 1;
}
const desconto = (o: Cand) =>
  o.price_original && o.price_current && o.price_original > o.price_current
    ? Math.round(100 * (1 - o.price_current / o.price_original)) : 0;

/**
 * Escolhe as próximas ofertas do automático puxando o mix pra meta do dia:
 *   fralda abaixo de 35% → fralda; Amazon abaixo de 45% → Amazon; senão o mais novo dos coletores.
 *   Pra fralda/Amazon, prefere o @promocaozinha (fresco, últimas 6h); sem item dele, usa os coletores.
 *   Nunca repete o mesmo produto no mesmo dia.
 */
async function escolherOfertas(db: DB, c: AutoCampaign, n: number, dayStart: string): Promise<Cand[]> {
  // o que o automático já pôs hoje (publicado + na fila)
  const { data: hoje } = await db
    .from("publication_queue")
    .select("offer:offers(title, platform, kind, source, url, campeao, price_current, perfil_id)")
    .is("created_by", null)
    .contains("campaign_ids", [c.id])
    .gte("created_at", dayStart)
    .limit(500);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const feitos = ((hoje ?? []) as any[]).map((r) => r.offer).filter(Boolean) as { title: string | null; platform: string | null; kind?: string | null; source?: string | null; url?: string | null; campeao?: boolean; price_current?: number | null }[];
  let total = feitos.length;
  let nCampeoes = feitos.filter((o) => o.campeao).length;
  let nMlCaro = feitos.filter((o) => ehMlCaro(o as Cand)).length;
  let fraldas = feitos.filter((o) => isFralda(o.title)).length;
  let amazons = feitos.filter((o) => o.platform === "amazon").length;
  let mls = feitos.filter((o) => o.platform === "ml").length;
  let shopees = feitos.filter((o) => o.platform === "shopee").length;
  let magalus = feitos.filter((o) => o.platform === "magalu").length;
  let nSaude = feitos.filter((o) => SAUDE.test(o.title || "")).length;
  let nLenco = feitos.filter((o) => LENCO.test(o.title || "")).length;
  let nAmamenta = feitos.filter((o) => AMAMENTA.test(o.title || "")).length;
  let nBrinq = feitos.filter((o) => BRINQUEDO.test(o.title || "")).length;
  let nGadget = feitos.filter((o) => ehGadget(o.title)).length;
  let nEquip = feitos.filter((o) => ehEquip(o)).length;
  const tiposEquip = new Map<string, number>();
  feitos.filter((o) => ehEquip(o)).forEach((o) => { const k = tipoEquip(o.title); tiposEquip.set(k, (tiposEquip.get(k) ?? 0) + 1); });
  const equipVaria = (x: Cand) => (tiposEquip.get(tipoEquip(x.title)) ?? 0) < 2; // no máx. 2 do mesmo tipo por dia antes de repetir
  let nNatura = feitos.filter((o) => ehNatura(o)).length;
  let nAlimenta = feitos.filter((o) => ALIMENTA.test(o.title || "")).length;
  let nSaudeApar = feitos.filter((o) => SAUDE_APAR.test(o.title || "")).length;
  const maternas = c.perfil_id === PERFIL_MATERNAS;
  // 26/Nov (Bruno: "quero a segunda opção, mas quero por campanha"): categorias, cotas, tetos, marcas e filtros vêm de
  // campaigns.regras (aba Regras no painel). Antes ficavam fixos aqui (COTA_LAR, COTA_MAE, META_EQUIP...).
  const R: RegrasCampanha | null = lerRegras(c.regras);
  const nCat = new Map<string, number>();
  const nTipo = new Map<string, number>();
  const contaCat = (o: { title?: string | null; url?: string | null; affiliate_url?: string | null }) => {
    if (!R) return; const k = categoriaDe(R, o); if (!k) return;
    nCat.set(k.nome, (nCat.get(k.nome) ?? 0) + 1);
    if (k.variar) { const tp = k.nome + ":" + (palavraQueCasou(k.palavras, o.title) ?? ""); nTipo.set(tp, (nTipo.get(tp) ?? 0) + 1); }
  };
  feitos.forEach(contaCat);
  const tiposGadget = new Set(feitos.filter((o) => ehGadget(o.title)).map((o) => tipoGadget(o.title)));
  // 11/11: Shopee paga comissão extra de 6% até 12/11 (API shopeeOfferV2, Mãe e Bebê incluso) → 1/3 dos produtos
  const metaShopee1111 = ehDia1111() && c.perfil_id === PERFIL_MATERNAS ? 0.33 : 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let nGeek = feitos.filter((o: any) => o.perfil_id === PERFIL_GEEK).length;
  const usados = new Set(feitos.map((o) => chaveProduto(o.title)));
  const idsUsados = new Set(feitos.map((o) => idProduto(o.url)).filter(Boolean) as string[]);
  const jaFoi = (o: Cand) => usados.has(chaveProduto(o.title)) || (!!idProduto(o.url) && idsUsados.has(idProduto(o.url)!));

  const dupla = ehDataDupla();
  // 26/Nov: extra_text e promo_meta entram pra lista de bloqueio e venda internacional (bloqueados.ts)
  const campos = "id, title, platform, source, kind, url, discount_pct, price_current, price_original, coupon_code, extra_text, promo_meta";
  const bloqueios = await carregarBloqueios(db);
  const base = () => db.from("offers").select(campos).eq("perfil_id", c.perfil_id!).eq("status", "draft")
    .eq("kind", "produto").not("image_url", "is", null).not("affiliate_url", "is", null);
  const fresco = new Date(Date.now() - CANAL_FRESCO_MS).toISOString();
  let qCanal = base().eq("source", "telegram").gte("created_at", fresco);
  // 22/Out: todos os canais do Telegram (já passaram pelo filtro de nicho), não só o @promocaozinha
  void CANAL_REF;
  const [{ data: canal }, { data: coletores }, { data: cupons }] = await Promise.all([
    qCanal.order("created_at", { ascending: false }).limit(300),
    base().eq("source", "auto")
      .gte("created_at", new Date(Date.now() - 48 * 3600_000).toISOString())
      .order("created_at", { ascending: false }).limit(300),
    dupla
      ? db.from("offers").select(campos).eq("perfil_id", c.perfil_id!).eq("status", "draft").eq("kind", "cupom")
          .eq("source", "telegram").not("affiliate_url", "is", null).gte("created_at", fresco)
          .order("created_at", { ascending: false }).limit(100)
      : Promise.resolve({ data: [] }),
  ]);
  // dia normal: do canal só entram fralda e Amazon (o resto segue na curadoria manual).
  // data dupla: todo produto fresco do Telegram entra, maior desconto primeiro.
  // dia normal (22/Out): o que o manual fazia — com cupom e mais barato (até R$60) na frente, depois o mais novo
  const pref = (o: Cand) => (o.coupon_code ? 2 : 0) + (o.price_current != null && o.price_current <= 60 ? 1 : 0);
  const ordenar = (l: Cand[]) => (dupla ? l.sort((a, b) => desconto(b) - desconto(a)) : l.sort((a, b) => pref(b) - pref(a)));
  const poolCanal = ordenar((canal ?? []) as Cand[]);
  const poolCol = ordenar((coletores ?? []) as Cand[]);
  if (ehDia1111() && c.perfil_id === PERFIL_MATERNAS) {
    const { data: doGeek } = await db.from("offers").select(campos).eq("perfil_id", PERFIL_GEEK).eq("status", "draft")
      .eq("kind", "produto").not("image_url", "is", null).not("affiliate_url", "is", null).in("source", ["auto", "telegram"])
      .gte("created_at", new Date(Date.now() - 36 * 3600_000).toISOString()).order("created_at", { ascending: false }).limit(400);
    const serve = ((doGeek ?? []) as Cand[]).filter((o) => geekServeMae(o.title)).map((o) => ({ ...o, geek: true }));
    poolCol.push(...ordenar(serve));
  }
  // gadget do Geek (todo dia, só pro posto de eletro/gadget; não entra no resto do mix)
  const poolGadgetGeek: Cand[] = [];
  if (c.perfil_id === PERFIL_MATERNAS) {
    const { data: gk } = await db.from("offers").select(campos).eq("perfil_id", PERFIL_GEEK).eq("status", "draft")
      .eq("kind", "produto").not("image_url", "is", null).not("affiliate_url", "is", null).in("source", ["auto", "telegram"])
      .gte("created_at", new Date(Date.now() - 48 * 3600_000).toISOString()).order("created_at", { ascending: false }).limit(400);
    poolGadgetGeek.push(...((gk ?? []) as Cand[]).filter((o) => geekServeMae(o.title) && ehGadget(o.title)).map((o) => ({ ...o, geek: true })));
  }
  let nTele = feitos.filter((o) => o.source === "telegram").length;
  let nAuto = feitos.filter((o) => o.source === "auto").length;
  const poolCupom = (cupons ?? []) as Cand[];
  if (!dupla) {
    const ids = await escolherPorCategoria(db, "cupons", c, n, dayStart);
    for (const id of ids) poolCupom.push({ id, kind: "cupom", title: null, platform: null, source: "telegram" });
  }
  // campeões: todo dia, fora do intervalo de 1 dia, não esgotado; Amazon só com preço conferido há pouco.
  // O que saiu há mais tempo vai primeiro.
  const poolCampeao: Cand[] = [];
  if (!dupla) {
    const { data: camps } = await db.from("offers").select(campos).eq("perfil_id", c.perfil_id!).eq("campeao", true)
      .in("status", ["draft", "published"]).not("image_url", "is", null).not("affiliate_url", "is", null).limit(200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vivos = ((camps ?? []) as any[]).filter((o) => !o.promo_meta?.esgotado && (o.platform !== "amazon"
      || Date.now() - new Date(o.promo_meta?.checked_at ?? 0).getTime() < CAMPEAO_PRECO_FRESCO_MS));
    if (vivos.length) {
      const { data: ult } = await db.from("publication_queue").select("offer_id, created_at")
        .in("offer_id", vivos.map((o) => o.id)).contains("campaign_ids", [c.id])
        .gte("created_at", new Date(Date.now() - 30 * 86400_000).toISOString()).limit(2000);
      const ultima = new Map<string, number>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const r of (ult ?? []) as any[]) ultima.set(r.offer_id, Math.max(ultima.get(r.offer_id) ?? 0, new Date(r.created_at).getTime()));
      poolCampeao.push(...vivos.filter((o) => Date.now() - (ultima.get(o.id) ?? 0) >= CAMPEAO_INTERVALO_MS)
        .sort((a, b) => (ultima.get(a.id) ?? 0) - (ultima.get(b.id) ?? 0)));
    }
  }
  const metaCupom = dupla ? META_CUPOM_DUPLA : brtHour() < 11 ? META_CUPOM_MANHA : META_CUPOM_DIA;
  let nCupons = feitos.filter((o) => o.kind === "cupom").length;

  const escolhidos: Cand[] = [];
  // tetos da geral (12/Nov): fralda fraca nunca; fralda forte até 15%; amamentação até 6%; brinquedo até 4%
  const permitido = (o: Cand) => {
    const t = Math.max(total, 1); const tt = o.title || "";
    // 25/Nov (Bruno: "no brunotropolis quero que não poste brinquedos", depois de sair pista Hot Wheels F1 5Y+)
    if (c.perfil_id === PERFIL_GEEK && BRINQUEDO_GEEK.test(tt)) return false;
    // 25/Nov (Bruno: "aplica a correção em tudo"): regra única do perfil, igual nos grupos e canais (regras-perfil.ts)
    if (o.kind !== "cupom" && foraDoPerfil(c.perfil_id, tt)) return false;
    // 26/Nov (Bruno): lista de bloqueio do painel + nada de venda internacional
    if (o.kind !== "cupom" && motivoBloqueio(bloqueios, c.perfil_id, o)) return false;
    if (isFralda(tt) && (!FRALDA_BOA.test(tt) || fraldas / t >= TETO_FRALDA)) return false;
    if (AMAMENTA.test(tt) && !ehGadget(tt) && nAmamenta / t >= TETO_AMAMENTA) return false;
    if (BRINQUEDO.test(tt) && nBrinq / t >= TETO_BRINQUEDO) return false;
    // 26/Nov: no Mãe, sem marca conhecida abaixo de R$ 20 fica de fora (pincel descartável, pomada sem marca...)
    if (R && o.kind !== "cupom") {
      if (foraDasRegras(R, o)) return false; // palavras proibidas, lojas permitidas, só marcas boas
      const cat = categoriaDe(R, o);
      if (R.so_categorias && !cat) return false;
      if (cat?.teto != null && (nCat.get(cat.nome) ?? 0) / t >= cat.teto / 100) return false;
      const preco = o.price_current ?? 0, marca = temMarca(R, tt);
      if (R.sem_marca_abaixo_de != null && preco < R.sem_marca_abaixo_de && !marca) return false;
      if (o.platform === "shopee") {
        if (R.teto_shopee != null && shopees / t >= R.teto_shopee / 100) return false;
        if (R.shopee_generico_abaixo_de != null && preco < R.shopee_generico_abaixo_de && !marca) {
          const pm = (o.promo_meta ?? {}) as Record<string, unknown>;
          if (!(Number(pm.rating ?? 0) >= 4.8 && vendidosNum(pm.vendidos) >= 1000)) return false;
        }
      }
    }
    if (o.platform === "magalu" && !magaluFresca.has(skuMagalu(o) ?? "")) return false;
    return true;
  };
  // 25/Nov: Magalu só entra com leitura do Chrome fresca (o dispatcher recusa leitura de mais de 12h e o post se
  // perde); as que faltam ganham pedido de leitura (15 por rodada) e entram nas próximas rodadas.
  const skuMagalu = (o: Cand) => caminhoDaUrl(o.url ?? "")?.sku ?? null;
  const magaluFresca = new Set<string>();
  const candMagalu = [...poolCanal, ...poolCol].filter((o) => o.platform === "magalu");
  if (candMagalu.length) {
    const skus = [...new Set(candMagalu.map(skuMagalu).filter(Boolean))] as string[];
    const { data: lidas } = await db.from("magalu_produtos").select("sku, disponivel")
      .in("sku", skus.slice(0, 300)).eq("status", "ok").gte("lido_em", new Date(Date.now() - 10 * 3600_000).toISOString());
    for (const l of (lidas ?? []) as { sku: string; disponivel: boolean | null }[]) if (l.disponivel !== false) magaluFresca.add(l.sku);
    for (const o of candMagalu.filter((x) => !magaluFresca.has(skuMagalu(x) ?? "")).slice(0, 15)) {
      const cm = caminhoDaUrl(o.url ?? "");
      if (cm) await pedirLeituraMagalu(db, cm.sku, cm.caminho);
    }
  }
  const pega = (pred: (o: Cand) => boolean): Cand | null => {
    // data dupla: alterna Telegram e coletores (quem tem menos posts hoje vai primeiro)
    const ordem = dupla && nAuto < nTele ? [poolCol, poolCanal] : [poolCanal, poolCol];
    for (const pool of ordem) {
      const geekCheio = nGeek / Math.max(total, 1) >= META_GEEK_1111;
      const i = pool.findIndex((o) => pred(o) && permitido(o) && !jaFoi(o) && !(o.geek && geekCheio));
      if (i >= 0) return pool.splice(i, 1)[0];
    }
    return null;
  };
  for (let k = 0; k < n; k++) {
    const t = Math.max(total, 1);
    let o: Cand | null = null;
    if (nCupons / t < metaCupom) {
      const i = poolCupom.findIndex((x) => x.title == null || !jaFoi(x));
      if (i >= 0) { o = poolCupom.splice(i, 1)[0]; nCupons++; }
    }
    if (!o && poolCampeao.length && nCampeoes / t < META_CAMPEAO) {
      const i = poolCampeao.findIndex((x) => !jaFoi(x) && permitido(x)); // 12/Nov: teto de fralda vale pro campeão também
      if (i >= 0) { o = poolCampeao.splice(i, 1)[0]; nCampeoes++; }
    }
    if (!o && nGadget < Math.ceil(t / GADGET_A_CADA)) {
      // tipo novo primeiro (Maternas, depois Geek); só repete tipo se não tiver nenhum outro
      const novo = (x: Cand) => ehGadget(x.title) && !tiposGadget.has(tipoGadget(x.title));
      o = pega(novo);
      if (!o) { const i = poolGadgetGeek.findIndex((x) => !jaFoi(x) && novo(x)); if (i >= 0) o = poolGadgetGeek.splice(i, 1)[0]; }
      if (!o) o = pega((x) => ehGadget(x.title));
      if (!o) { const i = poolGadgetGeek.findIndex((x) => !jaFoi(x)); if (i >= 0) o = poolGadgetGeek.splice(i, 1)[0]; }
      if (o) tiposGadget.add(tipoGadget(o.title));
    }
    if (!o && R) {
      // categoria mais atrasada na cota primeiro; dentro dela, faixa de preço, desconto mínimo, marca e variação
      const ordem = R.categorias.filter((k) => k.meta > 0).map((k) => [k, (nCat.get(k.nome) ?? 0) / t - k.meta / 100] as [CategoriaRegra, number]).filter(([, d]) => d < 0).sort((a, b) => a[1] - b[1]);
      for (const [k] of ordem) {
        const daCat = (x: Cand) => {
          if (categoriaDe(R, x)?.nome !== k.nome) return false;
          const p = x.price_current ?? 0;
          if (k.preco_min != null && p < k.preco_min) return false;
          if (k.preco_max != null && p > k.preco_max) return false;
          if (k.desconto_min != null) { const d = x.discount_pct ?? (x.price_original && p ? Math.round((1 - p / x.price_original) * 100) : 0); if (d < k.desconto_min) return false; }
          if (k.so_marca && !temMarca(R, x.title)) return false;
          if (k.variar && (nTipo.get(k.nome + ":" + (palavraQueCasou(k.palavras, x.title) ?? "")) ?? 0) >= 2) return false;
          return true;
        };
        o = (k.marca_primeiro || k.so_marca ? pega((x) => daCat(x) && temMarca(R, x.title)) : null) ?? (k.so_marca ? null : pega(daCat));
        if (o) break;
      }
    }
    if (!o && fraldas / t < META_FRALDA) o = pega((x) => isFralda(x.title));
    if (!o && nSaude / t < META_SAUDE) o = pega((x) => SAUDE.test(x.title || ""));
    if (!o && nLenco / t < META_LENCO) o = pega((x) => LENCO.test(x.title || ""));
    if (!o && shopees / t < metaShopee1111) o = pega((x) => x.platform === "shopee");
    if (!o && magalus / t < metaMagalu(c.perfil_id)) o = pega((x) => x.platform === "magalu");
    if (!o && mls / t < META_ML && nMlCaro / t < META_ML_CARO) o = pega(ehMlCaro);
    if (!o && mls / t < META_ML) o = pega((x) => x.platform === "ml");
    if (!o && amazons / t < META_AMAZON) o = pega((x) => x.platform === "amazon");
    if (!o) {
      if (dupla) o = pega(() => true); // canal (maior desconto) antes dos coletores
      else o = pega((x) => x.platform !== "amazon" && x.platform !== "ml") ?? pega(() => true); // o resto: Shopee
    }
    if (!o) break;
    escolhidos.push(o);
    usados.add(chaveProduto(o.title));
    const pid = idProduto(o.url);
    if (pid) idsUsados.add(pid);
    if (o.source === "telegram") nTele++; else if (o.source === "auto") nAuto++;
    { const tt = o.title || ""; if (SAUDE.test(tt)) nSaude++; if (LENCO.test(tt)) nLenco++; if (AMAMENTA.test(tt)) nAmamenta++; if (BRINQUEDO.test(tt)) nBrinq++; if (ehGadget(tt)) nGadget++; contaCat(o); if (ehEquip(o)) { nEquip++; const k = tipoEquip(o.title); tiposEquip.set(k, (tiposEquip.get(k) ?? 0) + 1); } if (ehNatura(o)) nNatura++; if (ALIMENTA.test(tt)) nAlimenta++; if (SAUDE_APAR.test(tt)) nSaudeApar++; }
    total++; if (isFralda(o.title)) fraldas++; if (o.platform === "amazon") amazons++; if (o.platform === "ml") mls++; if (o.platform === "shopee") shopees++; if (o.platform === "magalu") magalus++;
    if (ehMlCaro(o)) nMlCaro++;
    if (o.geek) nGeek++;
  }
  return escolhidos;
}

// ── Ofertas exclusivas (09/Nov) ──────────────────────────────────────────────────────────────────────────
// promo_meta.exclusiva = { inicio, fim, preco_promo, fonte }. Só posta dentro da janela (inicio ≤ agora < fim − 30 min).
// Amazon: só depois que o Amazon Refresh conferiu o preço já dentro da janela e ele bate com o da promoção (+5%).
// Teto por campanha/dia: Ofertas Maternas 10, Buscador Geek 15 (Bruno, 09/Nov). Entre uma exclusiva e outra, 20 min.
// 11/11 (Bruno: "das 6 da manhã até meia-noite", muita oferta e cupom): janela 6h–24h, teto do dia em dobro na
// geral e nos cupons, e o dobro de exclusivas. Só nesse dia; no 12 volta sozinho.
export { PERFIL_GEEK };
export function ehDia1111(): boolean {
  const brt = new Date(Date.now() - 3 * 3600_000);
  return brt.getUTCMonth() === 10 && brt.getUTCDate() === 11;
}
// 25/Nov (planilha Hot Deals BF nos 4 perfis): fora das Maternas o teto vira ~30% do teto do grupo, até 15
// (Lar/Mãe 40/dia → 12; Brunotropolis Ofertas 20 → 6; Brunotropolis Canal 4 → 1), pra exclusiva não tomar o grupo pequeno.
const EXCLUSIVA_TETO = (c: AutoCampaign) => (c.perfil_id === PERFIL_MATERNAS ? (ehDia1111() ? 25 : 10) : Math.max(1, Math.min(15, Math.round(c.auto_daily_cap * 0.3))));
const EXCLUSIVA_GAP_MS = 20 * 60_000;
const EXCLUSIVA_FIM_MARGEM_MS = 30 * 60_000;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function exclusivaNoAr(o: any, agora = Date.now()): boolean {
  const ex = o?.promo_meta?.exclusiva;
  if (!ex) return false;
  const ini = ex.inicio ? new Date(ex.inicio).getTime() : 0;
  const fim = ex.fim ? new Date(ex.fim).getTime() : Infinity;
  if (!(agora >= ini && agora < fim - EXCLUSIVA_FIM_MARGEM_MS)) return false;
  if (o.promo_meta?.esgotado) return false;
  if (o.platform === "amazon" && ex.preco_promo) {
    const conferido = new Date(o.promo_meta?.checked_at ?? 0).getTime();
    if (!(conferido >= ini && agora - conferido < 3 * 3600_000)) return false; // preço conferido já dentro da janela
    if (o.price_current == null || o.price_current > ex.preco_promo * 1.05) return false; // promoção ainda não está no ar
  }
  return true;
}

async function furarComExclusiva(db: DB, c: AutoCampaign, dayStart: string): Promise<string> {
  const { data: hoje } = await db
    .from("publication_queue")
    .select("status, created_at, offer:offers(url, title, promo_meta)")
    .contains("campaign_ids", [c.id])
    .gte("created_at", dayStart)
    .limit(500);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ex = ((hoje ?? []) as any[]).filter((r) => r.offer?.promo_meta?.exclusiva);
  if (ex.some((r) => r.status === "pending" || r.status === "publishing")) return "ja tem exclusiva na fila";
  if (ex.length >= EXCLUSIVA_TETO(c)) return "teto de exclusivas";
  const ultima = Math.max(0, ...ex.map((r) => new Date(r.created_at).getTime()));
  if (Date.now() - ultima < EXCLUSIVA_GAP_MS) return "intervalo";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const feitos = ((hoje ?? []) as any[]).map((r) => r.offer).filter(Boolean);
  const ids = new Set(feitos.map((o) => idProduto(o.url)).filter(Boolean));
  const nomes = new Set(feitos.map((o) => chaveProduto(o.title)));

  const { data: cands } = await db.from("offers")
    .select("id, title, url, platform, price_current, price_original, promo_meta, extra_text")
    .eq("perfil_id", c.perfil_id!).eq("status", "draft").eq("kind", "produto")
    .not("image_url", "is", null).not("affiliate_url", "is", null)
    .not("promo_meta->exclusiva", "is", null)
    .limit(1000);
  const agora = Date.now();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bloqueios = await carregarBloqueios(db);
  const regrasEx = lerRegras(c.regras);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  // 26/Nov: exclusiva também respeita a regra do perfil e, nas Maternas, só fralda de marca forte (saiu Pom Pom como exclusiva)
  const vivos = ((cands ?? []) as any[]).filter((o) => exclusivaNoAr(o, agora) && !motivoBloqueio(bloqueios, c.perfil_id, o)
    && !foraDoPerfil(c.perfil_id, o.title) && !(c.perfil_id === PERFIL_MATERNAS && isFralda(o.title) && !FRALDA_BOA.test(o.title || ""))
    && !(regrasEx?.so_categorias && !categoriaDe(regrasEx, o))
    && !(idProduto(o.url) && ids.has(idProduto(o.url))) && !nomes.has(chaveProduto(o.title)));
  if (!vivos.length) return "sem exclusiva no ar";
  // janela recém-aberta primeiro (é a "antecipada"), depois maior desconto
  const recem = (o: { promo_meta: { exclusiva: { inicio?: string } } }) => agora - new Date(o.promo_meta.exclusiva.inicio ?? 0).getTime() < 3 * 3600_000 ? 1 : 0;
  vivos.sort((a, b) => recem(b) - recem(a) || desconto(b) - desconto(a));
  const o = vivos[0];
  const { data: primeiro } = await db.from("publication_queue").select("position")
    .in("status", ["pending", "publishing"]).order("position", { ascending: true }).limit(1).maybeSingle();
  const pos = ((primeiro?.position ?? 1) as number) - 1;
  const { error } = await db.from("publication_queue").insert({ offer_id: o.id, campaign_ids: [c.id], position: pos, status: "pending", created_by: null });
  if (error) return `insert falhou: ${error.message}`;
  await db.from("offers").update({ status: "queued" }).eq("id", o.id);
  return "ok";
}

export async function autoEnqueueAll(db: DB): Promise<AutoEnqueueResult> {
  const result: AutoEnqueueResult = { campaigns_checked: 0, enqueued: 0, skipped: [] };

  const { data: campaigns } = await db
    .from("campaigns")
    .select("id, name, perfil_id, auto_daily_cap, auto_window_start, auto_window_end, auto_buffer, categoria, niche, regras")
    .eq("is_active", true)
    .eq("auto_enqueue", true);

  // fim de semana: a geral fica em no máx. 30/dia (31/Out) — ver lib/fim-de-semana.ts
  const camps = ((campaigns ?? []) as AutoCampaign[]).map((c) => comPlantao({ ...c, auto_daily_cap: tetoDoDia(c) }));
  result.campaigns_checked = camps.length;

  const hour = brtHour();
  const dayStart = brtDayStartUtcIso();

  for (const c of camps) {
    if (ehDia1111() && c.perfil_id === PERFIL_MATERNAS) {
      c.auto_window_start = Math.min(c.auto_window_start, 6);
      c.auto_window_end = 24;
      if (["geral", "cupons"].includes(c.categoria ?? "geral")) c.auto_daily_cap = c.auto_daily_cap * 2;
      // fila com folga pra ter produto comum entre cupom/eletro/exclusiva (Bruno 11/11: "mesclar com os produtos padrões")
      if ((c.categoria ?? "geral") === "geral") c.auto_buffer = Math.max(c.auto_buffer ?? 6, 4);
    }
    if (ehDia1111() && c.perfil_id === PERFIL_GEEK) {
      result.skipped.push({ campaign: c.name, reason: "11/11: Brunotropolis parado (Bruno)" });
      continue;
    }
    if (!c.perfil_id) {
      result.skipped.push({ campaign: c.name, reason: "sem perfil_id" });
      continue;
    }
    // Janela de horário (BRT)
    if (hour < c.auto_window_start || hour >= c.auto_window_end || emPausaPlantao(hour, c.perfil_id)) {
      result.skipped.push({ campaign: c.name, reason: `fora da janela (${hour}h BRT)` });
      continue;
    }

    // Teto do dia — só conta os automáticos (created_by null)
    const { count: autoToday } = await db
      .from("publication_queue")
      .select("id", { count: "exact", head: true })
      .eq("status", "published")
      .is("created_by", null)
      .contains("campaign_ids", [c.id])
      .gte("published_at", dayStart);
    if ((autoToday ?? 0) >= c.auto_daily_cap) {
      result.skipped.push({ campaign: c.name, reason: `teto atingido (${autoToday}/${c.auto_daily_cap})` });
      continue;
    }

    // Quantos itens automáticos já estão aguardando (lookahead atual).
    const { count: pendingAuto } = await db
      .from("publication_queue")
      .select("id", { count: "exact", head: true })
      .in("status", ["pending", "publishing"])
      .is("created_by", null)
      .contains("campaign_ids", [c.id])
      // 09/Nov: item agendado pro futuro (aviso do 11/11) não ocupa o buffer — travou as Maternas por ~50 min
      .or(`scheduled_at.is.null,scheduled_at.lte.${new Date().toISOString()}`);
    let pending = pendingAuto ?? 0;
    // 11/11 (Bruno: "mesclar com os produtos padrões"): na geral das Maternas o buffer conta só PRODUTO comum
    // (cupom fresco, exclusiva e eletro agendado furam a fila e enchiam o buffer — 9 cupons na fila, zero produto)
    let cuponsNaFila = 0;
    const maternasGeral1111 = ehDia1111() && c.perfil_id === PERFIL_MATERNAS && (c.categoria ?? "geral") === "geral";
    if (maternasGeral1111) {
      const { data: pend } = await db.from("publication_queue").select("scheduled_at, offer:offers(kind, promo_meta)")
        .in("status", ["pending", "publishing"]).is("created_by", null).contains("campaign_ids", [c.id]).limit(200);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const l = (pend ?? []) as any[];
      cuponsNaFila = l.filter((q) => q.offer?.kind === "cupom").length;
      pending = l.filter((q) => !q.scheduled_at && q.offer?.kind !== "cupom" && !q.offer?.promo_meta?.exclusiva).length;
    }
    const buffer = c.auto_buffer ?? 6;
    const today = autoToday ?? 0;

    // Enfileira até completar o buffer, sem furar o teto do dia:
    // (buffer - pendentes) limitado por (teto - publicados - pendentes).
    // Cupom com ANTECIPAÇÃO (27/Out, Bruno: "quero os cupons com antecipação, movimenta muito a conversão"):
    // cupom que chegou há ≤20 min fura a fila (entra na frente e sai no próximo post), mesmo com o buffer cheio.
    // Só Maternas (geral) e o grupo de Cupons; respeita o teto do dia; o mesmo código nunca sai 2x no dia.
    const cat0 = (c.categoria ?? "geral") as Categoria;
    // Maternas: só de manhã (31/Out); grupo de Cupons: o dia todo; data dupla segue com cupom o dia todo
    // 26/11 (Bruno: cupom da Amazon esgota muito rápido, priorizar): na geral, depois das 11h, cupom fresco da Amazon segue furando
    const cupomTodos = cat0 === "cupons" || (cat0 === "geral" && (brtHour() < 11 || ehDataDupla()));
    const cupomAgora = cupomTodos || cat0 === "geral";
    if (cupomAgora && today + pending < c.auto_daily_cap && !(maternasGeral1111 && cuponsNaFila >= 2)) {
      const ids = await escolherPorCategoria(db, "cupons", c, 2, dayStart);
      if (ids.length) {
        let fq = db.from("offers").select("id, created_at").in("id", ids)
          .gte("created_at", new Date(Date.now() - 20 * 60_000).toISOString());
        if (!cupomTodos) fq = fq.or("platform.eq.amazon,coupon_meta->>prioridade.eq.true"); // relâmpago Amazon e cupom Natura/Avon também
        const { data: frescos } = await fq;
        const { data: primeiro } = await db.from("publication_queue").select("position")
          .in("status", ["pending", "publishing"]).order("position", { ascending: true }).limit(1).maybeSingle();
        let frente = ((primeiro?.position ?? 1) as number) - 1;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const f of ((frescos ?? []) as any[]).slice(0, 1)) {
          const { error } = await db.from("publication_queue").insert({ offer_id: f.id, campaign_ids: [c.id], position: frente--, status: "pending", created_by: null });
          if (!error) {
            if (cat0 === "geral") await db.from("offers").update({ status: "queued" }).eq("id", f.id);
            result.enqueued++;
            result.skipped.push({ campaign: c.name, reason: "cupom fresco furou a fila" });
          }
        }
      }
    }

    // Oferta EXCLUSIVA (09/Nov, Bruno: "postadas rápidas e com chamada agressiva"): planilha da Amazon, comunidade
    // Amazon e canal de afiliados do ML. Fura a fila quando a janela dela abre, até o teto do dia por campanha.
    if (cat0 === "geral" && today + pending < c.auto_daily_cap) {
      const motivo = await furarComExclusiva(db, c, dayStart);
      if (motivo === "ok") {
        result.enqueued++;
        result.skipped.push({ campaign: c.name, reason: "exclusiva furou a fila" });
      }
    }

    const toEnqueue = Math.max(0, Math.min(buffer - pending, c.auto_daily_cap - today - pending));
    if (toEnqueue <= 0) {
      result.skipped.push({ campaign: c.name, reason: `buffer cheio (${pending} na fila, ${today}/${c.auto_daily_cap} hoje)` });
      continue;
    }

    // Campanha de categoria (fraldas/cupons/enxoval) escolhe pela regra dela — ver lib/auto-categorias.ts.
    // Geral: metas do mix (Amazon e fralda = melhor comissão) — ver escolherOfertas().
    const categoria = (c.categoria ?? "geral") as Categoria;
    const offers = categoria === "geral"
      ? await escolherOfertas(db, c, toEnqueue, dayStart)
      : (await escolherPorCategoria(db, categoria, c, toEnqueue, dayStart)).map((id) => ({ id }));
    if (!offers.length) {
      result.skipped.push({ campaign: c.name, reason: categoria === "geral" ? "sem draft pronto no perfil" : `sem oferta de ${categoria} agora` });
      continue;
    }

    // Próxima posição na fila.
    const { data: lastItem } = await db
      .from("publication_queue")
      .select("position")
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    let nextPosition = ((lastItem?.position ?? 0) as number) + 1;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const offer of offers as any[]) {
      const { error } = await db.from("publication_queue").insert({
        offer_id: offer.id,
        campaign_ids: [c.id],
        position: nextPosition++,
        status: "pending",
        created_by: null,
      });
      if (error) {
        result.skipped.push({ campaign: c.name, reason: `insert falhou: ${error.message}` });
        break;
      }
      // categoria não tira a oferta do pool do Ofertas Maternas (geral só pega status=draft)
      if (categoria === "geral") await db.from("offers").update({ status: "queued" }).eq("id", offer.id);
      result.enqueued++;
    }
  }

  return result;
}
