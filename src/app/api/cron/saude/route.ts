import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { saudePerfil } from "@/lib/saude";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/cron/saude — saúde de todos os perfis com WAHA (números, plataformas, disparo).
 * Chamado pelo n8n "OFERTAS | Alerta Saúde", que compara com a rodada anterior e manda
 * WhatsApp pro Bruno quando algo fica vermelho (e quando volta). Header x-cron-secret = CRON_SECRET.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET não configurado" }, { status: 503 });
  if (request.headers.get("x-cron-secret") !== secret) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY não configurado" }, { status: 503 });
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, { auth: { persistSession: false } });

  const { data: perfis } = await db.from("perfis").select("id, nome").not("waha_url", "is", null);
  const out = [];
  for (const p of (perfis ?? []) as { id: string; nome: string }[]) {
    const s = await saudePerfil(db, p.id);
    if (s) out.push({ perfil: p.nome, ...s });
  }
  return NextResponse.json({ perfis: out });
}
