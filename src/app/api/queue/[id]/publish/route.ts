import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { publishQueueItemForCampaign } from "@/lib/dispatcher";

type Params = { params: Promise<{ id: string }> };

/**
 * Publica AGORA um queue item específico em todas as campanhas dele
 * que ainda não receberam. Ignora timer.
 */
export async function POST(_: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: item } = await db
    .from("publication_queue")
    .select("id, offer_id, campaign_ids")
    .eq("id", id)
    .maybeSingle();

  if (!item) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Já publicado por campanha?
  const { data: logs } = await db
    .from("publication_log")
    .select("campaign_id, status")
    .eq("queue_id", id);

  const doneCampaigns = new Set(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((logs ?? []) as any[])
      .filter((l) => l.status === "success" && l.campaign_id)
      .map((l) => l.campaign_id as string)
  );

  const pendingCampaignIds = (item.campaign_ids as string[]).filter(
    (cid) => !doneCampaigns.has(cid)
  );

  if (pendingCampaignIds.length === 0) {
    return NextResponse.json({ error: "já publicado em todas as campanhas" }, { status: 400 });
  }

  const { data: camps } = await db
    .from("campaigns")
    .select("id, name, timer_minutes")
    .in("id", pendingCampaignIds);

  await db.from("publication_queue").update({ status: "publishing" }).eq("id", id);

  const results: {
    campaign_id: string;
    campaign_name: string;
    successes: number;
    failures: number;
    error?: string;
  }[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const c of (camps ?? []) as any[]) {
    try {
      const { successes, failures } = await publishQueueItemForCampaign(
        db,
        { id: item.id, offer_id: item.offer_id, campaign_ids: item.campaign_ids },
        c
      );
      results.push({
        campaign_id: c.id,
        campaign_name: c.name,
        successes,
        failures,
      });
    } catch (err) {
      results.push({
        campaign_id: c.id,
        campaign_name: c.name,
        successes: 0,
        failures: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Se ainda tá em publishing (sem ter virado published no publishItem), volta pra pending
  const { data: fresh } = await db
    .from("publication_queue")
    .select("status")
    .eq("id", id)
    .maybeSingle();
  if (fresh && (fresh as { status: string }).status === "publishing") {
    await db.from("publication_queue").update({ status: "pending" }).eq("id", id);
  }

  return NextResponse.json({ results });
}
