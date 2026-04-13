import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const EVO_URL = process.env.EVOLUTION_API_URL!;
const EVO_KEY = process.env.EVOLUTION_API_KEY!;

type Params = { params: Promise<{ id: string; phoneId: string }> };

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
