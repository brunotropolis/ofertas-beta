import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { parseOrError } from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Refresh das ofertas Amazon ainda não publicadas (workflow n8n "OFERTAS MATERNAS | Amazon Refresh").
 * Header x-ingest-secret (mesmo do /api/ingest).
 *   GET  ?perfil=<slug>&dias=3  → [{ id, asin, price_current, promo_meta }] (rascunho + fila, Amazon)
 *   POST { itens: [{ id, esgotado?, price_current?, price_original?, promo }] }
 *        esgotado → sai do painel/fila; senão atualiza preço e mescla promo em promo_meta.
 */
function authorized(request: Request): boolean {
  const provided = request.headers.get("x-ingest-secret");
  if (!provided) return false;
  const ingest = process.env.INGEST_SECRET;
  const cron = process.env.CRON_SECRET;
  return (!!ingest && provided === ingest) || (!!cron && provided === cron);
}

function db() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!) as any;
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const sp = new URL(request.url).searchParams;
  const dias = Math.min(Math.max(Number(sp.get("dias") ?? 3) || 3, 1), 30);
  const d = db();
  let perfilId: string | null = null;
  if (sp.get("perfil")) {
    const { data } = await d.from("perfis").select("id").eq("slug", sp.get("perfil")).maybeSingle();
    perfilId = data?.id ?? null;
  }
  let q = d
    .from("offers")
    .select("id, url, source_ref, price_current, promo_meta, status, created_at")
    .eq("platform", "amazon")
    .eq("kind", "produto")
    // campeão entra sempre (mesmo velho ou já publicado): ele volta pra fila em dia útil e precisa de preço do dia
    .or(`and(status.in.(draft,queued),created_at.gte.${new Date(Date.now() - dias * 86400_000).toISOString()}),and(campeao.eq.true,status.in.(draft,queued,published))`)
    .order("created_at", { ascending: false })
    .limit(500);
  if (perfilId) q = q.eq("perfil_id", perfilId);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const itens = ((data ?? []) as any[]).map((o) => ({
    id: o.id,
    asin: (o.url.match(/\/dp\/([A-Z0-9]{10})/) || [])[1] || (o.source_ref || "").match(/amazon_([A-Z0-9]{10})/)?.[1] || null,
    price_current: o.price_current,
    promo_meta: o.promo_meta,
  })).filter((o) => o.asin);
  return NextResponse.json({ itens });
}

const PostSchema = z.object({
  itens: z.array(z.object({
    id: z.string().uuid(),
    esgotado: z.boolean().optional(),
    price_current: z.number().nonnegative().nullable().optional(),
    price_original: z.number().nonnegative().nullable().optional(),
    promo: z.record(z.string(), z.unknown()).optional(),
  })).max(500),
});

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = parseOrError(PostSchema, await request.json().catch(() => ({})));
  if (!parsed.ok) return NextResponse.json(parsed.error, { status: 400 });
  const d = db();
  let removidos = 0, atualizados = 0;
  const esg = parsed.data.itens.filter((i) => i.esgotado).map((i) => i.id);
  if (esg.length) {
    await d.from("publication_queue").delete().in("offer_id", esg).eq("status", "pending");
    const { data } = await d.from("offers").delete().in("id", esg).in("status", ["draft", "queued"]).eq("campeao", false).select("id");
    removidos = data?.length ?? 0;
    // campeão esgotado não some: fica marcado e o auto-enqueue pula até voltar o estoque
    const { data: camps } = await d.from("offers").select("id, promo_meta").in("id", esg).eq("campeao", true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await Promise.all(((camps ?? []) as any[]).map((o) => d.from("offers")
      .update({ promo_meta: { ...(o.promo_meta || {}), esgotado: true, checked_at: new Date().toISOString() } }).eq("id", o.id)));
  }
  const vivos = parsed.data.itens.filter((x) => !x.esgotado);
  // promo_meta atual de todos de uma vez + updates em paralelo (um por um estourava os 100s da Cloudflare)
  const { data: atuais } = vivos.length
    ? await d.from("offers").select("id, promo_meta").in("id", vivos.map((i) => i.id))
    : { data: [] };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const metaPorId = new Map(((atuais ?? []) as any[]).map((o) => [o.id, o.promo_meta]));
  for (let k = 0; k < vivos.length; k += 10) {
    const res = await Promise.all(vivos.slice(k, k + 10).map((i) => {
      const patch: Record<string, unknown> = {
        promo_meta: { ...(metaPorId.get(i.id) || {}), ...(i.promo || {}), esgotado: false, checked_at: new Date().toISOString() },
      };
      if (i.price_current != null) patch.price_current = i.price_current;
      if (i.price_original !== undefined) patch.price_original = i.price_original;
      return d.from("offers").update(patch).eq("id", i.id).or("status.in.(draft,queued),campeao.eq.true");
    }));
    atualizados += res.filter((r: { error: unknown }) => !r.error).length;
  }
  return NextResponse.json({ removidos, atualizados });
}
