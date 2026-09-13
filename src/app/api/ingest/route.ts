import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { parseOrError } from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/ingest — porta de entrada das FONTES AUTOMÁTICAS (Sprint 5).
 *
 * Qualquer monitor externo (bot Telegram, monitor WhatsApp, coletor de API)
 * chama aqui pra registrar uma oferta capturada. Server-to-server:
 *   header  x-ingest-secret: <INGEST_SECRET ou CRON_SECRET>
 *
 * Comportamento:
 *   - Dedup por (source, source_ref) quando source_ref vem; senão por url nas últimas 24h.
 *     Oferta repetida → 200 { deduped: true } sem recriar.
 *   - Cria a oferta com status 'draft' (fica na aba Publicações pra curadoria).
 *   - Se vier campaign_ids → enfileira direto (status 'queued' + item na fila).
 *
 * Assim o app não precisa alcançar Telegram/WhatsApp/API: as fontes empurram pra cá.
 */

const IngestSchema = z.object({
  source: z.enum(["telegram", "whatsapp", "auto", "manual"]).default("auto"),
  source_ref: z.string().max(200).nullable().optional(),
  platform: z.enum(["amazon", "shopee", "ml"]).nullable().optional(),
  url: z.string().url().max(2048),
  affiliate_url: z.string().url().max(2048).nullable().optional(),
  title: z.string().max(500).nullable().optional(),
  price_current: z.number().nonnegative().nullable().optional(),
  price_original: z.number().nonnegative().nullable().optional(),
  discount_pct: z.number().int().min(0).max(100).nullable().optional(),
  image_url: z.string().url().max(2048).nullable().optional(),
  caption: z.string().max(2000).nullable().optional(),
  extra_text: z.string().max(2000).nullable().optional(),
  campaign_ids: z.array(z.string().uuid()).optional(),
  perfil: z.string().max(80).nullable().optional(), // slug do perfil (ex: "ofertas-maternas")
});

function authorized(request: Request): boolean {
  const provided = request.headers.get("x-ingest-secret");
  if (!provided) return false;
  const ingest = process.env.INGEST_SECRET;
  const cron = process.env.CRON_SECRET;
  return (!!ingest && provided === ingest) || (!!cron && provided === cron);
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY não configurado" }, { status: 503 });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createClient(supabaseUrl, serviceKey) as any;

  const raw = await request.json().catch(() => ({}));
  const parsed = parseOrError(IngestSchema, raw);
  if (!parsed.ok) return NextResponse.json(parsed.error, { status: 400 });
  const p = parsed.data;

  // ── Dedup ──────────────────────────────────────────────────────────────
  if (p.source_ref) {
    const { data: dup } = await db
      .from("offers")
      .select("id")
      .eq("source", p.source)
      .eq("source_ref", p.source_ref)
      .maybeSingle();
    if (dup) return NextResponse.json({ deduped: true, offer_id: dup.id });
  } else {
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { data: dup } = await db
      .from("offers")
      .select("id")
      .eq("url", p.url)
      .gte("created_at", since)
      .limit(1)
      .maybeSingle();
    if (dup) return NextResponse.json({ deduped: true, offer_id: dup.id });
  }

  // ── Resolve perfil (slug → id) ───────────────────────────────────────────
  let perfilId: string | null = null;
  if (p.perfil) {
    const { data: perfilRow } = await db
      .from("perfis")
      .select("id")
      .eq("slug", p.perfil)
      .maybeSingle();
    perfilId = perfilRow?.id ?? null;
  }

  // ── Encurta link Amazon (URL longa) via worker utm-redirector ────────────
  // Amazon manda a URL inteira (?tag=...&linkCode=osi&th=1&psc=1). Encurta pra
  // manualdorecemnascido.com.br/l/amz<ASIN> (302 → URL completa, tag preservada).
  // Best-effort: qualquer falha mantém a URL completa. ML(meli.la)/Shopee já vêm curtos.
  let affiliateUrl = p.affiliate_url || p.url;
  const isAmazon = p.platform === "amazon" || /(^|\.)amazon\.com/.test((() => { try { return new URL(affiliateUrl).hostname; } catch { return ""; } })());
  if (isAmazon && /amazon\.com/.test(affiliateUrl) && process.env.UTM_WORKER_SECRET) {
    const asin =
      (p.source_ref?.replace(/^amazon_/, "") || "").match(/^[A-Z0-9]{8,12}$/)?.[0] ||
      affiliateUrl.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{8,12})/)?.[1] ||
      null;
    if (asin) {
      try {
        const slug = "amz" + asin;
        const reg = await fetch("https://manualdorecemnascido.com.br/_utmapi/register", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Worker-Secret": process.env.UTM_WORKER_SECRET,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
          },
          body: JSON.stringify({ slug, url: affiliateUrl, description: "amazon ingest" }),
        });
        if (reg.ok) affiliateUrl = `https://manualdorecemnascido.com.br/l/${slug}`;
      } catch {
        /* mantém a URL completa */
      }
    }
  }

  // ── Cria oferta ─────────────────────────────────────────────────────────
  const willQueue = !!p.campaign_ids?.length;
  const { data: offer, error: offerErr } = await db
    .from("offers")
    .insert({
      source: p.source,
      source_ref: p.source_ref ?? null,
      platform: p.platform ?? null,
      url: p.url,
      affiliate_url: affiliateUrl,
      title: p.title ?? null,
      price_current: p.price_current ?? null,
      price_original: p.price_original ?? null,
      discount_pct: p.discount_pct ?? null,
      image_url: p.image_url ?? null,
      ai_caption: p.caption ?? null,
      extra_text: p.extra_text ?? null,
      perfil_id: perfilId,
      status: willQueue ? "queued" : "draft",
    })
    .select()
    .single();

  if (offerErr) return NextResponse.json({ error: offerErr.message }, { status: 500 });

  // ── Auto-enfileira se veio campaign_ids ──────────────────────────────────
  if (willQueue) {
    const { data: lastItem } = await db
      .from("publication_queue")
      .select("position")
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextPosition = ((lastItem?.position ?? 0) as number) + 1;

    await db.from("publication_queue").insert({
      offer_id: offer.id,
      campaign_ids: p.campaign_ids,
      position: nextPosition,
      status: "pending",
    });
  }

  return NextResponse.json({ ok: true, offer_id: offer.id, queued: willQueue }, { status: 201 });
}

export async function GET() {
  return NextResponse.json({ error: "use POST com header x-ingest-secret" }, { status: 405 });
}
