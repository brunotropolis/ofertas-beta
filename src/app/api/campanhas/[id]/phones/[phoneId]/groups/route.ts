import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const EVO_URL = process.env.EVOLUTION_API_URL!;
const EVO_KEY = process.env.EVOLUTION_API_KEY!;

export const maxDuration = 60;

type Params = { params: Promise<{ id: string; phoneId: string }> };

// Busca o nome (subject) de um grupo. Fallback = JID se falhar.
async function getGroupName(instance: string, jid: string): Promise<string> {
  try {
    const res = await fetch(
      `${EVO_URL}/group/findGroupInfos/${instance}?groupJid=${encodeURIComponent(jid)}`,
      { headers: { apikey: EVO_KEY } }
    );
    if (!res.ok) return jid;
    const info = await res.json().catch(() => null);
    return info?.subject || jid;
  } catch {
    return jid;
  }
}

// Processa uma lista em lotes de N (concorrência limitada)
async function inBatches<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    const batch = items.slice(i, i + size);
    out.push(...(await Promise.all(batch.map(fn))));
  }
  return out;
}

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

  // 1. Checa conexão
  const stateRes = await fetch(`${EVO_URL}/instance/connectionState/${instance}`, {
    headers: { apikey: EVO_KEY },
  }).catch(() => null);
  const stateJson = await stateRes?.json().catch(() => null);
  if (stateJson?.instance?.state !== "open") {
    return NextResponse.json(
      { error: `WhatsApp desconectado (${stateJson?.instance?.state ?? "?"}). Reconecte e tente de novo.` },
      { status: 409 }
    );
  }

  // 2. Lista as conversas e filtra grupos (@g.us)
  //    (fetchAllGroups está quebrado no Evolution 1.8.6 — usamos findChats)
  const chatsRes = await fetch(`${EVO_URL}/chat/findChats/${instance}`, {
    headers: { apikey: EVO_KEY },
  });
  if (!chatsRes.ok) {
    const body = await chatsRes.text().catch(() => "");
    return NextResponse.json({ error: `Evolution ${chatsRes.status}: ${body.slice(0, 200)}` }, { status: 500 });
  }
  const chats = await chatsRes.json().catch(() => []);
  if (!Array.isArray(chats)) {
    return NextResponse.json({ error: "Resposta inesperada do Evolution" }, { status: 500 });
  }

  const groupJids: string[] = chats
    .map((c: { id?: string }) => c.id)
    .filter((jid): jid is string => typeof jid === "string" && jid.endsWith("@g.us"));

  if (groupJids.length === 0) {
    return NextResponse.json({
      synced: 0,
      warning:
        "Nenhum grupo encontrado ainda. Em conexão recente o WhatsApp leva alguns minutos pra sincronizar a lista de conversas — aguarde e tente de novo.",
    });
  }

  // 3. Busca o nome de cada grupo (lotes de 8 pra não estourar timeout)
  const named = await inBatches(groupJids, 8, async (jid) => ({
    jid,
    name: await getGroupName(instance, jid),
  }));

  // 4. Upsert em campaign_groups (não duplica; mantém is_enabled existente)
  const toInsert = named.map((g) => ({
    campaign_id: campaignId,
    phone_id: phoneId,
    group_jid: g.jid,
    group_name: g.name,
    group_type: "group",
    is_enabled: false,
  }));

  const existingResult = await db
    .from("campaign_groups")
    .select("group_jid")
    .eq("campaign_id", campaignId);
  const existingJids = new Set(
    ((existingResult.data ?? []) as { group_jid: string }[]).map((g) => g.group_jid)
  );

  // Insere só os novos; atualiza nome dos que já existem
  const newGroups = toInsert.filter((g) => !existingJids.has(g.group_jid));
  const updateGroups = toInsert.filter((g) => existingJids.has(g.group_jid));

  if (newGroups.length > 0) {
    await db.from("campaign_groups").insert(newGroups);
  }
  for (const g of updateGroups) {
    await db
      .from("campaign_groups")
      .update({ group_name: g.group_name })
      .eq("campaign_id", campaignId)
      .eq("group_jid", g.group_jid);
  }

  return NextResponse.json({
    synced: newGroups.length,
    updated: updateGroups.length,
    total: toInsert.length,
  });
}
