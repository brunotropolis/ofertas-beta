import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export async function GET(request: Request) {
  const supabase = await createClient();
  const db = supabase as Any;
  const perfil = new URL(request.url).searchParams.get("perfil");

  const { data: items, error } = await db
    .from("publication_queue")
    .select(`
      id,
      offer_id,
      campaign_ids,
      position,
      scheduled_at,
      status,
      published_at,
      error_message,
      created_at,
      created_by,
      offer:offers(id, title, image_url, price_current, price_original, discount_pct, platform, affiliate_url, url, ai_caption, perfil_id)
    `)
    .in("status", ["pending", "publishing", "error"])
    .order("position", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(300);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const filtered: Any[] = perfil
    ? ((items ?? []) as Any[]).filter((i) => i.offer?.perfil_id === perfil)
    : ((items ?? []) as Any[]);

  let campQuery = db.from("campaigns").select("id, name, is_active, timer_minutes");
  if (perfil) campQuery = campQuery.eq("perfil_id", perfil);
  const { data: campaigns } = await campQuery;
  const campList = (campaigns ?? []) as Any[];
  const campById = new Map<string, Any>(campList.map((c) => [c.id, c]));

  // ── Hora estimada de publicação (ETA) ────────────────────────────────────
  // Pra cada campanha ATIVA: último envio bem-sucedido → próximo horário livre.
  // Caminha os itens na ordem e reserva um slot por campanha, espaçado pelo timer.
  const activeIds = campList.filter((c) => c.is_active).map((c) => c.id);
  const nextFree = new Map<string, number>(); // campaignId -> ms do próximo slot livre
  const now = Date.now();

  if (activeIds.length) {
    // último sucesso por campanha
    const { data: logs } = await db
      .from("publication_log")
      .select("campaign_id, sent_at, status")
      .in("campaign_id", activeIds)
      .eq("status", "success")
      .order("sent_at", { ascending: false })
      .limit(1000);
    const lastSuccess = new Map<string, number>();
    for (const l of (logs ?? []) as Any[]) {
      if (l.campaign_id && !lastSuccess.has(l.campaign_id)) {
        lastSuccess.set(l.campaign_id, new Date(l.sent_at).getTime());
      }
    }
    for (const id of activeIds) {
      const c = campById.get(id);
      const timerMs = (c?.timer_minutes ?? 30) * 60_000;
      const last = lastSuccess.get(id);
      // próximo slot = quando a campanha fica "due" de novo (ou agora)
      nextFree.set(id, Math.max(now, last != null ? last + timerMs : now));
    }
  }

  const withEta = filtered.map((item) => {
    const sched = item.scheduled_at ? new Date(item.scheduled_at).getTime() : 0;
    let itemEta: number | null = null;
    for (const cid of item.campaign_ids || []) {
      if (!nextFree.has(cid)) continue; // campanha inativa/fora do perfil → ignora
      const c = campById.get(cid);
      const timerMs = (c?.timer_minutes ?? 30) * 60_000;
      const slot = Math.max(nextFree.get(cid)!, sched, now);
      nextFree.set(cid, slot + timerMs);
      itemEta = itemEta == null ? slot : Math.max(itemEta, slot);
    }
    const hasActive = (item.campaign_ids || []).some((c: string) => nextFree.has(c) || campById.get(c)?.is_active);
    return { ...item, eta: itemEta ? new Date(itemEta).toISOString() : null, has_active_campaign: hasActive };
  });

  return NextResponse.json({ items: withEta, campaigns: campList });
}
