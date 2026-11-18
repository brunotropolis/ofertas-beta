import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

// Acesso da extensão "Buscador Geek" (18/Nov/2026).
//  - novo: código pessoal `bgx_...` gerado no painel (/extensao), preso a uma pessoa + um perfil. Só o hash fica no banco.
//  - antigo: header x-extensao-secret = EXTENSAO_SECRET (perfis instalados antes de 18/11 e os robôs do n8n que LEEM
//    a sessão). Continua valendo; o código pessoal não lê sessão de volta, só grava.

export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

export function novoToken() {
  const token = "bgx_" + randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token), prefixo: token.slice(4, 12) };
}

export function segredoAntigoOk(request: Request) {
  const s = process.env.EXTENSAO_SECRET;
  const h = request.headers.get("x-extensao-secret") || "";
  if (!s || s.length < 24 || h.length !== s.length) return false;
  return timingSafeEqual(Buffer.from(h), Buffer.from(s));
}

export type AcessoToken = { tokenId: string; userId: string; perfilId: string; perfilSlug: string; perfilNome: string };

/** Authorization: Bearer bgx_... → dono + perfil (null se não existe / revogado) */
export async function acessoPorToken(request: Request): Promise<AcessoToken | null> {
  const m = (request.headers.get("authorization") || "").match(/^Bearer\s+(bgx_[A-Za-z0-9_-]{20,80})$/);
  if (!m) return null;
  const db = createAdminClient();
  const { data } = await db
    .from("extensao_tokens")
    .select("id, user_id, perfil_id, revoked_at, perfis(slug, nome)")
    .eq("token_hash", hashToken(m[1]))
    .maybeSingle();
  if (!data || data.revoked_at) return null;
  const pf = (Array.isArray(data.perfis) ? data.perfis[0] : data.perfis) as { slug: string; nome: string } | null;
  if (!pf) return null;
  // marca uso (não bloqueia a resposta se falhar)
  db.from("extensao_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", data.id).then(() => {});
  return { tokenId: data.id, userId: data.user_id, perfilId: data.perfil_id, perfilSlug: pf.slug, perfilNome: pf.nome };
}

/** perfis que a pessoa logada pode conectar: admin/operator = todos; outros = os de perfil_membros */
export async function perfisDoUsuario(userId: string) {
  const db = createAdminClient();
  const { data: prof } = await db.from("profiles").select("role").eq("id", userId).maybeSingle();
  const { data: todos } = await db.from("perfis").select("id, slug, nome").eq("ativo", true).order("nome");
  if (prof?.role === "admin" || prof?.role === "operator") return todos ?? [];
  const { data: mem } = await db.from("perfil_membros").select("perfil_id").eq("user_id", userId);
  const ids = new Set((mem ?? []).map((m) => m.perfil_id as string));
  return (todos ?? []).filter((p) => ids.has(p.id as string));
}

/** campanha principal do perfil (a mais antiga), onde a sessão fica guardada */
export async function campanhaPrincipal(perfilId: string) {
  const db = createAdminClient();
  const { data } = await db.from("campaigns").select("id").eq("perfil_id", perfilId).order("created_at").limit(1).maybeSingle();
  return (data?.id as string | undefined) ?? null;
}
