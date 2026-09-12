import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { parseOrError } from "@/lib/schemas";

const ReorderSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
});

/**
 * PATCH /api/queue/reorder
 * Body: { ids: [uuid, ...] } — nova ordem dos itens da fila.
 * position = índice no array (0-based). Só reordena os ids enviados.
 */
export async function PATCH(request: Request) {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = await request.json().catch(() => ({}));
  const parsed = parseOrError(ReorderSchema, raw);
  if (!parsed.ok) return NextResponse.json(parsed.error, { status: 400 });

  const { ids } = parsed.data;

  // Atualiza position um a um (Supabase não tem bulk-update com valores distintos por linha).
  const results = await Promise.all(
    ids.map((id, index) =>
      db.from("publication_queue").update({ position: index }).eq("id", id)
    )
  );
  const firstErr = results.find((r) => r.error);
  if (firstErr?.error) {
    return NextResponse.json({ error: firstErr.error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, count: ids.length });
}
