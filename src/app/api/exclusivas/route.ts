import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// GET /api/exclusivas?perfil=<id> — ofertas exclusivas do perfil (planilha da Amazon + links avulsos com prazo).
// DELETE /api/exclusivas?perfil=<id>&fonte=<nome> — apaga as que ainda não saíram de uma planilha inteira.
export async function GET(request: Request) {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const perfil = new URL(request.url).searchParams.get("perfil");
  if (!perfil) return NextResponse.json({ error: "perfil obrigatório" }, { status: 400 });

  const linhas: unknown[] = [];
  for (let de = 0; de < 3000; de += 1000) { // PostgREST corta em 1000
    const { data, error } = await db.from("offers")
      .select("id, title, image_url, price_current, price_original, discount_pct, status, promo_meta, affiliate_url, platform, created_at")
      .eq("perfil_id", perfil).not("promo_meta->exclusiva", "is", null)
      .order("created_at", { ascending: false }).range(de, de + 999);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    linhas.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  return NextResponse.json(linhas);
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sp = new URL(request.url).searchParams;
  const perfil = sp.get("perfil"), fonte = sp.get("fonte");
  if (!perfil || !fonte) return NextResponse.json({ error: "perfil e fonte obrigatórios" }, { status: 400 });
  const { data, error } = await db.from("offers").delete()
    .eq("perfil_id", perfil).eq("status", "draft").eq("promo_meta->exclusiva->>fonte", fonte).select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, apagadas: (data ?? []).length });
}
