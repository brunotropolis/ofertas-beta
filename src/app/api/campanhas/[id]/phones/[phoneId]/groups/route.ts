import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const EVO_URL = process.env.EVOLUTION_API_URL!;
const EVO_KEY = process.env.EVOLUTION_API_KEY!;

type Params = { params: Promise<{ id: string; phoneId: string }> };

export async function POST(_: Request, { params }: Params) {
  const { id: campaignId, phoneId } = await params;
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

  const instance = phone.evolution_instance_id;

  // Confere se a instância está conectada antes de puxar grupos
  const stateRes = await fetch(`${EVO_URL}/instance/connectionState/${instance}`, {
    headers: { apikey: EVO_KEY },
  }).catch(() => null);
  const stateJson = await stateRes?.json().catch(() => null);
  const state = stateJson?.instance?.state;
  if (state !== "open") {
    return NextResponse.json(
      { error: `WhatsApp desconectado (estado: ${state ?? "desconhecido"}). Reconecte o telefone e tente de novo.` },
      { status: 409 }
    );
  }

  // Esta versão do Evolution usa GET (não POST) pra fetchAllGroups
  const groupsRes = await fetch(
    `${EVO_URL}/group/fetchAllGroups/${instance}?getParticipants=false`,
    { method: "GET", headers: { apikey: EVO_KEY } }
  );

  if (!groupsRes.ok) {
    const body = await groupsRes.text().catch(() => "");
    return NextResponse.json(
      { error: `Evolution ${groupsRes.status}: ${body.slice(0, 200)}` },
      { status: 500 }
    );
  }

  const groups = await groupsRes.json().catch(() => []);
  if (!Array.isArray(groups)) {
    return NextResponse.json({ error: "Unexpected response", raw: groups }, { status: 500 });
  }

  // Baileys ainda não sincronizou os grupos (conexão recente)
  if (groups.length === 0) {
    return NextResponse.json({
      synced: 0,
      warning: "Nenhum grupo retornado ainda. Em conexão recente o WhatsApp leva alguns minutos pra sincronizar a lista de grupos — aguarde e tente de novo.",
    });
  }

  const toInsert = groups.map((g: { id: string; subject: string }) => ({
    campaign_id: campaignId,
    phone_id: phoneId,
    group_jid: g.id,
    group_name: g.subject ?? g.id,
    group_type: "group",
    is_enabled: false,
  }));

  if (toInsert.length === 0) return NextResponse.json({ synced: 0 });

  const { error } = await db
    .from("campaign_groups")
    .upsert(toInsert, { onConflict: "campaign_id,group_jid", ignoreDuplicates: true });

  if (error) {
    // Fallback: insert only new ones
    const existingResult = await db
      .from("campaign_groups")
      .select("group_jid")
      .eq("campaign_id", campaignId);
    const existingJids = new Set(
      ((existingResult.data ?? []) as { group_jid: string }[]).map((g: { group_jid: string }) => g.group_jid)
    );
    const newGroups = toInsert.filter((g) => !existingJids.has(g.group_jid));
    if (newGroups.length > 0) {
      await db.from("campaign_groups").insert(newGroups);
    }
    return NextResponse.json({ synced: newGroups.length });
  }

  return NextResponse.json({ synced: toInsert.length });
}
