import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

// Endpoint LIDO PELOS COLETORES n8n (não pela UI). Protegido pelo mesmo
// segredo do /api/ingest (x-ingest-secret ou ?secret=), pra não expor a
// service_role dentro do workflow n8n. Retorna as keywords ativas do perfil.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const provided =
    request.headers.get("x-ingest-secret") || url.searchParams.get("secret") || "";
  const expected = process.env.INGEST_SECRET || process.env.CRON_SECRET || "";
  if (!expected || provided !== expected) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const slug = url.searchParams.get("slug");
  const perfilId = url.searchParams.get("perfil_id");
  if (!slug && !perfilId) {
    return NextResponse.json({ error: "slug ou perfil_id obrigatório" }, { status: 400 });
  }

  const admin = createAdminClient();
  let query = admin.from("perfis").select("id, slug, keywords, ativo");
  query = perfilId ? query.eq("id", perfilId) : query.eq("slug", slug!);
  const { data, error } = await query.maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "perfil não encontrado" }, { status: 404 });

  const keywords = Array.isArray(data.keywords) ? data.keywords : [];
  return NextResponse.json({ slug: data.slug, ativo: data.ativo, count: keywords.length, keywords });
}
