import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { GroupTogglePatchSchema, parseOrError } from "@/lib/schemas";

type Params = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data, error } = await db
    .from("campaign_groups")
    .select("*")
    .eq("campaign_id", id)
    .order("group_name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const raw = await request.json().catch(() => ({}));
  const parsed = parseOrError(GroupTogglePatchSchema, raw);
  if (!parsed.ok) return NextResponse.json(parsed.error, { status: 400 });
  const { group_id, is_enabled } = parsed.data;
  const { data, error } = await db
    .from("campaign_groups")
    .update({ is_enabled })
    .eq("id", group_id)
    .eq("campaign_id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
