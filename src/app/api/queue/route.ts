import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

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
      offer:offers(id, title, image_url, price_current, price_original, discount_pct, platform, affiliate_url, url, ai_caption)
    `)
    .in("status", ["pending", "publishing", "error"])
    .order("position", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: campaigns } = await db
    .from("campaigns")
    .select("id, name, is_active, timer_minutes");

  return NextResponse.json({ items: items ?? [], campaigns: campaigns ?? [] });
}
