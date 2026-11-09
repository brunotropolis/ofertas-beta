import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { parseOrError } from "@/lib/schemas";
import { AvisoSchema, textoComLink } from "@/lib/avisos";

// 09/Nov: AVISOS agendados (arte + texto pronto + link) — aba Agendamento.
// Cada aviso = 1 oferta (promo_meta.aviso, texto em extra_text, status queued) + 1 item na publication_queue
// com scheduled_at. Quem posta é o dispatcher (lib/dispatcher.ts, ramo "aviso"): texto do jeito que está,
// sem IA, card com a arte. Acesso pelo login do painel (RLS das tabelas offers/publication_queue).

/** GET /api/avisos?perfil=<id> — avisos do perfil com o item da fila (horário/status). */
export async function GET(request: Request) {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const perfil = new URL(request.url).searchParams.get("perfil");
  let q = db.from("offers")
    .select("id, title, image_url, affiliate_url, extra_text, promo_meta, perfil_id, created_at, publication_queue(id, campaign_ids, scheduled_at, status, published_at, error_message)")
    .not("promo_meta->aviso", "is", null)
    .order("created_at", { ascending: false })
    .limit(300);
  if (perfil) q = q.eq("perfil_id", perfil);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lista = (data ?? []).map((o: any) => {
    const fila = (o.publication_queue ?? [])[0] ?? null;
    return {
      id: o.id, titulo: o.title ?? "", image_url: o.image_url, link: o.affiliate_url, texto: o.extra_text ?? "",
      queue_id: fila?.id ?? null, campaign_ids: fila?.campaign_ids ?? [], scheduled_at: fila?.scheduled_at ?? null,
      status: fila?.status ?? "sem_fila", published_at: fila?.published_at ?? null, error_message: fila?.error_message ?? null,
    };
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  lista.sort((a: any, b: any) => String(a.scheduled_at ?? "").localeCompare(String(b.scheduled_at ?? "")));
  return NextResponse.json(lista);
}

/** POST /api/avisos — cria e agenda. */
export async function POST(request: Request) {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = parseOrError(AvisoSchema, await request.json().catch(() => ({})));
  if (!parsed.ok) return NextResponse.json(parsed.error, { status: 400 });
  const a = parsed.data;
  const quando = new Date(a.scheduled_at);

  const { data: oferta, error: e1 } = await db.from("offers").insert({
    source: "manual", source_ref: `aviso_${crypto.randomUUID()}`, platform: null, kind: "produto", status: "queued",
    url: a.link, affiliate_url: a.link, title: a.titulo || "Aviso", image_url: a.image_url,
    extra_text: textoComLink(a.texto, a.link), perfil_id: a.perfil_id, source_channel: "agendamento",
    expires_at: new Date(quando.getTime() + 24 * 3600_000).toISOString(),
    promo_meta: { aviso: { descricao: "" } }, created_by: user.id,
  }).select("id").single();
  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 });

  // posição baixa: quando chega a hora, passa na frente das ofertas comuns
  const { data: primeiro } = await db.from("publication_queue").select("position")
    .eq("status", "pending").order("position", { ascending: true }).limit(1).maybeSingle();
  const { error: e2 } = await db.from("publication_queue").insert({
    offer_id: oferta.id, campaign_ids: a.campaign_ids, scheduled_at: quando.toISOString(), status: "pending",
    position: Math.min(1000, ((primeiro?.position as number | undefined) ?? 1000) - 1), created_by: user.id,
  });
  if (e2) {
    await db.from("offers").delete().eq("id", oferta.id);
    return NextResponse.json({ error: e2.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id: oferta.id });
}
