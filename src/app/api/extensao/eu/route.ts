import { NextResponse } from "next/server";
import { acessoPorToken } from "@/lib/extensao-auth";
import { LOJAS_SESSAO } from "@/lib/lojas-sessao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET  Authorization: Bearer bgx_...  → a extensão descobre a qual perfil está ligada e quais lojas existem.
export async function GET(request: Request) {
  const a = await acessoPorToken(request);
  if (!a) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ perfil: { slug: a.perfilSlug, nome: a.perfilNome }, lojas: LOJAS_SESSAO });
}

// DELETE  Authorization: Bearer bgx_...  → "Desconectar" no popup: o próprio código se revoga.
export async function DELETE(request: Request) {
  const a = await acessoPorToken(request);
  if (!a) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { createAdminClient } = await import("@/lib/supabase/admin");
  await createAdminClient().from("extensao_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", a.tokenId);
  return NextResponse.json({ ok: true });
}
