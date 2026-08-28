import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { PhoneUpdateSchema, parseOrError } from "@/lib/schemas";

const EVO_URL = process.env.EVOLUTION_API_URL!;
const EVO_KEY = process.env.EVOLUTION_API_KEY!;

type Params = { params: Promise<{ id: string; phoneId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { phoneId } = await params;
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = await request.json().catch(() => ({}));
  const parsed = parseOrError(PhoneUpdateSchema, raw);
  if (!parsed.ok) return NextResponse.json(parsed.error, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (parsed.data.label !== undefined) patch.label = parsed.data.label?.trim() || null;
  if (parsed.data.is_admin !== undefined) patch.is_admin = parsed.data.is_admin;

  const { data, error } = await db
    .from("campaign_phones")
    .update(patch)
    .eq("id", phoneId)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_: Request, { params }: Params) {
  const { phoneId } = await params;
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const phoneResult = await db
    .from("campaign_phones")
    .select("evolution_instance_id")
    .eq("id", phoneId)
    .single();
  const phone = phoneResult.data as { evolution_instance_id: string } | null;

  if (phone?.evolution_instance_id) {
    await fetch(`${EVO_URL}/instance/delete/${phone.evolution_instance_id}`, {
      method: "DELETE",
      headers: { apikey: EVO_KEY },
    }).catch(() => {});
  }

  const { error } = await db.from("campaign_phones").delete().eq("id", phoneId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
