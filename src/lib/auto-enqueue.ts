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
const META_FRALDA = 0.35;
const META_AMAZON = 0.45;
const CANAL_REF = "@promocaozinha"; // canal do Telegram mais parecido com o grupo real
const CANAL_FRESCO_MS = 6 * 3600_000; // item do canal vale se chegou nas últimas 6h (canal parado → cai nos coletores)
const isFralda = (t: string | null) => /fralda/i.test(t || "");
const chaveProduto = (t: string | null) => (t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim().slice(0, 40);

interface Cand {
  id: string; title: string | null; platform: string | null; source: string;
  kind?: string | null; discount_pct?: number | null; price_current?: number | null; price_original?: number | null;
}

// ── Data dupla (10/10, 11/11…): dia de mais venda (ML 2–3,5x nas duplas 7/7, 8/8, 9/9). Decisão Bruno 10/Out:
// puxa de TODOS os canais do Telegram (os que postam primeiro de manhã) alternando com os nossos coletores,
// maior desconto primeiro nos dois, + cupons de loja.
const META_CUPOM_DUPLA = 0.25;
function ehDataDupla(): boolean {
  const brt = new Date(Date.now() - 3 * 3600_000);
  return brt.getUTCDate() === brt.getUTCMonth() + 1;
}
const desconto = (o: Cand) =>
  o.discount_pct || (o.price_original && o.price_current && o.price_original > o.price_current
    ? Math.round(100 * (1 - o.price_current / o.price_original)) : 0);

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
    .select("offer:offers(title, platform, kind, source)")
    .is("created_by", null)
    .contains("campaign_ids", [c.id])
    .gte("created_at", dayStart)
    .limit(500);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const feitos = ((hoje ?? []) as any[]).map((r) => r.offer).filter(Boolean) as { title: string | null; platform: string | null; kind?: string | null; source?: string | null }[];
  let total = feitos.length;
  let fraldas = feitos.filter((o) => isFralda(o.title)).length;
  let amazons = feitos.filter((o) => o.platform === "amazon").length;
  const usados = new Set(feitos.map((o) => chaveProduto(o.title)));

  const dupla = ehDataDupla();
  const campos = "id, title, platform, source, kind, discount_pct, price_current, price_original";
  const base = () => db.from("offers").select(campos).eq("perfil_id", c.perfil_id!).eq("status", "draft")
    .eq("kind", "produto").not("image_url", "is", null).not("affiliate_url", "is", null);
  const fresco = new Date(Date.now() - CANAL_FRESCO_MS).toISOString();
  let qCanal = base().eq("source", "telegram").gte("created_at", fresco);
  if (!dupla) qCanal = qCanal.eq("source_channel", CANAL_REF);
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
  const poolCanal = dupla
    ? ((canal ?? []) as Cand[]).sort((a, b) => desconto(b) - desconto(a))
    : ((canal ?? []) as Cand[]).filter((o) => o.platform === "amazon" || isFralda(o.title));
  // data dupla: nossas ofertas automáticas (coletores) também vão por maior desconto e dividem a vez com o Telegram
  const poolCol = dupla ? ((coletores ?? []) as Cand[]).sort((a, b) => desconto(b) - desconto(a)) : (coletores ?? []) as Cand[];
  let nTele = feitos.filter((o) => o.source === "telegram").length;
  let nAuto = feitos.filter((o) => o.source === "auto").length;
  const poolCupom = (cupons ?? []) as Cand[];
  let nCupons = feitos.filter((o) => o.kind === "cupom").length;

  const escolhidos: Cand[] = [];
  const pega = (pred: (o: Cand) => boolean): Cand | null => {
    // data dupla: alterna Telegram e coletores (quem tem menos posts hoje vai primeiro)
    const ordem = dupla && nAuto < nTele ? [poolCol, poolCanal] : [poolCanal, poolCol];
    for (const pool of ordem) {
      const i = pool.findIndex((o) => pred(o) && !usados.has(chaveProduto(o.title)));
      if (i >= 0) return pool.splice(i, 1)[0];
    }
    return null;
  };
  for (let k = 0; k < n; k++) {
    const t = Math.max(total, 1);
    let o: Cand | null = null;
    if (dupla && nCupons / t < META_CUPOM_DUPLA) {
      const i = poolCupom.findIndex((x) => !usados.has(chaveProduto(x.title)));
      if (i >= 0) { o = poolCupom.splice(i, 1)[0]; nCupons++; }
    }
    if (!o && fraldas / t < META_FRALDA) o = pega((x) => isFralda(x.title));
    if (!o && amazons / t < META_AMAZON) o = pega((x) => x.platform === "amazon");
    if (!o) {
      if (dupla) o = pega(() => true); // canal (maior desconto) antes dos coletores
      else {
        const i = poolCol.findIndex((x) => !usados.has(chaveProduto(x.title)));
        o = i >= 0 ? poolCol.splice(i, 1)[0] : pega(() => true);
      }
    }
    if (!o) break;
    escolhidos.push(o);
    usados.add(chaveProduto(o.title));
    if (o.source === "telegram") nTele++; else if (o.source === "auto") nAuto++;
    total++; if (isFralda(o.title)) fraldas++; if (o.platform === "amazon") amazons++;
  }
  return escolhidos;
}

export async function autoEnqueueAll(db: DB): Promise<AutoEnqueueResult> {
  const result: AutoEnqueueResult = { campaigns_checked: 0, enqueued: 0, skipped: [] };

  const { data: campaigns } = await db
    .from("campaigns")
    .select("id, name, perfil_id, auto_daily_cap, auto_window_start, auto_window_end, auto_buffer")
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
    const toEnqueue = Math.max(0, Math.min(buffer - pending, c.auto_daily_cap - today - pending));
    if (toEnqueue <= 0) {
      result.skipped.push({ campaign: c.name, reason: `buffer cheio (${pending} na fila, ${today}/${c.auto_daily_cap} hoje)` });
      continue;
    }

    // Escolha com metas (Amazon e fralda = melhor comissão) — ver escolherOfertas().
    const offers = await escolherOfertas(db, c, toEnqueue, dayStart);
    if (!offers.length) {
      result.skipped.push({ campaign: c.name, reason: "sem draft pronto no perfil" });
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
      await db.from("offers").update({ status: "queued" }).eq("id", offer.id);
      result.enqueued++;
    }
  }

  return result;
}
