import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// Lista de produtos que o robô não posta (26/Nov). Acesso pela sessão do painel: a tabela só abre pra operador (RLS).
// GET    /api/bloqueados            → itens
// POST   /api/bloqueados            → { termo, excecao?, perfil_id?, motivo? }
// PATCH  /api/bloqueados?id=<id>    → { ativo }
// DELETE /api/bloqueados?id=<id>
async function sessao() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { db: supabase as any, user };
}

export async function GET() {
  const { db, user } = await sessao();
  if (!user) return NextResponse.json({ error: "Faça login de novo" }, { status: 401 });
  const { data, error } = await db.from("produtos_bloqueados").select("id, termo, excecao, perfil_id, motivo, ativo, criado_em").order("criado_em", { ascending: false }).limit(2000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(request: Request) {
  const { db, user } = await sessao();
  if (!user) return NextResponse.json({ error: "Faça login de novo" }, { status: 401 });
  const b = await request.json().catch(() => ({}));
  const termo = String(b.termo ?? "").trim().slice(0, 120);
  if (termo.length < 3) return NextResponse.json({ error: "Escreva pelo menos 3 letras do produto" }, { status: 400 });
  const linha = {
    termo,
    excecao: String(b.excecao ?? "").trim().slice(0, 200) || null,
    perfil_id: b.perfil_id || null,
    motivo: String(b.motivo ?? "").trim().slice(0, 200) || null,
  };
  const { data, error } = await db.from("produtos_bloqueados").insert(linha).select("id, termo, excecao, perfil_id, motivo, ativo, criado_em").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PATCH(request: Request) {
  const { db, user } = await sessao();
  if (!user) return NextResponse.json({ error: "Faça login de novo" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  const b = await request.json().catch(() => ({}));
  if (!id || typeof b.ativo !== "boolean") return NextResponse.json({ error: "id e ativo obrigatórios" }, { status: 400 });
  const { error } = await db.from("produtos_bloqueados").update({ ativo: b.ativo }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const { db, user } = await sessao();
  if (!user) return NextResponse.json({ error: "Faça login de novo" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
  const { error } = await db.from("produtos_bloqueados").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
