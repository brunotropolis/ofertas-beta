import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { parseOrError } from "@/lib/schemas";

type Params = { params: Promise<{ id: string }> };

const EnqueueSchema = z.object({
  campaign_ids: z.array(z.string().uuid()).min(1, "escolha ao menos 1 campanha"),
  scheduled_at: z.string().datetime().nullable().optional(),
});

/**
 * POST /api/ofertas/[id]/enqueue
 * Enfileira uma oferta já existente (das fontes: telegram/whatsapp/auto/manual)
 * pras campanhas escolhidas. Cria/atualiza o item na publication_queue.
 */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = await request.json().catch(() => ({}));
  const parsed = parseOrError(EnqueueSchema, raw);
  if (!parsed.ok) return NextResponse.json(parsed.error, { status: 400 });
  const { campaign_ids, scheduled_at } = parsed.data;

  const { data: offer } = await db
    .from("offers")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();
  if (!offer) return NextResponse.json({ error: "oferta não encontrada" }, { status: 404 });

  // Já tem item pendente na fila pra essa oferta? Atualiza campanhas; senão cria.
  const { data: existing } = await db
    .from("publication_queue")
    .select("id, status")
    .eq("offer_id", id)
    .in("status", ["pending", "publishing", "error"])
    .maybeSingle();

  if (existing) {
    const { error } = await db
      .from("publication_queue")
      .update({ campaign_ids, scheduled_at: scheduled_at || null, status: "pending", error_message: null })
      .eq("id", existing.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { data: lastItem } = await db
      .from("publication_queue")
      .select("position")
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextPosition = ((lastItem?.position ?? 0) as number) + 1;

    const { error } = await db.from("publication_queue").insert({
      offer_id: id,
      campaign_ids,
      position: nextPosition,
      scheduled_at: scheduled_at || null,
      status: "pending",
      created_by: user.id,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await db.from("offers").update({ status: "queued" }).eq("id", id);
  return NextResponse.json({ ok: true });
}
