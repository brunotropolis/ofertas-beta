import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

/**
 * 19/Nov · Termômetro de preço (tela /precos). Lê public.preco_historico (RLS: só operador).
 * GET /api/precos?dias=28&busca=&plat=          → preço de hoje x menor/mediana/maior das últimas semanas
 * GET /api/precos?produto=amazon:B0...&dias=60  → série diária do produto (pro gráfico)
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const db = supabase as Any;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = new URL(request.url).searchParams;
  const dias = Math.min(180, Math.max(7, Number(sp.get("dias")) || 28));
  const produto = sp.get("produto");
  if (produto) {
    const desde = new Date(Date.now() - dias * 86400_000).toISOString().slice(0, 10);
    const { data, error } = await db.from("preco_historico")
      .select("dia, preco_min, preco_max, preco_ultimo, leituras")
      .eq("produto", produto).gte("dia", desde).order("dia", { ascending: true }).limit(400);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ serie: data ?? [] });
  }

  const busca = (sp.get("busca") || "").trim().slice(0, 80) || null;
  const plat = ["amazon", "ml", "shopee"].includes(sp.get("plat") || "") ? sp.get("plat") : null;
  const { data, error } = await db.rpc("preco_termometro", { p_dias: dias, p_busca: busca, p_platform: plat, p_limite: 600 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ itens: data ?? [] });
}
