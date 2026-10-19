import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

/**
 * GET /api/queue/history?since=ISO&until=ISO            → 1 item por POST (queue × campanha), somado no banco
 *                                                         (função historico_posts): grupos que receberam, erros, números.
 * GET /api/queue/history?queue_id=…&campaign_id=…        → detalhe do post: só os envios com ERRO (grupo + mensagem).
 * (Antes: 1 linha por envio, cortada em 1.000 — com 170 grupos por post isso cobria ~6 posts.)
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const db = supabase as Any;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const queueId = searchParams.get("queue_id");
  if (queueId) {
    let q = db.from("publication_log").select("group_name, group_jid, phone_used, error_message, sent_at")
      .eq("queue_id", queueId).eq("status", "error").order("sent_at", { ascending: true }).limit(500);
    const camp = searchParams.get("campaign_id");
    if (camp) q = q.eq("campaign_id", camp);
    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ erros: data ?? [] });
  }

  const since = searchParams.get("since") ?? new Date(Date.now() - 86400_000).toISOString();
  const until = searchParams.get("until") ?? new Date().toISOString();
  const { data: posts, error } = await db.rpc("historico_posts", { p_since: since, p_until: until });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const lista = (posts ?? []) as Any[];
  const qids = [...new Set(lista.map((p) => p.queue_id).filter(Boolean))];
  const ofertaDe = new Map<string, Any>();
  for (let i = 0; i < qids.length; i += 150) {
    const { data } = await db.from("publication_queue")
      .select("id, offer:offers(title, image_url, platform, kind)")
      .in("id", qids.slice(i, i + 150));
    for (const r of (data ?? []) as Any[]) ofertaDe.set(r.id, r.offer);
  }
  const { data: campaigns } = await db.from("campaigns").select("id, name");
  const nomeCamp = new Map(((campaigns ?? []) as Any[]).map((c) => [c.id, c.name]));

  const items = lista.map((p) => ({
    queue_id: p.queue_id, campaign_id: p.campaign_id,
    campaign_name: p.campaign_id ? nomeCamp.get(p.campaign_id) ?? null : null,
    primeiro: p.primeiro, ultimo: p.ultimo,
    sucesso: Number(p.sucesso), erros: Number(p.erros),
    numeros: p.numeros ?? [], erro_exemplo: p.erro_exemplo,
    offer: p.queue_id ? ofertaDe.get(p.queue_id) ?? null : null,
  }));
  return NextResponse.json({ items });
}
