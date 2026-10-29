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
const META_FRALDA = 0.20;
const META_ML = 0.45;
const META_AMAZON = 0.33;
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
}

// ── Data dupla (10/10, 11/11…): dia de mais venda (ML 2–3,5x nas duplas 7/7, 8/8, 9/9). Decisão Bruno 10/Out:
// puxa de TODOS os canais do Telegram (os que postam primeiro de manhã) alternando com os nossos coletores,
// maior desconto primeiro nos dois, + cupons de loja.
const META_CUPOM_DUPLA = 0.25;
// 26/Out (Bruno: "pela manhã, aumente as postagens de cupons no grupo do ofertas"): post de CUPOM volta pros
// 170 grupos em dia normal (no manual ~41% dos posts levavam cupom). Manhã 8h–11h = 40% dos posts; resto do dia 20%.
// Mesma régua do grupo de Cupons (código limpo, fresco 3h, sem repetir código no dia, mata o ESGOTADO).
const META_CUPOM_MANHA = 0.40;
const META_CUPOM_DIA = 0.20;
// 29/Out (Bruno: "faz"): mapa manual × automático (grupo #1, 20/08–09/10 × 17–28/10) mostrou que o manual
// (1) repostava os campeões de venda da Amazon (Bepantol, Huggies, Pampers, Granado… até 11x em 51 dias) e
// (2) vendia produto caro de bebê no ML (babá eletrônica, cadeira de carro, carrinho, berço = 31% da comissão ML),
// que o "até R$60 primeiro" empurrava pro fim. Campeão = offers.campeao (Amazon Refresh mantém o preço do dia).
const META_CAMPEAO = 0.20; // só em dia útil (seg–sex), onde a venda do manual se concentrava
const CAMPEAO_INTERVALO_MS = 3 * 86400_000; // o mesmo campeão no máx. a cada 3 dias
const CAMPEAO_PRECO_FRESCO_MS = 6 * 3600_000; // Amazon: só reposta com preço conferido nas últimas 6h
const META_ML_CARO = 0.12;
const BEBE_CARO = /cadeira (de|para) (carro|auto)|cadeirinha|beb[eê] conforto|bab[aá] eletr|carrinho de beb|carrinho (de )?passeio|ber[çc]o|banheira|cercadinho|andador|canguru|monitor/i;
const ehMlCaro = (o: Cand) => o.platform === "ml" && BEBE_CARO.test(o.title || "") && (o.price_current ?? 0) >= 100;
function ehDiaUtil(): boolean {
  const dow = new Date(Date.now() - 3 * 3600_000).getUTCDay();
  return dow >= 1 && dow <= 5;
}
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
    .select("offer:offers(title, platform, kind, source, url, campeao, price_current)")
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
  const usados = new Set(feitos.map((o) => chaveProduto(o.title)));
  const idsUsados = new Set(feitos.map((o) => idProduto(o.url)).filter(Boolean) as string[]);
  const jaFoi = (o: Cand) => usados.has(chaveProduto(o.title)) || (!!idProduto(o.url) && idsUsados.has(idProduto(o.url)!));

  const dupla = ehDataDupla();
  const campos = "id, title, platform, source, kind, url, discount_pct, price_current, price_original, coupon_code";
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
  let nTele = feitos.filter((o) => o.source === "telegram").length;
  let nAuto = feitos.filter((o) => o.source === "auto").length;
  const poolCupom = (cupons ?? []) as Cand[];
  if (!dupla) {
    const ids = await escolherPorCategoria(db, "cupons", c, n, dayStart);
    for (const id of ids) poolCupom.push({ id, kind: "cupom", title: null, platform: null, source: "telegram" });
  }
  // campeões: dia útil, fora do intervalo de 3 dias, não esgotado; Amazon só com preço conferido há pouco.
  // O que saiu há mais tempo vai primeiro.
  const poolCampeao: Cand[] = [];
  if (ehDiaUtil() && !dupla) {
    const { data: camps } = await db.from("offers").select(campos + ", promo_meta").eq("perfil_id", c.perfil_id!).eq("campeao", true)
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
  const pega = (pred: (o: Cand) => boolean): Cand | null => {
    // data dupla: alterna Telegram e coletores (quem tem menos posts hoje vai primeiro)
    const ordem = dupla && nAuto < nTele ? [poolCol, poolCanal] : [poolCanal, poolCol];
    for (const pool of ordem) {
      const i = pool.findIndex((o) => pred(o) && !jaFoi(o));
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
      const i = poolCampeao.findIndex((x) => !jaFoi(x));
      if (i >= 0) { o = poolCampeao.splice(i, 1)[0]; nCampeoes++; }
    }
    if (!o && fraldas / t < META_FRALDA) o = pega((x) => isFralda(x.title));
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
    total++; if (isFralda(o.title)) fraldas++; if (o.platform === "amazon") amazons++; if (o.platform === "ml") mls++;
    if (ehMlCaro(o)) nMlCaro++;
  }
  return escolhidos;
}

export async function autoEnqueueAll(db: DB): Promise<AutoEnqueueResult> {
  const result: AutoEnqueueResult = { campaigns_checked: 0, enqueued: 0, skipped: [] };

  const { data: campaigns } = await db
    .from("campaigns")
    .select("id, name, perfil_id, auto_daily_cap, auto_window_start, auto_window_end, auto_buffer, categoria")
    .eq("is_active", true)
    .eq("auto_enqueue", true);

  const camps = (campaigns ?? []) as AutoCampaign[];
  result.campaigns_checked = camps.length;

  const hour = brtHour();
  const dayStart = brtDayStartUtcIso();

  for (const c of camps) {
    if (!c.perfil_id) {
      result.skipped.push({ campaign: c.name, reason: "sem perfil_id" });
      continue;
    }
    // Janela de horário (BRT)
    if (hour < c.auto_window_start || hour >= c.auto_window_end) {
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
      .contains("campaign_ids", [c.id]);
    const pending = pendingAuto ?? 0;
    const buffer = c.auto_buffer ?? 6;
    const today = autoToday ?? 0;

    // Enfileira até completar o buffer, sem furar o teto do dia:
    // (buffer - pendentes) limitado por (teto - publicados - pendentes).
    // Cupom com ANTECIPAÇÃO (27/Out, Bruno: "quero os cupons com antecipação, movimenta muito a conversão"):
    // cupom que chegou há ≤20 min fura a fila (entra na frente e sai no próximo post), mesmo com o buffer cheio.
    // Só Maternas (geral) e o grupo de Cupons; respeita o teto do dia; o mesmo código nunca sai 2x no dia.
    const cat0 = (c.categoria ?? "geral") as Categoria;
    if ((cat0 === "geral" || cat0 === "cupons") && today + pending < c.auto_daily_cap) {
      const ids = await escolherPorCategoria(db, "cupons", c, 2, dayStart);
      if (ids.length) {
        const { data: frescos } = await db.from("offers").select("id, created_at").in("id", ids)
          .gte("created_at", new Date(Date.now() - 20 * 60_000).toISOString());
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
