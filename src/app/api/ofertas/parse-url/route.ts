import { NextResponse } from "next/server";
import { ParseUrlSchema, parseOrError } from "@/lib/schemas";
import { ehMagalu, lerMagalu, magaluAfiliado, magaluCaminho, pedirLeituraMagalu, urlMagalu } from "@/lib/magalu";
import { createAdminClient } from "@/lib/supabase/admin";

type Platform = "amazon" | "shopee" | "ml";

function detectPlatform(url: string): Platform | null {
  if (/amazon\.com\.br/i.test(url)) return "amazon";
  if (/shopee\.com\.br/i.test(url)) return "shopee";
  if (/mercadolivre\.com\.br|mercadolibre\.com/i.test(url)) return "ml";
  return null;
}

function extractMlItemId(url: string): string | null {
  const match = url.match(/MLB-?(\d+)/i);
  return match ? `MLB${match[1]}` : null;
}

function extractAmazonTitle(url: string): string {
  // Amazon URLs usually have product name in path: /Product-Name-Here/dp/ASIN
  try {
    const path = new URL(url).pathname;
    const parts = path.split("/").filter(Boolean);
    // Find the segment before "dp"
    const dpIdx = parts.findIndex((p) => p === "dp");
    if (dpIdx > 0) {
      return parts[dpIdx - 1].replace(/-/g, " ");
    }
    return "";
  } catch {
    return "";
  }
}

async function fetchPageMeta(url: string) {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "pt-BR,pt;q=0.9",
    },
    redirect: "follow",
    // 8 second timeout via signal
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) return null;
  const html = await res.text();

  const og = (name: string) =>
    html.match(new RegExp(`<meta[^>]+property=["']og:${name}["'][^>]+content=["']([^"']+)["']`, "i"))?.[1] ||
    html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:${name}["']`, "i"))?.[1] ||
    "";

  return {
    title: og("title") || html.match(/<title[^>]*>([^<]{5,})<\/title>/i)?.[1]?.trim() || "",
    image: og("image"),
    description: og("description"),
  };
}

async function fetchMlProduct(itemId: string) {
  const res = await fetch(`https://api.mercadolibre.com/items/${itemId}`, {
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) return null;
  const data = await res.json();

  // Get better image (replace thumbnail suffix)
  const image = (data.pictures?.[0]?.url || data.thumbnail || "")
    .replace("-I.jpg", "-O.jpg")
    .replace(/\?.*$/, "");

  const discount =
    data.original_price && data.price
      ? Math.round((1 - data.price / data.original_price) * 100)
      : null;

  return {
    title: data.title,
    price_current: data.price as number,
    price_original: data.original_price as number | null,
    discount_pct: discount,
    image_url: image,
    product_url: data.permalink,
  };
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const parsed = parseOrError(ParseUrlSchema, body);
  if (!parsed.ok) {
    return NextResponse.json(parsed.error, { status: 400 });
  }
  const { url } = parsed.data;

  // Magalu (20/Nov): link de qualquer afiliado vira o da vitrine do perfil; dados vêm da leitura do Chrome
  if (ehMagalu(url)) {
    const c = await magaluCaminho(url);
    if (!c) return NextResponse.json({ error: "Não achei o produto nesse link da Magalu" }, { status: 400 });
    const db = createAdminClient();
    const { data: pfs } = await db.from("perfis").select("afiliados").not("afiliados->magalu", "is", null);
    const vitrine = ((pfs ?? [])[0]?.afiliados as { magalu?: string } | undefined)?.magalu;
    if (!vitrine) return NextResponse.json({ error: "Nenhum perfil com vitrine Magalu cadastrada" }, { status: 400 });
    const l = await lerMagalu(db, c.sku);
    await pedirLeituraMagalu(db, c.sku, c.caminho);
    return NextResponse.json({
      platform: "magalu",
      title: l?.titulo || c.caminho.split("/")[0].replace(/-/g, " "),
      price_current: l?.preco ?? null,
      price_original: l?.preco_de ?? null,
      discount_pct: l?.preco && l?.preco_de ? Math.round((1 - l.preco / l.preco_de) * 100) : null,
      image_url: l?.imagem ?? null,
      product_url: urlMagalu(c.caminho),
      affiliate_url: magaluAfiliado(c.caminho, vitrine),
    });
  }

  const platform = detectPlatform(url);
  if (!platform) {
    return NextResponse.json(
      { error: "Plataforma não reconhecida. Suporte: Amazon, Shopee, Mercado Livre, Magalu" },
      { status: 400 }
    );
  }

  try {
    // Mercado Livre — use public API
    if (platform === "ml") {
      const itemId = extractMlItemId(url);
      if (itemId) {
        const product = await fetchMlProduct(itemId);
        if (product) {
          return NextResponse.json({ platform, ...product });
        }
      }
    }

    // Amazon — try OG tags, fallback to URL title extraction
    if (platform === "amazon") {
      const meta = await fetchPageMeta(url).catch(() => null);
      const titleFromUrl = extractAmazonTitle(url);
      return NextResponse.json({
        platform,
        title: meta?.title || titleFromUrl,
        price_current: null,
        price_original: null,
        discount_pct: null,
        image_url: meta?.image || null,
        product_url: url,
      });
    }

    // Shopee — try OG tags
    const meta = await fetchPageMeta(url).catch(() => null);
    return NextResponse.json({
      platform,
      title: meta?.title || "",
      price_current: null,
      price_original: null,
      discount_pct: null,
      image_url: meta?.image || null,
      product_url: url,
    });
  } catch {
    return NextResponse.json({ error: "Falha ao buscar dados do produto" }, { status: 500 });
  }
}
