import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/auth/esqueci { email } — "esqueci minha senha" do painel.
 * Só envia pra quem é admin/operator do painel (profiles.role). A resposta é SEMPRE a mesma,
 * pra não revelar quem tem conta. Link de uso único (recovery do Supabase) → /redefinir-senha?token_hash=…
 * E-mail sai pelo Resend (RESEND_API_KEY, domínio manualdorecemnascido.com.br).
 */
const ok = () => NextResponse.json({ ok: true });
const tentativas = new Map<string, number[]>(); // ip → horários (anti-abuso simples, por instância)

export async function POST(request: Request) {
  const ip = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "?";
  const agora = Date.now();
  const lista = (tentativas.get(ip) || []).filter((t) => agora - t < 15 * 60_000);
  if (lista.length >= 5) return ok();
  tentativas.set(ip, [...lista, agora]);

  const parsed = z.object({ email: z.string().email().max(200) }).safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return ok();
  const email = parsed.data.email.trim().toLowerCase();

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  if (!serviceKey || !resendKey) {
    console.error("[esqueci] faltando SUPABASE_SERVICE_ROLE_KEY ou RESEND_API_KEY");
    return ok();
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey) as any;

  const { data: link, error } = await admin.auth.admin.generateLink({ type: "recovery", email });
  if (error || !link?.user?.id || !link?.properties?.hashed_token) return ok(); // e-mail sem conta

  const { data: perfil } = await admin.from("profiles").select("role").eq("id", link.user.id).maybeSingle();
  if (!perfil || !["admin", "operator"].includes(perfil.role)) return ok(); // conta sem acesso ao painel

  const base = process.env.PANEL_PUBLIC_URL || "https://app.buscadorgeek.com.br";
  const url = `${base}/redefinir-senha?token_hash=${encodeURIComponent(link.properties.hashed_token)}`;
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#222;max-width:480px">
    <p>Oi! Recebemos um pedido pra trocar a senha do painel de ofertas.</p>
    <p><a href="${url}" style="display:inline-block;background:#f26522;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">Criar nova senha</a></p>
    <p style="color:#666;font-size:13px">O link vale por 1 hora e só funciona uma vez. Se não foi você, é só ignorar este e-mail.</p></div>`;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Painel de Ofertas <no-reply@manualdorecemnascido.com.br>",
      to: [email],
      subject: "Trocar a senha do painel de ofertas",
      html,
    }),
  });
  if (!r.ok) console.error("[esqueci] resend", r.status, (await r.text()).slice(0, 200));
  return ok();
}
