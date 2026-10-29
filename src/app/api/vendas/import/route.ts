import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import type { ImportRow } from "@/lib/affiliate-sales";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/vendas/import  — ingestão do coletor (skill /vendas-sync via Chrome).
// Auth: header x-import-secret == CRON_SECRET. Não usa sessão de usuário.
// Body: { source: "ml"|"amazon"|"shopee", replacePeriod?: {start,end}, rows: ImportRow[] }
// shopee (29/Out): só HISTÓRICO pro Tio Patinhas (a API da Shopee apaga depois de 3 meses). A tela Vendas
// continua lendo a Shopee ao vivo; nenhuma leitura do painel soma source=shopee desta tabela.
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("x-import-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const source = body?.source;
  const rows: ImportRow[] = Array.isArray(body?.rows) ? body.rows : [];
  if (source !== "ml" && source !== "amazon" && source !== "shopee") {
    return NextResponse.json({ error: "source inválido (ml|amazon|shopee)" }, { status: 400 });
  }
  const admin = createAdminClient();

  // Resultado por etiqueta/dia (23/Out, só ML): tabela à parte (recorte do mesmo dinheiro, não soma com affiliate_sales)
  // Body: { source: "ml", etiquetas: [{ tag, dia: "AAAA-MM-DD", cliques, vendas, comissao }] }
  if (Array.isArray(body?.etiquetas)) {
    const agora = new Date().toISOString();
    const et = (body.etiquetas as { tag?: string; dia?: string; cliques?: number; vendas?: number; comissao?: number }[])
      .filter((e) => e.tag && /^\d{4}-\d{2}-\d{2}$/.test(e.dia ?? ""))
      .map((e) => ({ fonte: source, tag: String(e.tag), dia: e.dia, cliques: Math.round(e.cliques ?? 0),
        vendas: Math.round(e.vendas ?? 0), comissao: Number(e.comissao ?? 0), atualizado_em: agora }));
    if (et.length) {
      const { error } = await admin.from("afiliado_etiquetas_diario").upsert(et, { onConflict: "fonte,tag,dia" });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!rows.length) return NextResponse.json({ ok: true, source, etiquetas: et.length });
  }

  if (!rows.length) {
    return NextResponse.json({ error: "rows vazio" }, { status: 400 });
  }

  // Opcional: limpar um período antes de reinserir (evita produto/dia órfão de sync anterior).
  const rp = body?.replacePeriod;
  if (rp?.start && rp?.end) {
    await admin.from("affiliate_sales").delete()
      .eq("source", source)
      .gte("period_start", rp.start)
      .lte("period_end", rp.end);
  }

  const now = new Date().toISOString();
  const payload = rows.map((r) => ({
    source,
    external_id: String(r.external_id),
    sold_at: r.sold_at ?? null,
    period_start: r.period_start ?? null,
    period_end: r.period_end ?? null,
    product_name: r.product_name ?? null,
    product_image: r.product_image ?? null,
    category: r.category ?? null,
    store: r.store ?? null,
    gross_value: r.gross_value ?? 0,
    units: r.units ?? 0,
    clicks: r.clicks ?? null,
    commission: r.commission ?? 0,
    commission_pct: r.commission_pct ?? null,
    status: r.status ?? null,
    sale_type: r.sale_type ?? null,
    utm: r.utm ?? null,
    device: r.device ?? null,
    raw: r.raw ?? null,
    synced_at: now,
  }));

  const { error, count } = await admin
    .from("affiliate_sales")
    .upsert(payload, { onConflict: "source,external_id", count: "exact" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, source, upserted: count ?? payload.length });
}
