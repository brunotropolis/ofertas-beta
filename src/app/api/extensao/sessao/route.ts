import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { acessoPorToken, campanhaPrincipal, segredoAntigoOk } from "@/lib/extensao-auth";
import { lojaSessao, sessaoValida } from "@/lib/lojas-sessao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Sessão de afiliado vinda da extensão "Buscador Geek" (16/Nov; acesso por pessoa 18/Nov). Quando o login de uma loja
// (lib/lojas-sessao.ts) muda no Chrome da pessoa, a extensão manda a sessão nova pra cá. Guarda criptografado em
// campaign_platforms.cookie_enc (mesmo cofre da aba Plataformas), na campanha principal do perfil.
//   POST { loja, cookie }            Authorization: Bearer bgx_...  → grava no perfil DO CÓDIGO (o body não escolhe perfil)
//   POST { perfil, loja, cookie }    x-extensao-secret (antigo, perfis instalados antes de 18/11)
//   GET ?perfil=&loja=               x-extensao-secret (robôs do n8n e o painel leem a sessão). Código pessoal não lê.

async function perfilPorSlug(slug: string) {
  const db = createAdminClient();
  const { data } = await db.from("perfis").select("id").eq("slug", slug).maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

export async function POST(request: Request) {
  const token = await acessoPorToken(request);
  const antigo = !token && segredoAntigoOk(request);
  if (!token && !antigo) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const b = await request.json().catch(() => null);
  const loja = lojaSessao(String(b?.loja || ""));
  const cookie = String(b?.cookie || "");
  if (!loja) return NextResponse.json({ error: "loja inválida" }, { status: 400 });
  if (!sessaoValida(loja, cookie)) return NextResponse.json({ error: "sessão incompleta (não está logado?)" }, { status: 400 });

  const perfilId = token ? token.perfilId : await perfilPorSlug(String(b?.perfil || ""));
  if (!perfilId) return NextResponse.json({ error: "perfil inválido" }, { status: 400 });
  const id = await campanhaPrincipal(perfilId);
  if (!id) return NextResponse.json({ error: "perfil sem campanha" }, { status: 404 });

  const db = createAdminClient();
  const { error } = await db.rpc("save_platform_creds", { p_campaign_id: id, p_platform: loja.id, p_cookie: cookie });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, perfil: token?.perfilSlug ?? b?.perfil, loja: loja.id, em: new Date().toISOString() });
}

export async function GET(request: Request) {
  if (!segredoAntigoOk(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const u = new URL(request.url);
  const loja = lojaSessao(u.searchParams.get("loja") || "");
  const perfilId = await perfilPorSlug(u.searchParams.get("perfil") || "");
  if (!loja || !perfilId) return NextResponse.json({ error: "perfil ou loja inválido" }, { status: 400 });
  const id = await campanhaPrincipal(perfilId);
  if (!id) return NextResponse.json({ error: "perfil sem campanha" }, { status: 404 });
  const db = createAdminClient();
  const [{ data: sec }, { data: row }] = await Promise.all([
    db.rpc("get_platform_secrets", { p_campaign_id: id, p_platform: loja.id }),
    db.from("campaign_platforms").select("updated_at").eq("campaign_id", id).eq("platform", loja.id).maybeSingle(),
  ]);
  const cookie = Array.isArray(sec) ? sec[0]?.cookie : null;
  if (!cookie) return NextResponse.json({ error: "sem sessão salva" }, { status: 404 });
  return NextResponse.json({ cookie, atualizado_em: row?.updated_at ?? null });
}
