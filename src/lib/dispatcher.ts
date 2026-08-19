/**
 * Dispatcher — motor de publicação de ofertas.
 *
 * Fluxo (tick):
 *   1. Pra cada campanha ativa:
 *      a) Achou último envio bem-sucedido dela → passou >= timer_minutes desde então?
 *      b) Se sim, pega o item MAIS ANTIGO da fila (status=pending) que inclui essa campanha
 *         E que ainda não tem log de sucesso pra ela.
 *      c) Publica em todos os grupos habilitados dela via Evolution, escolhendo telefone
 *         aleatório NÃO admin.
 *      d) Cada envio vira 1 linha em publication_log (success ou error).
 *      e) Se todas as campanhas do queue item já foram enviadas → marca queue como published.
 *
 * Rotação de telefone: random entre phones ativos + não admin da campanha.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

const EVO_URL = process.env.EVOLUTION_API_URL!;
const EVO_KEY = process.env.EVOLUTION_API_KEY!;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = SupabaseClient<any>;

interface Campaign {
  id: string;
  name: string;
  timer_minutes: number;
}
interface Offer {
  id: string;
  title: string | null;
  affiliate_url: string | null;
  url: string;
  image_url: string | null;
  ai_caption: string | null;
  extra_text: string | null;
}
interface QueueItem {
  id: string;
  offer_id: string;
  campaign_ids: string[];
}
interface Phone {
  id: string;
  phone_number: string;
  evolution_instance_id: string;
}
interface Group {
  id: string;
  group_jid: string;
  group_name: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildCaption(offer: Offer): string {
  const parts: string[] = [];
  if (offer.ai_caption) parts.push(offer.ai_caption.trim());
  if (offer.extra_text) parts.push(offer.extra_text.trim());
  const url = offer.affiliate_url || offer.url;
  if (url) parts.push(url);
  return parts.join("\n\n");
}

async function sendText(instance: string, jid: string, text: string) {
  const res = await fetch(`${EVO_URL}/message/sendText/${encodeURIComponent(instance)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: EVO_KEY },
    body: JSON.stringify({
      number: jid,
      options: { delay: 0, linkPreview: true },
      textMessage: { text },
    }),
  });
  if (!res.ok) throw new Error(`Evolution ${res.status}: ${await res.text().catch(() => "")}`);
}

async function sendMedia(
  instance: string,
  jid: string,
  imageUrl: string,
  caption: string
) {
  const res = await fetch(`${EVO_URL}/message/sendMedia/${encodeURIComponent(instance)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: EVO_KEY },
    body: JSON.stringify({
      number: jid,
      options: { delay: 0 },
      mediaMessage: {
        mediatype: "image",
        mimetype: "image/jpeg",
        media: imageUrl,
        caption,
        fileName: "oferta.jpg",
      },
    }),
  });
  if (!res.ok) throw new Error(`Evolution ${res.status}: ${await res.text().catch(() => "")}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Verifica se a campanha "tá na hora" — timer_minutes desde último envio OK
// ─────────────────────────────────────────────────────────────────────────────

async function campaignIsDue(db: DB, campaign: Campaign): Promise<boolean> {
  const { data } = await db
    .from("publication_log")
    .select("sent_at")
    .eq("campaign_id", campaign.id)
    .eq("status", "success")
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data?.sent_at) return true; // nunca enviou → devido

  const lastSentMs = new Date(data.sent_at as string).getTime();
  const nowMs = Date.now();
  const elapsedMin = (nowMs - lastSentMs) / 60_000;
  return elapsedMin >= campaign.timer_minutes;
}

// ─────────────────────────────────────────────────────────────────────────────
// Acha próximo item da fila devido pra essa campanha
// (mais antigo, pending, campanha nos ids, sem log de sucesso pra essa campanha)
// ─────────────────────────────────────────────────────────────────────────────

async function pickNextForCampaign(
  db: DB,
  campaignId: string
): Promise<QueueItem | null> {
  const nowIso = new Date().toISOString();

  const { data: items } = await db
    .from("publication_queue")
    .select("id, offer_id, campaign_ids, scheduled_at, status")
    .in("status", ["pending"])
    .contains("campaign_ids", [campaignId])
    .or(`scheduled_at.is.null,scheduled_at.lte.${nowIso}`)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(20);

  if (!items?.length) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const item of items as any[]) {
    // Já tem sucesso pra essa campanha? Se sim, pula.
    const { count } = await db
      .from("publication_log")
      .select("id", { count: "exact", head: true })
      .eq("queue_id", item.id)
      .eq("campaign_id", campaignId)
      .eq("status", "success");
    if ((count ?? 0) === 0) return item as QueueItem;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Publica UM queue item pra UMA campanha (todos os grupos habilitados)
// Retorna { successes, failures }
// ─────────────────────────────────────────────────────────────────────────────

export async function publishQueueItemForCampaign(
  db: DB,
  queueItem: QueueItem,
  campaign: Campaign
): Promise<{ successes: number; failures: number }> {
  // 1. Buscar oferta, telefones ativos não-admin, grupos habilitados
  const [{ data: offer }, { data: phones }, { data: groups }] = await Promise.all([
    db.from("offers").select("*").eq("id", queueItem.offer_id).maybeSingle(),
    db.from("campaign_phones").select("id, phone_number, evolution_instance_id")
      .eq("campaign_id", campaign.id)
      .eq("is_active", true)
      .eq("is_admin", false),
    db.from("campaign_groups").select("id, group_jid, group_name")
      .eq("campaign_id", campaign.id)
      .eq("is_enabled", true),
  ]);

  if (!offer) throw new Error("offer não encontrado");
  const phoneList = (phones ?? []) as Phone[];
  const groupList = (groups ?? []) as Group[];
  if (phoneList.length === 0) {
    throw new Error("nenhum telefone ativo (não-admin) na campanha");
  }
  if (groupList.length === 0) {
    throw new Error("nenhum grupo habilitado na campanha");
  }

  const caption = buildCaption(offer as Offer);
  let successes = 0;
  let failures = 0;

  for (const group of groupList) {
    // Sorteia telefone
    const phone = phoneList[Math.floor(Math.random() * phoneList.length)];
    try {
      if ((offer as Offer).image_url) {
        await sendMedia(phone.evolution_instance_id, group.group_jid, (offer as Offer).image_url!, caption);
      } else {
        await sendText(phone.evolution_instance_id, group.group_jid, caption);
      }
      await db.from("publication_log").insert({
        queue_id: queueItem.id,
        campaign_id: campaign.id,
        group_jid: group.group_jid,
        group_name: group.group_name,
        phone_used: phone.phone_number,
        status: "success",
      });
      successes++;
    } catch (err) {
      await db.from("publication_log").insert({
        queue_id: queueItem.id,
        campaign_id: campaign.id,
        group_jid: group.group_jid,
        group_name: group.group_name,
        phone_used: phone.phone_number,
        status: "error",
        error_message: err instanceof Error ? err.message : String(err),
      });
      failures++;
    }
    // Espaça 300ms entre grupos pra não estourar rate limit
    await new Promise((r) => setTimeout(r, 300));
  }

  // Se TODAS as campanhas do item têm ao menos 1 sucesso agora → marca published
  await maybeMarkQueueDone(db, queueItem);

  return { successes, failures };
}

async function maybeMarkQueueDone(db: DB, item: QueueItem) {
  const { data: logs } = await db
    .from("publication_log")
    .select("campaign_id, status")
    .eq("queue_id", item.id);
  const successCampaigns = new Set(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((logs ?? []) as any[])
      .filter((l) => l.status === "success" && l.campaign_id)
      .map((l) => l.campaign_id as string)
  );
  const allDone = item.campaign_ids.every((cid) => successCampaigns.has(cid));
  if (allDone) {
    await db
      .from("publication_queue")
      .update({ status: "published", published_at: new Date().toISOString() })
      .eq("id", item.id);
    await db.from("offers").update({ status: "published" }).eq("id", item.offer_id);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TICK — roda pra todas as campanhas ativas
// ─────────────────────────────────────────────────────────────────────────────

export interface TickResult {
  campaigns_checked: number;
  campaigns_due: number;
  publications: number;
  errors: string[];
}

export async function tickAll(db: DB): Promise<TickResult> {
  const result: TickResult = {
    campaigns_checked: 0,
    campaigns_due: 0,
    publications: 0,
    errors: [],
  };

  const { data: campaigns } = await db
    .from("campaigns")
    .select("id, name, timer_minutes")
    .eq("is_active", true);

  const camps = (campaigns ?? []) as Campaign[];
  result.campaigns_checked = camps.length;

  for (const campaign of camps) {
    try {
      if (!(await campaignIsDue(db, campaign))) continue;
      result.campaigns_due++;

      const item = await pickNextForCampaign(db, campaign.id);
      if (!item) continue;

      // Marca item como publishing (soft lock) enquanto processa
      await db.from("publication_queue").update({ status: "publishing" }).eq("id", item.id);

      try {
        const { successes } = await publishQueueItemForCampaign(db, item, campaign);
        if (successes > 0) result.publications++;
        // Se ainda tem campanhas pendentes, volta pra pending
        const { data: fresh } = await db
          .from("publication_queue")
          .select("status")
          .eq("id", item.id)
          .maybeSingle();
        if (fresh && (fresh as { status: string }).status === "publishing") {
          await db.from("publication_queue").update({ status: "pending" }).eq("id", item.id);
        }
      } catch (innerErr) {
        await db
          .from("publication_queue")
          .update({
            status: "error",
            error_message: innerErr instanceof Error ? innerErr.message : String(innerErr),
          })
          .eq("id", item.id);
        result.errors.push(`campaign ${campaign.name}: ${innerErr}`);
      }
    } catch (err) {
      result.errors.push(`campaign ${campaign.name}: ${err}`);
    }
  }

  return result;
}
