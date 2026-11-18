import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { novoToken, perfisDoUsuario } from "@/lib/extensao-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Códigos da extensão da pessoa LOGADA (tela /extensao). Só mexe nos próprios códigos.
//   GET                         → { perfis (que pode conectar), tokens (os dela, sem o código) }
//   POST { perfil_id, nome }    → { token } (aparece uma vez só; no banco fica o hash)
//   DELETE ?id=                 → revoga
async function usuario() {
  const sb = await createClient();
  const { data } = await sb.auth.getUser();
  return data.user;
}

export async function GET() {
  const u = await usuario();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = createAdminClient();
  const [perfis, { data: tokens }] = await Promise.all([
    perfisDoUsuario(u.id),
    db
      .from("extensao_tokens")
      .select("id, nome, prefixo, created_at, last_used_at, revoked_at, perfis(nome)")
      .eq("user_id", u.id)
      .is("revoked_at", null)
      .order("created_at", { ascending: false }),
  ]);
  return NextResponse.json({ perfis, tokens: tokens ?? [] });
}

export async function POST(request: Request) {
  const u = await usuario();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = await request.json().catch(() => null);
  const perfilId = String(b?.perfil_id || "");
  const nome = String(b?.nome || "Chrome").trim().slice(0, 60) || "Chrome";
  const perfis = await perfisDoUsuario(u.id);
  if (!perfis.some((p) => p.id === perfilId)) return NextResponse.json({ error: "perfil não liberado pra você" }, { status: 403 });
  const t = novoToken();
  const db = createAdminClient();
  const { error } = await db.from("extensao_tokens").insert({ user_id: u.id, perfil_id: perfilId, nome, token_hash: t.hash, prefixo: t.prefixo });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ token: t.token });
}

export async function DELETE(request: Request) {
  const u = await usuario();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id") || "";
  const db = createAdminClient();
  const { error } = await db.from("extensao_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", id).eq("user_id", u.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
