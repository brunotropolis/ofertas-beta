import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { parseOrError } from "@/lib/schemas";
import { AvisoSchema, textoComLink } from "@/lib/avisos";

type Params = { params: Promise<{ id: string }> };

async function carregar(db: any, id: string) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const { data } = await db.from("offers")
    .select("id, promo_meta, publication_queue(id, status)")
    .eq("id", id).maybeSingle();
  if (!data?.promo_meta?.aviso) return null;
  return { oferta: data, fila: (data.publication_queue ?? [])[0] ?? null };
}

/** PATCH /api/avisos/[id] — edita texto/arte/link/horário/campanhas (só se ainda não saiu). */
export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const atual = await carregar(db, id);
  if (!atual) return NextResponse.json({ error: "aviso não encontrado" }, { status: 404 });
  if (atual.fila && ["published", "publishing"].includes(atual.fila.status))
    return NextResponse.json({ error: "esse post já saiu (ou está saindo) e não dá mais pra editar" }, { status: 409 });

  const parsed = parseOrError(AvisoSchema, await request.json().catch(() => ({})));
  if (!parsed.ok) return NextResponse.json(parsed.error, { status: 400 });
  const a = parsed.data;
  const quando = new Date(a.scheduled_at);

  const { error: e1 } = await db.from("offers").update({
    url: a.link, affiliate_url: a.link, title: a.titulo || "Aviso", image_url: a.image_url,
    extra_text: textoComLink(a.texto, a.link), status: "queued",
    expires_at: new Date(quando.getTime() + 24 * 3600_000).toISOString(),
  }).eq("id", id);
  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 });

  const filaDados = { campaign_ids: a.campaign_ids, scheduled_at: quando.toISOString(), status: "pending", error_message: null };
  const { error: e2 } = atual.fila
    ? await db.from("publication_queue").update(filaDados).eq("id", atual.fila.id)
    : await db.from("publication_queue").insert({ ...filaDados, offer_id: id, position: 999, created_by: user.id });
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** DELETE /api/avisos/[id] — cancela (tira da fila e apaga). Post que já saiu fica no histórico. */
export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const atual = await carregar(db, id);
  if (!atual) return NextResponse.json({ error: "aviso não encontrado" }, { status: 404 });
  if (atual.fila && ["published", "publishing"].includes(atual.fila.status))
    return NextResponse.json({ error: "esse post já saiu e fica no histórico" }, { status: 409 });

  if (atual.fila) {
    const { error } = await db.from("publication_queue").delete().eq("id", atual.fila.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const { error } = await db.from("offers").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
