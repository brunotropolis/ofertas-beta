import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/cliques — o encurtador (worker utm-redirector) avisa cada clique em asofertasmaternas.com.br/l/<slug>?g=<grupo>.
 * Header x-cliques-secret = CLIQUES_SECRET (segredo próprio, só o worker tem). Grava sem IP/telefone.
 */
export async function POST(request: Request) {
  const secret = process.env.CLIQUES_SECRET;
  if (!secret || request.headers.get("x-cliques-secret") !== secret) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const b = await request.json().catch(() => null);
  const slug = typeof b?.slug === "string" ? b.slug.slice(0, 40) : null;
  if (!slug || !/^[A-Za-z0-9_-]+$/.test(slug)) return NextResponse.json({ error: "slug inválido" }, { status: 400 });
  const grupo = typeof b?.g === "string" && /^[A-Za-z0-9]{1,12}$/.test(b.g) ? b.g : null;
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { error } = await db.from("link_cliques").insert({ slug, grupo, bot: !!b?.bot });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
