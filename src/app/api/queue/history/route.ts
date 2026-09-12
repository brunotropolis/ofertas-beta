import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * GET /api/queue/history?limit=100
 * Histórico de envios (publication_log) com nome da campanha e dados da oferta.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get("limit") ?? 200) || 200, 500);

  const { data: logs, error } = await db
    .from("publication_log")
    .select(`
      id, queue_id, campaign_id, group_jid, group_name, phone_used, status, sent_at, error_message,
      queue:publication_queue(offer:offers(title, image_url, platform, affiliate_url, url))
    `)
    .order("sent_at", { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: campaigns } = await db.from("campaigns").select("id, name");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nameById = new Map(((campaigns ?? []) as any[]).map((c) => [c.id, c.name]));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items = ((logs ?? []) as any[]).map((l) => ({
    ...l,
    campaign_name: l.campaign_id ? nameById.get(l.campaign_id) ?? null : null,
    offer: l.queue?.offer ?? null,
    queue: undefined,
  }));

  // Resumo do dia (últimas 24h)
  const since = Date.now() - 24 * 3600_000;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const last24 = (logs ?? []).filter((l: any) => new Date(l.sent_at).getTime() >= since);
  const summary = {
    total_24h: last24.length,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    success_24h: last24.filter((l: any) => l.status === "success").length,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    error_24h: last24.filter((l: any) => l.status === "error").length,
  };

  return NextResponse.json({ items, summary });
}
