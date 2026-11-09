import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

/** DELETE /api/exclusivas/[id] — tira uma exclusiva que ainda não saiu (rascunho ou na fila). */
export async function DELETE(_r: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: o } = await db.from("offers").select("id, status, promo_meta").eq("id", id).maybeSingle();
  if (!o?.promo_meta?.exclusiva) return NextResponse.json({ error: "exclusiva não encontrada" }, { status: 404 });
  if (o.status === "published") return NextResponse.json({ error: "essa já saiu nos grupos" }, { status: 409 });
  await db.from("publication_queue").delete().eq("offer_id", id).eq("status", "pending");
  const { error } = await db.from("offers").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
