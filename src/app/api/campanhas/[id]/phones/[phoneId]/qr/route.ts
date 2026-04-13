import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const EVO_URL = process.env.EVOLUTION_API_URL!;
const EVO_KEY = process.env.EVOLUTION_API_KEY!;

type Params = { params: Promise<{ id: string; phoneId: string }> };

export async function GET(_: Request, { params }: Params) {
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

  if (!phone) return NextResponse.json({ error: "Phone not found" }, { status: 404 });

  // Check connection state
  const stateRes = await fetch(
    `${EVO_URL}/instance/connectionState/${phone.evolution_instance_id}`,
    { headers: { apikey: EVO_KEY } }
  );
  const state = await stateRes.json().catch(() => ({}));

  if (state?.instance?.state === "open") {
    await db
      .from("campaign_phones")
      .update({ is_active: true, connected_at: new Date().toISOString() })
      .eq("id", phoneId);
    return NextResponse.json({ connected: true });
  }

  // Get QR code
  const qrRes = await fetch(
    `${EVO_URL}/instance/connect/${phone.evolution_instance_id}`,
    { headers: { apikey: EVO_KEY } }
  );
  const qrData = await qrRes.json().catch(() => ({}));

  return NextResponse.json({ connected: false, qr: qrData.base64 ?? qrData.code ?? null });
}
