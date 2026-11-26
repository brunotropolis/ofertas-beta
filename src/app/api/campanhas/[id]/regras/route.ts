import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { lerRegras } from "@/lib/regras-campanha";

// Regras de produto da campanha (26/Nov): categorias com cota/teto, palavras, marcas boas e filtros.
// GET   /api/campanhas/[id]/regras  → { regras }
// PATCH /api/campanhas/[id]/regras  → { regras } (null apaga)
type Params = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Faça login de novo" }, { status: 401 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).from("campaigns").select("regras").eq("id", id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ regras: lerRegras(data?.regras) });
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Faça login de novo" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const regras = body?.regras === null ? null : lerRegras(body?.regras);
  if (body?.regras !== null && !regras) return NextResponse.json({ error: "Regras inválidas" }, { status: 400 });
  if (regras) {
    if (regras.categorias.length > 40) return NextResponse.json({ error: "No máximo 40 categorias" }, { status: 400 });
    for (const c of regras.categorias) {
      if (c.meta < 0 || c.meta > 100 || (c.teto != null && (c.teto < 0 || c.teto > 100))) return NextResponse.json({ error: `Cota e teto de "${c.nome}" vão de 0 a 100` }, { status: 400 });
      if (!c.palavras.length && !c.loja) return NextResponse.json({ error: `"${c.nome}" precisa de pelo menos uma palavra (ou uma loja)` }, { status: 400 });
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).from("campaigns").update({ regras }).eq("id", id).select("regras").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ regras: lerRegras(data?.regras) });
}
