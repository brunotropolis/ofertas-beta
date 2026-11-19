import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { acessoPorToken } from "@/lib/extensao-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 19/Nov · amzn.to gerado no Chrome do Bruno pela extensão "Buscador Geek" (a cópia do cookie no servidor caía em
// 20-40 min). A fila (public.amazon_links) é preenchida pelo gatilho da publication_queue e pelo dispatcher.
//   GET   Authorization: Bearer bgx_...  → até 25 pendentes { asin, tag, longo }
//   POST  { resultados: [{ asin, tag, curto?, erro? }] }  → grava o amzn.to (cache permanente) ou o erro
const MAX_TENTATIVAS = 6;
const longo = (asin: string, tag: string) => `https://www.amazon.com.br/dp/${asin}?tag=${tag}`;

export async function GET(request: Request) {
  const token = await acessoPorToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = createAdminClient();
  const { data, error } = await db.from("amazon_links").select("asin, tag")
    .neq("status", "ok").lt("tentativas", MAX_TENTATIVAS).order("pedido_em", { ascending: false }).limit(25);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ pendentes: (data ?? []).map((p) => ({ ...p, longo: longo(p.asin as string, p.tag as string) })) });
}

export async function POST(request: Request) {
  const token = await acessoPorToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = await request.json().catch(() => null);
  const lista = (Array.isArray(b?.resultados) ? b.resultados : []).slice(0, 50) as { asin?: string; tag?: string; curto?: string; erro?: string }[];
  const db = createAdminClient();
  let ok = 0, erros = 0;
  for (const r of lista) {
    const asin = String(r.asin || ""), tag = String(r.tag || "");
    if (!/^[A-Z0-9]{10}$/.test(asin) || !/^[a-z0-9-]{3,40}$/.test(tag)) continue;
    const curto = String(r.curto || "");
    if (/^https:\/\/(amzn\.to|link\.amazon)\/[A-Za-z0-9]+$/.test(curto)) {
      await db.from("amazon_links").update({ curto, status: "ok", erro: null, gerado_em: new Date().toISOString() }).eq("asin", asin).eq("tag", tag);
      ok++;
    } else {
      const { data: atual } = await db.from("amazon_links").select("tentativas").eq("asin", asin).eq("tag", tag).maybeSingle();
      if (!atual) continue;
      await db.from("amazon_links").update({ status: "erro", erro: String(r.erro || "sem link curto").slice(0, 200), tentativas: (atual.tentativas as number) + 1 }).eq("asin", asin).eq("tag", tag);
      erros++;
    }
  }
  return NextResponse.json({ ok: true, gravados: ok, erros });
}
