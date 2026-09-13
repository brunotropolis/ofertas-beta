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
  price_current: number | null;
  price_original: number | null;
  discount_pct: number | null;
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

// ─── Legenda no padrão do dispatcher geek antigo ────────────────────────────
// Estrutura: {2 linhas criativas} · {bloco de preços} · {extra} · COMPRE AQUI 👇 · {link}

function moneyBRL(v: number): string {
  return "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function priceBlock(offer: Offer): string {
  const a = offer.price_current;
  if (a == null) return "";
  const o = offer.price_original;
  if (o != null && o > a) {
    return `🏷️ Custa ~${moneyBRL(o)}~\n💰 POR *${moneyBRL(a)}*`;
  }
  return `💰 POR *${moneyBRL(a)}*`;
}

// 2 linhas criativas via Claude Haiku (mesmo tom geek do fluxo antigo). Null se não der.
async function generateCreativeLines(offer: Offer): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const nome = offer.title || "Produto";
  const preco = offer.price_current != null ? moneyBRL(offer.price_current) : "";
  const prompt = `Voce e um criador de anuncios para WhatsApp. Tom geek, inteligente e levemente irreverente.
Gere exatamente 2 linhas:
1. Titulo: emoji + nome do produto + impressao curta de quem testou
2. Copy: emoji + beneficio direto em frase curta e atual
Regras: Um emoji unico por linha, variando entre 🔥 ⚡ 🚀 🎧 🎯 🧠 💎 🎮 💡 🧩. Sem exageros. Retornar APENAS as 2 linhas.
PRODUTO: ${nome}
PRECO: ${preco}`;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) return null;
    const j = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const txt = ((j as any).content?.[0]?.text || "").trim();
    return txt || null;
  } catch {
    return null;
  }
}

// Monta a legenda final. Gera as linhas criativas se a oferta não trouxe ai_caption.
async function buildCaption(offer: Offer): Promise<string> {
  let creative = offer.ai_caption?.trim() || "";
  if (!creative) creative = (await generateCreativeLines(offer)) || "";
  if (!creative) creative = `🔥 ${offer.title || "Oferta imperdível"}`;

  const parts: string[] = [creative];
  const pb = priceBlock(offer);
  if (pb) parts.push(pb);
  if (offer.extra_text) parts.push(offer.extra_text.trim());
  const url = offer.affiliate_url || offer.url;
  parts.push(`COMPRE AQUI 👇\n${url}`);
  return parts.join("\n\n");
}

// Payloads no formato Evolution API v2 (flat) — o evo-v2 rejeita o formato v1 aninhado.
async function sendText(instance: string, jid: string, text: string) {
  const res = await fetch(`${EVO_URL}/message/sendText/${encodeURIComponent(instance)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: EVO_KEY },
    body: JSON.stringify({
      number: jid,
      text,
      delay: 0,
      linkPreview: true,
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

  const caption = await buildCaption(offer as Offer);
  let successes = 0;
  let failures = 0;

  for (const group of groupList) {
    // Sorteia telefone
    const phone = phoneList[Math.floor(Math.random() * phoneList.length)];
    try {
      // Sempre texto + linkPreview: a imagem carrega como thumb do link (não como arquivo).
      await sendText(phone.evolution_instance_id, group.group_jid, caption);
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
