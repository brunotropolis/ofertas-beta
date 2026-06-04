import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { PhoneCreateSchema, parseOrError } from "@/lib/schemas";

const EVO_URL = process.env.EVOLUTION_API_URL!;
const EVO_KEY = process.env.EVOLUTION_API_KEY!;

type Params = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data, error } = await db
    .from("campaign_phones")
    .select("*")
    .eq("campaign_id", id)
    .order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const raw = await request.json().catch(() => ({}));
  const parsed = parseOrError(PhoneCreateSchema, raw);
  if (!parsed.ok) return NextResponse.json(parsed.error, { status: 400 });
  const { phone_number, is_admin } = parsed.data;

  const instanceName = `bg-${id.slice(0, 8)}-${Date.now()}`;

  const evoRes = await fetch(`${EVO_URL}/instance/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: EVO_KEY },
    body: JSON.stringify({ instanceName, qrcode: true, integration: "WHATSAPP-BAILEYS" }),
  });

  if (!evoRes.ok) {
    const err = await evoRes.text();
    return NextResponse.json({ error: `Evolution API: ${err}` }, { status: 500 });
  }

  const { data, error } = await db
    .from("campaign_phones")
    .insert({
      campaign_id: id,
      phone_number,
      evolution_instance_id: instanceName,
      is_admin: is_admin ?? false,
      is_active: false,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
