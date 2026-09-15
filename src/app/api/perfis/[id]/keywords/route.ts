import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

// Palavras-chave de produto do nicho, no nível do PERFIL.
// Compartilhadas por todas as plataformas/campanhas do perfil; os coletores leem daqui.

export async function GET(_: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("perfis")
    .select("id, nome, keywords")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Perfil não encontrado" }, { status: 404 });
  return NextResponse.json({ id: data.id, nome: data.nome, keywords: data.keywords ?? [] });
}

export async function PUT(request: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = await request.json().catch(() => ({}));
  if (!Array.isArray(raw?.keywords)) {
    return NextResponse.json({ error: "keywords deve ser um array" }, { status: 400 });
  }
  // normaliza: string, trim, minúsculo, dedup, sem vazios, teto de 200
  const seen = new Set<string>();
  const keywords: string[] = [];
  for (const k of raw.keywords) {
    if (typeof k !== "string") continue;
    const t = k.trim().toLowerCase().replace(/\s+/g, " ");
    if (t.length < 2 || t.length > 60 || seen.has(t)) continue;
    seen.add(t);
    keywords.push(t);
    if (keywords.length >= 200) break;
  }

  const admin = createAdminClient();
  const { error } = await admin.from("perfis").update({ keywords }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, keywords });
}
