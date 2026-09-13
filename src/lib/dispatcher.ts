/**
 * Dispatcher — motor de publicação de ofertas.
 *
 * Fluxo (tick):
 *   1. Pra cada campanha ativa:
 *      a) Achou último envio bem-sucedido dela → passou >= timer_minutes desde então?
 *      b) Se sim, pega o item MAIS ANTIGO da fila (status=pending) que inclui essa campanha
 *         E que ainda não tem log de sucesso pra ela.
 *      c) Publica em todos os grupos habilitados dela. Canal:
 *         - Se o PERFIL da campanha tem waha_url → posta via WAHA (card com foto,
 *           endpoint /api/send/link-custom-preview), usando a copy do ai_prompt da campanha.
 *         - Senão → Evolution (texto + linkPreview), escolhendo telefone aleatório não-admin.
 *      d) Cada envio vira 1 linha em publication_log (success ou error).
 *      e) Se todas as campanhas do queue item já foram enviadas → marca queue como published.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

const EVO_URL = process.env.EVOLUTION_API_URL!;
const EVO_KEY = process.env.EVOLUTION_API_KEY!;
const WAHA_KEY = process.env.WAHA_OFERTAS_API_KEY || process.env.WAHA_API_KEY || "";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = SupabaseClient<any>;

interface Campaign {
  id: string;
  name: string;
  timer_minutes: number;
  ai_prompt?: string | null;
  perfil_id?: string | null;
}
interface PerfilWaha {
  waha_url: string;
  waha_session: string;
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
// Helpers de legenda
// ─────────────────────────────────────────────────────────────────────────────

function moneyBRL(v: number): string {
  return "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Bloco de preço no tom maternidade: "💰 Por *R$X*" + "> Custa R$Y"
function priceBlockMaternity(offer: Offer): string {
  const a = offer.price_current;
  if (a == null) return "";
  const o = offer.price_original;
  const lines = [`💰 Por *${moneyBRL(a)}*`];
  if (o != null && o > a) lines.push(`> Custa ${moneyBRL(o)}`);
  return lines.join("\n");
}

// Bloco de preço geek (fluxo antigo)
function priceBlockGeek(offer: Offer): string {
  const a = offer.price_current;
  if (a == null) return "";
  const o = offer.price_original;
  if (o != null && o > a) return `🏷️ Custa ~${moneyBRL(o)}~\n💰 POR *${moneyBRL(a)}*`;
  return `💰 POR *${moneyBRL(a)}*`;
}

// Linha curta de preço pra description do card
function priceLine(offer: Offer): string {
  const a = offer.price_current;
  if (a == null) return offer.title?.slice(0, 120) || "Oferta";
  const o = offer.price_original;
  return o != null && o > a ? `💰 ${moneyBRL(a)} (de ${moneyBRL(o)})` : `💰 ${moneyBRL(a)}`;
}

// Chama a Claude Haiku com um prompt (ex: ai_prompt da campanha ou fallback geek).
async function callHaiku(prompt: string): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
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

// Copy pela copy do perfil/campanha (ai_prompt). Substitui {TITULO}/{PRECO}.
async function generateFromCampaignPrompt(offer: Offer, aiPrompt: string): Promise<string | null> {
  const nome = offer.title || "Produto";
  const preco = offer.price_current != null ? moneyBRL(offer.price_current) : "";
  let prompt = aiPrompt;
  if (prompt.includes("{TITULO}") || prompt.includes("{PRECO}")) {
    prompt = prompt.replace(/{TITULO}/g, nome).replace(/{PRECO}/g, preco);
  } else {
    prompt = `${aiPrompt}\n\nPRODUTO: ${nome}\nPREÇO: ${preco}`;
  }
  return callHaiku(prompt);
}

// Copy geek (fallback quando não há ai_prompt).
async function generateCreativeLines(offer: Offer): Promise<string | null> {
  const nome = offer.title || "Produto";
  const preco = offer.price_current != null ? moneyBRL(offer.price_current) : "";
  const prompt = `Voce e um criador de anuncios para WhatsApp. Tom geek, inteligente e levemente irreverente.
Gere exatamente 2 linhas:
1. Titulo: emoji + nome do produto + impressao curta de quem testou
2. Copy: emoji + beneficio direto em frase curta e atual
Regras: Um emoji unico por linha, variando entre 🔥 ⚡ 🚀 🎧 🎯 🧠 💎 🎮 💡 🧩. Sem exageros. Retornar APENAS as 2 linhas.
PRODUTO: ${nome}
PRECO: ${preco}`;
  return callHaiku(prompt);
}

// Monta a legenda final. style 'maternity' usa a copy do ai_prompt + preço maternidade.
async function buildCaption(offer: Offer, campaign: Campaign, style: "maternity" | "geek"): Promise<string> {
  let creative = offer.ai_caption?.trim() || "";
  if (!creative && campaign.ai_prompt) creative = (await generateFromCampaignPrompt(offer, campaign.ai_prompt)) || "";
  if (!creative) creative = (await generateCreativeLines(offer)) || "";
  if (!creative) creative = `${style === "maternity" ? "✨" : "🔥"} ${offer.title || "Oferta imperdível"}`;

  const parts: string[] = [creative];
  if (style === "maternity" && offer.title) parts.push(`*${offer.title.trim()}*`);

  const pb = style === "maternity" ? priceBlockMaternity(offer) : priceBlockGeek(offer);
  if (pb) parts.push(pb);
  if (offer.extra_text) parts.push(offer.extra_text.trim());

  const url = offer.affiliate_url || offer.url;
  parts.push(`Compre aqui 👇\n${url}`);
  return parts.join("\n\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Envio — Evolution (texto + linkPreview) e WAHA (card custom com foto)
// ─────────────────────────────────────────────────────────────────────────────

async function sendTextEvolution(instance: string, jid: string, text: string) {
  const res = await fetch(`${EVO_URL}/message/sendText/${encodeURIComponent(instance)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: EVO_KEY },
    body: JSON.stringify({ number: jid, text, delay: 0, linkPreview: true }),
  });
  if (!res.ok) throw new Error(`Evolution ${res.status}: ${await res.text().catch(() => "")}`);
}

async function sendCardWaha(perfil: PerfilWaha, chatId: string, text: string, offer: Offer) {
  if (!WAHA_KEY) throw new Error("WAHA_OFERTAS_API_KEY não configurado");
  const url = offer.affiliate_url || offer.url;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const preview: any = {
    url,
    title: (offer.title || "Oferta").slice(0, 120),
    description: priceLine(offer),
  };
  if (offer.image_url) preview.image = { url: offer.image_url };

  const res = await fetch(`${perfil.waha_url}/api/send/link-custom-preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Api-Key": WAHA_KEY },
    body: JSON.stringify({
      session: perfil.waha_session,
      chatId,
      text,
      linkPreviewHighQuality: true,
      preview,
    }),
  });
  if (!res.ok) throw new Error(`WAHA ${res.status}: ${await res.text().catch(() => "")}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Resolve config WAHA do perfil da campanha (null = campanha via Evolution)
// ─────────────────────────────────────────────────────────────────────────────

async function resolvePerfilWaha(db: DB, perfilId: string | null | undefined): Promise<PerfilWaha | null> {
  if (!perfilId) return null;
  const { data } = await db
    .from("perfis")
    .select("waha_url, waha_session")
    .eq("id", perfilId)
    .maybeSingle();
  if (data?.waha_url && data?.waha_session) {
    return { waha_url: data.waha_url as string, waha_session: data.waha_session as string };
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Timer / seleção de fila
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
  if (!data?.sent_at) return true;
  const elapsedMin = (Date.now() - new Date(data.sent_at as string).getTime()) / 60_000;
  return elapsedMin >= campaign.timer_minutes;
}

async function pickNextForCampaign(db: DB, campaignId: string): Promise<QueueItem | null> {
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
// ─────────────────────────────────────────────────────────────────────────────

export async function publishQueueItemForCampaign(
  db: DB,
  queueItem: QueueItem,
  campaign: Campaign
): Promise<{ successes: number; failures: number }> {
  const perfilWaha = await resolvePerfilWaha(db, campaign.perfil_id);
  const viaWaha = !!perfilWaha;

  const [{ data: offer }, { data: phones }, { data: groups }] = await Promise.all([
    db.from("offers").select("*").eq("id", queueItem.offer_id).maybeSingle(),
    db.from("campaign_phones").select("id, phone_number, evolution_instance_id")
      .eq("campaign_id", campaign.id).eq("is_active", true).eq("is_admin", false),
    db.from("campaign_groups").select("id, group_jid, group_name")
      .eq("campaign_id", campaign.id).eq("is_enabled", true),
  ]);

  if (!offer) throw new Error("offer não encontrado");
  const phoneList = (phones ?? []) as Phone[];
  const groupList = (groups ?? []) as Group[];
  if (groupList.length === 0) throw new Error("nenhum grupo habilitado na campanha");
  if (!viaWaha && phoneList.length === 0) {
    throw new Error("nenhum telefone ativo (não-admin) na campanha");
  }

  const caption = await buildCaption(offer as Offer, campaign, viaWaha ? "maternity" : "geek");
  let successes = 0;
  let failures = 0;

  for (const group of groupList) {
    const phone = phoneList.length ? phoneList[Math.floor(Math.random() * phoneList.length)] : null;
    try {
      if (viaWaha) {
        await sendCardWaha(perfilWaha!, group.group_jid, caption, offer as Offer);
      } else {
        await sendTextEvolution(phone!.evolution_instance_id, group.group_jid, caption);
      }
      await db.from("publication_log").insert({
        queue_id: queueItem.id,
        campaign_id: campaign.id,
        group_jid: group.group_jid,
        group_name: group.group_name,
        phone_used: viaWaha ? `waha:${perfilWaha!.waha_session}` : phone!.phone_number,
        status: "success",
      });
      successes++;
    } catch (err) {
      await db.from("publication_log").insert({
        queue_id: queueItem.id,
        campaign_id: campaign.id,
        group_jid: group.group_jid,
        group_name: group.group_name,
        phone_used: viaWaha ? `waha:${perfilWaha!.waha_session}` : phone?.phone_number ?? "",
        status: "error",
        error_message: err instanceof Error ? err.message : String(err),
      });
      failures++;
    }
    await new Promise((r) => setTimeout(r, 600));
  }

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
  const result: TickResult = { campaigns_checked: 0, campaigns_due: 0, publications: 0, errors: [] };

  const { data: campaigns } = await db
    .from("campaigns")
    .select("id, name, timer_minutes, ai_prompt, perfil_id")
    .eq("is_active", true);

  const camps = (campaigns ?? []) as Campaign[];
  result.campaigns_checked = camps.length;

  for (const campaign of camps) {
    try {
      if (!(await campaignIsDue(db, campaign))) continue;
      result.campaigns_due++;

      const item = await pickNextForCampaign(db, campaign.id);
      if (!item) continue;

      await db.from("publication_queue").update({ status: "publishing" }).eq("id", item.id);

      try {
        const { successes } = await publishQueueItemForCampaign(db, item, campaign);
        if (successes > 0) result.publications++;
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
