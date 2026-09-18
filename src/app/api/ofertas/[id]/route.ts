import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { parseOrError } from "@/lib/schemas";

type Params = { params: Promise<{ id: string }> };

const emptyToNull = (v: unknown) => (v === "" ? null : v);

const UpdateOfferSchema = z.object({
  title: z.string().max(500).nullish(),
  ai_caption: z.string().max(4000).nullish(),
  extra_text: z.string().max(2000).nullish(),
  affiliate_url: z.preprocess(emptyToNull, z.string().url().max(2048).nullish()),
  price_current: z.preprocess(emptyToNull, z.coerce.number().nonnegative().nullish()),
  price_original: z.preprocess(emptyToNull, z.coerce.number().nonnegative().nullish()),
}).strict();

/**
 * PATCH /api/ofertas/[id] — edita os campos da oferta (legenda, título, preço, link).
 * A legenda (`ai_caption`) editada aqui é a que o dispatcher usa como linhas criativas.
 */
export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = await request.json().catch(() => ({}));
  const parsed = parseOrError(UpdateOfferSchema, raw);
  if (!parsed.ok) return NextResponse.json(parsed.error, { status: 400 });

  // só grava os campos enviados
  const patch = Object.fromEntries(
    Object.entries(parsed.data).filter(([, v]) => v !== undefined)
  );
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "nada pra atualizar" }, { status: 400 });
  }

  const { data, error } = await db
    .from("offers")
    .update(patch)
    .eq("id", id)
    .select("id, title, ai_caption, extra_text, affiliate_url, url, price_current, price_original, discount_pct, image_url, platform, source, status, created_at")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "oferta não encontrada" }, { status: 404 });
  return NextResponse.json(data);
}

/**
 * DELETE /api/ofertas/[id] — descarta a oferta (remove ela e a fila em cascata).
 */
export async function DELETE(_: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await db.from("offers").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
