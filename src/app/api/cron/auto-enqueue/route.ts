import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { autoEnqueueAll } from "@/lib/auto-enqueue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cron endpoint — abastece a fila (trickle) das campanhas com auto_enqueue=true.
 * Protegido por header X-Cron-Secret (env CRON_SECRET). Service_role bypassa RLS.
 * Chamado pelo n8n (ex: a cada 5min). O timer da campanha é quem espaça os posts;
 * este endpoint só garante que sempre há 1 oferta nova esperando, até o teto do dia.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET não configurado" }, { status: 503 });
  }
  const provided = request.headers.get("x-cron-secret");
  if (provided !== secret) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY não configurado" }, { status: 503 });
  }
  const db = createClient(supabaseUrl, serviceKey);

  try {
    const result = await autoEnqueueAll(db);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ error: "use POST" }, { status: 405 });
}
