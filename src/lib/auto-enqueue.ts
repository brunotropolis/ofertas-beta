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
 *   5. Senão, pega a oferta DRAFT mais nova do perfil (com imagem + link de
 *      afiliado) e enfileira nessa campanha. O dispatcher posta no próximo tick
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

    // Ofertas DRAFT mais novas do perfil, prontas (imagem + afiliado).
    const { data: offers } = await db
      .from("offers")
      .select("id")
      .eq("perfil_id", c.perfil_id)
      .eq("status", "draft")
      .not("image_url", "is", null)
      .not("affiliate_url", "is", null)
      .order("created_at", { ascending: false })
      .limit(toEnqueue);
    if (!offers?.length) {
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
