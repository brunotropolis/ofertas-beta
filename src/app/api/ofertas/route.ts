import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { OfferCreateSchema, parseOrError } from "@/lib/schemas";

export async function GET(request: Request) {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");

  let query = db
    .from("offers")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = await request.json().catch(() => ({}));
  const parsed = parseOrError(OfferCreateSchema, raw);
  if (!parsed.ok) return NextResponse.json(parsed.error, { status: 400 });
  const {
    url,
    affiliate_url,
    platform,
    title,
    price_current,
    price_original,
    discount_pct,
    image_url,
    ai_caption,
    extra_text,
    campaign_ids,
    scheduled_at,
  } = parsed.data;

  // 1. Save offer
  const { data: offer, error: offerError } = await db
    .from("offers")
    .insert({
      source: "manual",
      platform,
      url,
      affiliate_url: affiliate_url || url,
      title,
      price_current: price_current ? Number(price_current) : null,
      price_original: price_original ? Number(price_original) : null,
      discount_pct: discount_pct ? Number(discount_pct) : null,
      image_url,
      ai_caption,
      extra_text,
      status: campaign_ids?.length ? "queued" : "draft",
      created_by: user.id,
    })
    .select()
    .single();

  if (offerError) return NextResponse.json({ error: offerError.message }, { status: 500 });

  // 2. Add to queue if campaigns selected
  if (campaign_ids?.length) {
    // Get next position in queue
    const { data: lastItem } = await db
      .from("publication_queue")
      .select("position")
      .order("position", { ascending: false })
      .limit(1)
      .single();

    const nextPosition = ((lastItem?.position ?? 0) as number) + 1;

    await db.from("publication_queue").insert({
      offer_id: offer.id,
      campaign_ids,
      position: nextPosition,
      scheduled_at: scheduled_at || null,
      status: "pending",
      created_by: user.id,
    });
  }

  return NextResponse.json(offer, { status: 201 });
}
