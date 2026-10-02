import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { parseOrError } from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/ingest/esgotado — o leitor do Telegram avisa quais posts viraram "ESGOTADO".
 * Header x-ingest-secret (mesmo do /api/ingest). Body: { posts: ["https://t.me/<canal>/<id>", ...] }
 * Remove do painel as ofertas ainda não publicadas desses posts (rascunho e fila pendente).
 */
const Schema = z.object({ posts: z.array(z.string().url().max(300)).min(1).max(500) });

function authorized(request: Request): boolean {
  const provided = request.headers.get("x-ingest-secret");
  if (!provided) return false;
  const ingest = process.env.INGEST_SECRET;
  const cron = process.env.CRON_SECRET;
  return (!!ingest && provided === ingest) || (!!cron && provided === cron);
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY não configurado" }, { status: 503 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey) as any;

  const parsed = parseOrError(Schema, await request.json().catch(() => ({})));
  if (!parsed.ok) return NextResponse.json(parsed.error, { status: 400 });

  const { data: offers, error } = await db
    .from("offers")
    .select("id")
    .eq("source", "telegram")
    .in("status", ["draft", "queued"])
    .in("coupon_meta->>post", parsed.data.posts);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const ids = ((offers ?? []) as { id: string }[]).map((o) => o.id);
  if (!ids.length) return NextResponse.json({ removidos: 0 });

  await db.from("publication_queue").delete().in("offer_id", ids).eq("status", "pending");
  const { error: delErr } = await db.from("offers").delete().in("id", ids).in("status", ["draft", "queued"]);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
  return NextResponse.json({ removidos: ids.length });
}
