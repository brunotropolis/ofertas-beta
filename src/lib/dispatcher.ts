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
import { buildCouponCaption, buildMaternityCaption, isFralda, type PromoMeta } from "@/lib/caption";
import { loadCuponsDoDia, melhorCupom } from "@/lib/cupom-do-dia";

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
  /** outros servidores WAHA do perfil (perfis.waha_urls) — revezam por post com o waha_url */
  waha_urls: string[];
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
  kind?: string | null;
  coupon_code?: string | null;
  coupon_meta?: { codes?: string[]; loja?: string; regra?: string } | null;
  promo_meta?: PromoMeta | null;
  platform?: string | null;
  cupom_dia?: { code: string; regra: string } | null;
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
  /** servidor WAHA fixo do grupo (divisão dos grupos entre os números); null = qualquer um */
  waha_url?: string | null;
}

// Intervalo entre um envio e o próximo (aleatório, ms). Com os grupos divididos entre os números e
// intercalados, cada número espera ~3x isso entre os seus próprios envios.
const GAP_MIN_MS = 1500;
const GAP_MAX_MS = 3000;
// Aviso de "rate-overlimit" vai pro WhatsApp do Bruno (só avisa, não pausa — decisão 19/Out)
const ALERTA_CHAT = "554184302127@c.us";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de legenda
// ─────────────────────────────────────────────────────────────────────────────

function moneyBRL(v: number): string {
  return "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
  // mesma trava da legenda: "de" com mais de 80% de desconto = dado ruim, não mostra
  return o != null && o > a && a / o >= 0.2 ? `💰 ${moneyBRL(a)} (de ${moneyBRL(o)})` : `💰 ${moneyBRL(a)}`;
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
  if (offer.kind === "cupom") return buildCouponCaption(offer);
  if (style === "maternity") {
    // padrão do grupo (lib/caption). Fralda usa o cabeçalho "OFERTAS DE FRALDAS 🚼" — não gasta IA.
    let creative: string | null = null;
    if (!isFralda(offer.title)) {
      creative = offer.ai_caption?.trim() || null;
      if (!creative && campaign.ai_prompt) creative = (await generateFromCampaignPrompt(offer, campaign.ai_prompt)) || null;
    }
    return buildMaternityCaption(offer, creative);
  }

  let creative = offer.ai_caption?.trim() || "";
  if (!creative) creative = (await generateCreativeLines(offer)) || "";
  if (!creative) creative = `🔥 ${offer.title || "Oferta imperdível"}`;
  const parts: string[] = [creative];
  const pb = priceBlockGeek(offer);
  if (pb) parts.push(pb);
  if (offer.extra_text) parts.push(offer.extra_text.trim());
  parts.push(`Compre aqui 👇\n${offer.affiliate_url || offer.url}`);
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
    description: offer.kind === "cupom"
      ? `🎟️ ${(offer.coupon_meta?.codes?.length ? offer.coupon_meta.codes : [offer.coupon_code]).filter(Boolean).join(" · ")}`
      : priceLine(offer),
  };
  // nunca a imagem de post do Telegram (telesco.pe) — vem com a marca do canal de origem (10/Out)
  if (offer.image_url && !/telesco.pe|telegram.org/i.test(offer.image_url)) preview.image = { url: offer.image_url };

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
    .select("waha_url, waha_session, waha_urls")
    .eq("id", perfilId)
    .maybeSingle();
  if (data?.waha_url && data?.waha_session) {
    return {
      waha_url: data.waha_url as string,
      waha_session: data.waha_session as string,
      waha_urls: ((data.waha_urls as string[] | null) ?? []).filter(Boolean),
    };
  }
  return null;
}

const wahaTag = (url: string) => `waha:${new URL(url).host.split(".")[0]}`;

/**
 * Revezamento por post: escolhe o servidor seguinte ao que fez o último envio com sucesso da campanha
 * (phone_used = "waha:<host>"). Pula servidor cuja sessão não está WORKING; se nenhum estiver, fica com o principal.
 */
async function pickWaha(db: DB, perfil: PerfilWaha, campaignId: string): Promise<PerfilWaha> {
  const urls = [perfil.waha_url, ...perfil.waha_urls.filter((u) => u !== perfil.waha_url)];
  if (urls.length === 1) return perfil;
  const { data } = await db
    .from("publication_log")
    .select("phone_used")
    .eq("campaign_id", campaignId)
    .eq("status", "success")
    .like("phone_used", "waha:%")
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const last = urls.findIndex((u) => wahaTag(u) === data?.phone_used);
  for (let k = 1; k <= urls.length; k++) {
    const url = urls[(last + k + urls.length) % urls.length];
    try {
      const r = await fetch(`${url}/api/sessions/${perfil.waha_session}`, {
        headers: { "X-Api-Key": WAHA_KEY ?? "" },
        signal: AbortSignal.timeout(5000),
      });
      if (r.ok && (await r.json())?.status === "WORKING") return { ...perfil, waha_url: url };
    } catch {
      /* servidor fora: tenta o próximo */
    }
  }
  return perfil;
}

/** Servidores WAHA do perfil com sessão WORKING agora → número conectado (url → "5541..."). */
async function wahaSaudaveis(perfil: PerfilWaha): Promise<Map<string, string>> {
  const urls = [perfil.waha_url, ...perfil.waha_urls.filter((u) => u !== perfil.waha_url)];
  const out = new Map<string, string>();
  await Promise.all(urls.map(async (url) => {
    try {
      const r = await fetch(`${url}/api/sessions/${perfil.waha_session}`, {
        headers: { "X-Api-Key": WAHA_KEY ?? "" },
        signal: AbortSignal.timeout(5000),
      });
      const s = r.ok ? await r.json() : null;
      if (s?.status === "WORKING") out.set(url, String(s.me?.id ?? "").split("@")[0]);
    } catch {
      /* fora do ar */
    }
  }));
  // mantém a ordem do perfil (principal primeiro)
  return new Map(urls.filter((u) => out.has(u)).map((u) => [u, out.get(u)!]));
}

/**
 * Avisa o Bruno no WhatsApp quando um número levou "rate-overlimit" neste post.
 * Só avisa (não pausa). No máximo 1 aviso por número por hora: se já houve rate-overlimit
 * desse número na hora anterior ao post, não repete.
 */
async function avisarRateLimit(
  db: DB, perfil: PerfilWaha, saudaveis: Map<string, string>, limitados: Map<string, number>,
  campaignId: string, inicioPost: string,
) {
  const desde = new Date(Date.parse(inicioPost) - 60 * 60_000).toISOString();
  const linhas: string[] = [];
  for (const [url, n] of limitados) {
    const { count } = await db
      .from("publication_log")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .eq("phone_used", wahaTag(url))
      .eq("status", "error")
      .ilike("error_message", "%rate-overlimit%")
      .gte("sent_at", desde)
      .lt("sent_at", inicioPost);
    if ((count ?? 0) > 0) continue;
    const num = saudaveis.get(url) || wahaTag(url);
    linhas.push(`• número final ${num.slice(-4)} (${wahaTag(url).replace("waha:", "")}): ${n} grupo(s) recusados`);
  }
  if (!linhas.length) return;
  const via = [...saudaveis.keys()].find((u) => !limitados.has(u)) ?? [...saudaveis.keys()][0];
  if (!via) return;
  const hora = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
  const text = `⚠️ *Ofertas Maternas: rate-overlimit* (${hora})\n\nO WhatsApp limitou envio em:\n${linhas.join("\n")}\n\nOs disparos seguem normais (sem pausa automática). Se repetir, vale diminuir o ritmo desse número.`;
  try {
    await fetch(`${via}/api/sendText`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": WAHA_KEY },
      body: JSON.stringify({ session: perfil.waha_session, chatId: ALERTA_CHAT, text }),
    });
  } catch {
    /* aviso é best-effort */
  }
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
  const perfilBase = await resolvePerfilWaha(db, campaign.perfil_id);
  const perfilWaha = perfilBase ? await pickWaha(db, perfilBase, campaign.id) : null;
  const viaWaha = !!perfilWaha;
  // servidores WAHA saudáveis agora (url → número) — cada grupo sai pelo seu número fixo
  const saudaveis = perfilBase ? await wahaSaudaveis(perfilBase) : new Map<string, string>();

  const [{ data: offer }, { data: phones }, { data: groups }] = await Promise.all([
    db.from("offers").select("*").eq("id", queueItem.offer_id).maybeSingle(),
    db.from("campaign_phones").select("id, phone_number, evolution_instance_id")
      .eq("campaign_id", campaign.id).eq("is_active", true).eq("is_admin", false),
    db.from("campaign_groups").select("id, group_jid, group_name, waha_url")
      .eq("campaign_id", campaign.id).eq("is_enabled", true),
  ]);

  if (!offer) throw new Error("offer não encontrado");
  const phoneList = (phones ?? []) as Phone[];
  const groupList = (groups ?? []) as Group[];
  if (groupList.length === 0) throw new Error("nenhum grupo habilitado na campanha");
  if (!viaWaha && phoneList.length === 0) {
    throw new Error("nenhum telefone ativo (não-admin) na campanha");
  }

  // cupom geral do dia (capturado do Telegram) que vale pro preço — só produto sem cupom próprio
  const o = offer as Offer;
  if (viaWaha && o.kind !== "cupom" && !o.coupon_code && !o.coupon_meta?.codes?.length) {
    const c = melhorCupom(await loadCuponsDoDia(db), o.platform, o.price_current, o.promo_meta);
    if (c) o.cupom_dia = { code: c.code, regra: c.regra };
  }
  const caption = await buildCaption(o, campaign, viaWaha ? "maternity" : "geek");
  let successes = 0;
  let failures = 0;

  // WAHA: cada grupo sai pelo seu número fixo (campaign_groups.waha_url); se o número dele estiver fora,
  // vai pelo próximo saudável. A ordem intercala os números pra cada um respirar entre os próprios envios.
  const vivos = [...saudaveis.keys()];
  const servidorDe = (g: Group, i: number) =>
    g.waha_url && saudaveis.has(g.waha_url) ? g.waha_url : vivos.length ? vivos[i % vivos.length] : perfilWaha?.waha_url ?? "";
  const ordem: { group: Group; url: string }[] = [];
  if (viaWaha) {
    const filas = new Map<string, Group[]>();
    groupList.forEach((g, i) => {
      const u = servidorDe(g, i);
      if (!filas.has(u)) filas.set(u, []);
      filas.get(u)!.push(g);
    });
    const listas = [...filas.entries()];
    for (let k = 0; listas.some(([, l]) => k < l.length); k++) {
      for (const [u, l] of listas) if (k < l.length) ordem.push({ group: l[k], url: u });
    }
  } else {
    for (const g of groupList) ordem.push({ group: g, url: "" });
  }
  const rateLimitados = new Map<string, number>(); // url → nº de grupos com rate-overlimit neste post
  const inicioPost = new Date().toISOString();

  for (const { group, url } of ordem) {
    const phone = phoneList.length ? phoneList[Math.floor(Math.random() * phoneList.length)] : null;
    const usado = viaWaha ? wahaTag(url) : phone?.phone_number ?? "";
    try {
      if (viaWaha) {
        await sendCardWaha({ ...perfilWaha!, waha_url: url }, group.group_jid, caption, offer as Offer);
      } else {
        await sendTextEvolution(phone!.evolution_instance_id, group.group_jid, caption);
      }
      await db.from("publication_log").insert({
        queue_id: queueItem.id,
        campaign_id: campaign.id,
        group_jid: group.group_jid,
        group_name: group.group_name,
        phone_used: usado,
        status: "success",
      });
      successes++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (viaWaha && /rate-overlimit/i.test(msg)) rateLimitados.set(url, (rateLimitados.get(url) ?? 0) + 1);
      await db.from("publication_log").insert({
        queue_id: queueItem.id,
        campaign_id: campaign.id,
        group_jid: group.group_jid,
        group_name: group.group_name,
        phone_used: usado,
        status: "error",
        error_message: msg,
      });
      failures++;
    }
    await new Promise((r) => setTimeout(r, GAP_MIN_MS + Math.random() * (GAP_MAX_MS - GAP_MIN_MS)));
  }

  if (rateLimitados.size) await avisarRateLimit(db, perfilWaha!, saudaveis, rateLimitados, campaign.id, inicioPost);

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
    // só a campanha geral "gasta" a oferta; campanha de categoria (fraldas/cupons/enxoval) posta
    // a mesma oferta sem tirar ela do Ofertas Maternas (19/Out)
    const { data: cats } = await db.from("campaigns").select("categoria").in("id", item.campaign_ids);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const temGeral = !cats?.length || (cats as any[]).some((c) => (c.categoria ?? "geral") === "geral");
    if (temGeral) await db.from("offers").update({ status: "published" }).eq("id", item.offer_id);
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

/**
 * Item preso em "publishing" (o processo morreu no meio do envio — ex.: deploy durante o post, 19/Out)
 * trava a fila da campanha pra sempre. Sem envio novo há 20 min:
 *   - se chegou em algum grupo → "published" (reenviar duplicaria nos que já receberam)
 *   - se não chegou em nenhum → volta pra "pending"
 */
async function destravarPresos(db: DB) {
  const { data: presos } = await db.from("publication_queue").select("id, created_at").eq("status", "publishing").limit(20);
  for (const q of (presos ?? []) as { id: string; created_at: string }[]) {
    const { data: ult } = await db.from("publication_log").select("sent_at").eq("queue_id", q.id)
      .order("sent_at", { ascending: false }).limit(1).maybeSingle();
    const ref = Date.parse((ult?.sent_at as string | undefined) ?? q.created_at);
    if (Date.now() - ref < 20 * 60_000) continue; // ainda pode estar enviando
    const { count: ok } = await db.from("publication_log").select("id", { count: "exact", head: true })
      .eq("queue_id", q.id).eq("status", "success");
    await db.from("publication_queue")
      .update(ok ? { status: "published", published_at: new Date().toISOString() } : { status: "pending" })
      .eq("id", q.id).eq("status", "publishing");
  }
}

export async function tickAll(db: DB): Promise<TickResult> {
  const result: TickResult = { campaigns_checked: 0, campaigns_due: 0, publications: 0, errors: [] };

  const { data: campaigns } = await db
    .from("campaigns")
    .select("id, name, timer_minutes, ai_prompt, perfil_id")
    .eq("is_active", true);

  const camps = (campaigns ?? []) as Campaign[];
  result.campaigns_checked = camps.length;

  await destravarPresos(db);

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
