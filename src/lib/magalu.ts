/**
 * Magalu (20/Nov/2026). Link de afiliado = vitrine do Magazine Você do perfil (`perfis.afiliados.magalu`, Maternas =
 * "magazinemanualdorn"): https://www.magazinevoce.com.br/<vitrine>/<slug>/p/<sku>/<cat>/<sub>/ . Sem API e sem login.
 *
 * O site da Magalu responde 403 pro servidor. Título, foto, preço e estoque são lidos pelo Chrome do operador:
 * o painel põe o produto em `magalu_produtos` (status pendente), a extensão "Buscador Geek" lê a página a cada 1 min
 * (GET/POST /api/extensao/magalu) e o resultado atualiza as ofertas Magalu ainda não postadas.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = SupabaseClient<any>;

export const ehMagalu = (u: string) => /(^|\/\/|\.)(magazineluiza\.com\.br|magazinevoce\.com\.br|divulgador\.magalu\.com|magalu\.com|mglu\.io|magazineluiza\.onelink\.me)/i.test(u || "");

/** lê o caminho do produto de qualquer link Magalu (página, vitrine de outro afiliado, divulgador/oferta) */
export function caminhoDaUrl(url: string): { sku: string; caminho: string } | null {
  let path: string, seller: string | null = null;
  try { const u = new URL(url); path = u.pathname; seller = u.searchParams.get("seller_id"); } catch { return null; }
  path = path.replace(/^\/magazine[a-z0-9_-]+(?=\/)/i, ""); // vitrine de outro afiliado no magazinevoce
  const m = path.match(/^\/([a-z0-9-]+)\/(?:p|divulgador\/oferta)\/([a-z0-9]{6,14})\/([a-z]{2})\/([a-z0-9]{2,8})/i);
  if (!m) return null;
  const sku = m[2].toLowerCase();
  // vendedor do anúncio (marketplace) muda preço e estoque: vai junto no link
  const vend = seller && /^[a-z0-9_-]{2,60}$/i.test(seller) ? `?seller_id=${seller.toLowerCase()}` : "";
  return { sku, caminho: `${m[1]}/p/${sku}/${m[3].toLowerCase()}/${m[4].toLowerCase()}${vend}` };
}

/** segue link curto (divulgador.magalu.com, mglu.io...) só pelos redirecionamentos: não abre a página (403) */
export async function magaluCaminho(url: string): Promise<{ sku: string; caminho: string } | null> {
  let u = url;
  for (let i = 0; i < 6; i++) {
    const c = caminhoDaUrl(u);
    if (c) return c;
    try {
      const r = await fetch(u, { redirect: "manual", headers: { "user-agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(6000) });
      const loc = r.headers.get("location");
      if (!loc) return null;
      u = new URL(loc, u).toString();
    } catch { return null; }
  }
  return caminhoDaUrl(u);
}

const comBarra = (caminho: string) => { const [p, q] = caminho.split("?"); return `${p}/${q ? "?" + q : ""}`; };
export const urlMagalu = (caminho: string) => `https://www.magazineluiza.com.br/${comBarra(caminho)}`;
export const magaluAfiliado = (caminho: string, vitrine: string) => `https://www.magazinevoce.com.br/${vitrine}/${comBarra(caminho)}`;

const RELER_MS = 6 * 3600_000;

/** pede pro Chrome ler o produto (novo, ou leitura com mais de 6h) */
export async function pedirLeituraMagalu(db: DB, sku: string, caminho: string) {
  const { data } = await db.from("magalu_produtos").select("status, lido_em").eq("sku", sku).maybeSingle();
  if (!data) {
    await db.from("magalu_produtos").insert({ sku, caminho });
    return;
  }
  const velho = !data.lido_em || Date.now() - Date.parse(data.lido_em as string) > RELER_MS;
  if (velho && data.status !== "pendente") {
    await db.from("magalu_produtos").update({ status: "pendente", tentativas: 0, pedido_em: new Date().toISOString() }).eq("sku", sku);
  }
}

export type LeituraMagalu = { preco: number | null; preco_de: number | null; disponivel: boolean | null; lido_em: string | null; titulo: string | null; imagem: string | null };

export async function lerMagalu(db: DB, sku: string): Promise<LeituraMagalu | null> {
  const { data } = await db.from("magalu_produtos").select("preco, preco_de, disponivel, lido_em, titulo, imagem").eq("sku", sku).eq("status", "ok").maybeSingle();
  return (data as LeituraMagalu | null) ?? null;
}

export const skuDaOferta = (url: string | null | undefined) => (url ? caminhoDaUrl(url)?.sku ?? null : null);
