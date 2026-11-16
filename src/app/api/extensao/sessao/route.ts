import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Sessão de afiliado vinda da extensão "Sessões de Afiliado" (16/Nov). Cada perfil do Chrome (Manual, Buscador Geek)
// tem a extensão instalada; quando o login do Mercado Livre ou da Amazon muda, ela manda a sessão nova pra cá.
// Guarda criptografado em campaign_platforms.cookie_enc (mesmo cofre da aba Plataformas), na campanha principal do perfil.
//   POST { perfil, loja, cookie, conta? }  grava            GET ?perfil=&loja=  devolve { cookie, atualizado_em }
// Auth: header x-extensao-secret == EXTENSAO_SECRET (segredo próprio desta rota). Sem ele, 401.
const PERFIS = ["ofertas-maternas", "buscador-geek"] as const;
const LOJAS = ["ml", "amazon"] as const;

function autorizado(request: Request) {
  const s = process.env.EXTENSAO_SECRET;
  const h = request.headers.get("x-extensao-secret") || "";
  if (!s || s.length < 24 || h.length !== s.length) return false;
  return timingSafeEqual(Buffer.from(h), Buffer.from(s));
}

async function campanhaDoPerfil(slug: string) {
  const db = createAdminClient();
  const { data: pf } = await db.from("perfis").select("id").eq("slug", slug).maybeSingle();
  if (!pf) return { db, id: null };
  const { data: c } = await db.from("campaigns").select("id").eq("perfil_id", pf.id).order("created_at").limit(1).maybeSingle();
  return { db, id: (c?.id as string | undefined) ?? null };
}

export async function POST(request: Request) {
  if (!autorizado(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = await request.json().catch(() => null);
  const perfil = String(b?.perfil || ""), loja = String(b?.loja || ""), cookie = String(b?.cookie || "");
  if (!PERFIS.includes(perfil as never) || !LOJAS.includes(loja as never)) return NextResponse.json({ error: "perfil ou loja inválido" }, { status: 400 });
  // sessão mínima: ML precisa do ssid (login), Amazon do at-acbbr / session-token
  const ok = loja === "ml" ? /(^|;\s*)ssid=/.test(cookie) : /(^|;\s*)(at-acbbr|session-token)=/.test(cookie);
  if (!ok || cookie.length > 20000) return NextResponse.json({ error: "sessão incompleta (não está logado?)" }, { status: 400 });
  const { db, id } = await campanhaDoPerfil(perfil);
  if (!id) return NextResponse.json({ error: "perfil sem campanha" }, { status: 404 });
  const { error } = await db.rpc("save_platform_creds", { p_campaign_id: id, p_platform: loja, p_cookie: cookie });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, perfil, loja, conta: b?.conta ? String(b.conta).slice(0, 60) : null, em: new Date().toISOString() });
}

export async function GET(request: Request) {
  if (!autorizado(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const u = new URL(request.url);
  const perfil = u.searchParams.get("perfil") || "", loja = u.searchParams.get("loja") || "";
  if (!PERFIS.includes(perfil as never) || !LOJAS.includes(loja as never)) return NextResponse.json({ error: "perfil ou loja inválido" }, { status: 400 });
  const { db, id } = await campanhaDoPerfil(perfil);
  if (!id) return NextResponse.json({ error: "perfil sem campanha" }, { status: 404 });
  const [{ data: sec }, { data: row }] = await Promise.all([
    db.rpc("get_platform_secrets", { p_campaign_id: id, p_platform: loja }),
    db.from("campaign_platforms").select("updated_at").eq("campaign_id", id).eq("platform", loja).maybeSingle(),
  ]);
  const cookie = Array.isArray(sec) ? sec[0]?.cookie : null;
  if (!cookie) return NextResponse.json({ error: "sem sessão salva" }, { status: 404 });
  return NextResponse.json({ cookie, atualizado_em: row?.updated_at ?? null });
}
