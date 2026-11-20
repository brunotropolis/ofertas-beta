import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { acessoPorToken } from "@/lib/extensao-auth";
import { urlMagalu } from "@/lib/magalu";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 20/Nov · Produto Magalu lido no Chrome do operador pela extensão "Buscador Geek" (o site dá 403 pro servidor).
//   GET   Authorization: Bearer bgx_...  → até 20 pendentes { sku, url }
//   POST  { resultados: [{ sku, titulo?, imagem?, preco?, preco_de?, preco_pix?, disponivel?, erro? }] }
// Ao gravar, atualiza as ofertas Magalu ainda não postadas desse produto (foto, título, preço; sem estoque sai).
const MAX_TENTATIVAS = 5;
const num = (v: unknown) => (typeof v === "number" && isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : null);

export async function GET(request: Request) {
  if (!(await acessoPorToken(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = createAdminClient();
  const { data, error } = await db.from("magalu_produtos").select("sku, caminho")
    .eq("status", "pendente").lt("tentativas", MAX_TENTATIVAS).order("pedido_em", { ascending: false }).limit(20);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ pendentes: (data ?? []).map((p) => ({ sku: p.sku, url: urlMagalu(p.caminho as string) })) });
}

export async function POST(request: Request) {
  if (!(await acessoPorToken(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = await request.json().catch(() => null);
  const lista = (Array.isArray(b?.resultados) ? b.resultados : []).slice(0, 40) as Record<string, unknown>[];
  const db = createAdminClient();
  let ok = 0, erros = 0, ofertas = 0;
  for (const r of lista) {
    const sku = String(r.sku || "").toLowerCase();
    if (!/^[a-z0-9]{6,14}$/.test(sku)) continue;
    const { data: atual } = await db.from("magalu_produtos").select("tentativas").eq("sku", sku).maybeSingle();
    if (!atual) continue;
    const preco = num(r.preco);
    const imagem = typeof r.imagem === "string" && /^https:\/\/[a-z0-9.-]*mlcdn\.com\.br\//.test(r.imagem) ? r.imagem.slice(0, 500) : null;
    if (r.erro || (!preco && r.disponivel !== false)) {
      await db.from("magalu_produtos").update({ status: (atual.tentativas as number) + 1 >= MAX_TENTATIVAS ? "erro" : "pendente", erro: String(r.erro || "sem preço na página").slice(0, 200), tentativas: (atual.tentativas as number) + 1 }).eq("sku", sku);
      erros++;
      continue;
    }
    const titulo = typeof r.titulo === "string" ? r.titulo.slice(0, 300) : null;
    const disponivel = r.disponivel !== false;
    const de = num(r.preco_de);
    await db.from("magalu_produtos").update({
      titulo, imagem, preco, preco_de: de && preco && de > preco ? de : null, preco_pix: num(r.preco_pix),
      disponivel, status: "ok", erro: null, lido_em: new Date().toISOString(),
    }).eq("sku", sku);
    ok++;

    // ofertas desse produto que ainda não saíram
    const { data: offs } = await db.from("offers").select("id, title, image_url, price_current, price_original, status")
      .eq("platform", "magalu").in("status", ["draft", "queued"]).like("url", `%/p/${sku}/%`);
    for (const o of offs ?? []) {
      const patch: Record<string, unknown> = {};
      if (!disponivel) {
        patch.status = "error";
        await db.from("publication_queue").delete().eq("offer_id", o.id).eq("status", "pending");
      } else {
        if (!o.image_url && imagem) patch.image_url = imagem;
        if (!o.title && titulo) patch.title = titulo;
        if (preco && o.price_current !== preco) {
          patch.price_current = preco;
          const orig = de && de > preco * 1.02 ? de : o.price_original && o.price_original > preco * 1.02 ? o.price_original : null;
          patch.price_original = orig;
          patch.discount_pct = orig ? Math.round((1 - preco / orig) * 100) : null;
        }
      }
      if (Object.keys(patch).length) { await db.from("offers").update(patch).eq("id", o.id); ofertas++; }
    }
  }
  return NextResponse.json({ ok: true, gravados: ok, erros, ofertas_atualizadas: ofertas });
}
