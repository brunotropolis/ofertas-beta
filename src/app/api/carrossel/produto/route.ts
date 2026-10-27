import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ParseUrlSchema, parseOrError } from "@/lib/schemas";
import {
  detectar, resolver, chave, shopeeOficial, amazonOficial, mlOficial, ogDaPagina, type ProdutoLido,
} from "@/lib/carrossel/ler-produto";

// POST {url} → nome/foto/preço do produto pra Fábrica de Carrossel. Atrás do login (middleware).
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const parsed = parseOrError(ParseUrlSchema, body);
  if (!parsed.ok) return NextResponse.json(parsed.error, { status: 400 });

  const url = await resolver(parsed.data.url).catch(() => parsed.data.url);
  const platform = detectar(url);
  if (!platform) return NextResponse.json({ error: "Plataforma não reconhecida (Amazon, Shopee, Mercado Livre)" }, { status: 400 });
  const k = chave(platform, url);

  const tentativas: Array<[string, () => Promise<{ title: string; image: string | null; price: number | null } | null>]> = [];
  if (k && platform === "shopee") tentativas.push(["shopee-api", () => shopeeOficial(k)]);
  if (k && platform === "amazon") tentativas.push(["amazon-api", () => amazonOficial(k)]);
  if (k && platform === "ml") tentativas.push(["ml-api", () => mlOficial(k)]);
  if (k) tentativas.push(["painel", () => ofertaDoPainel(k)]);
  tentativas.push(["pagina", () => ogDaPagina(url)]);

  let melhor: ProdutoLido | null = null;
  for (const [fonte, fn] of tentativas) {
    const r = await fn().catch(() => null);
    if (!r || !r.title) continue;
    const p: ProdutoLido = { platform, url, title: r.title, image_url: r.image, price_current: r.price, fonte };
    if (p.image_url) return NextResponse.json(p);
    melhor ??= p; // achou nome sem foto: guarda e tenta a próxima fonte
  }
  if (melhor) return NextResponse.json(melhor);
  return NextResponse.json({ error: "Não consegui ler esse produto" }, { status: 404 });
}

// Produto que o painel já coletou (coletores/Telegram) com o mesmo ASIN / item.
async function ofertaDoPainel(k: string) {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const termo = k.includes(".") ? k.split(".")[1] : k; // shopee: casa pelo itemId
  const { data } = await db
    .from("offers")
    .select("title, image_url, price_current")
    .ilike("url", `%${termo}%`)
    .not("image_url", "is", null)
    .order("created_at", { ascending: false })
    .limit(1);
  const o = data?.[0];
  return o ? { title: o.title as string, image: o.image_url as string, price: (o.price_current as number) ?? null } : null;
}
