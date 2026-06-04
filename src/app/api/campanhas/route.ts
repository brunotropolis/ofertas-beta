import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { CampaignCreateSchema, parseOrError } from "@/lib/schemas";

export async function GET() {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data, error } = await db
    .from("campaigns")
    .select("*, campaign_phones(count), campaign_groups(count)")
    .order("created_at", { ascending: false });
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
  const parsed = parseOrError(CampaignCreateSchema, raw);
  if (!parsed.ok) return NextResponse.json(parsed.error, { status: 400 });
  const { data, error } = await db
    .from("campaigns")
    .insert({ ...parsed.data, created_by: user.id })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
