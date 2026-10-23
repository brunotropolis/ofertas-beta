/**
 * Link curto da marca (22/Out): todo link postado nos grupos passa pelo nosso encurtador
 * (<short_domain>/l/<slug>) pra contar clique por grupo. Ofertas que chegaram com link direto da loja
 * (coletores Shopee/ML, Fralda Barata) ganham o slug na hora de postar — 1 gravação no encurtador por produto,
 * não por grupo (o grupo vai como ?g=<nº> e é lido no clique).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "crypto";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = SupabaseClient<any>;

const slugDe = (url: string) => {
  const n = parseInt(createHash("sha1").update(url).digest("hex").slice(0, 10), 16);
  return "o" + n.toString(36).padStart(6, "0").slice(-6);
};

// Shopee: o link de afiliado "an_redir" aceita marca própria (sub_id) que volta no relatório de vendas
// (campo utmContent). O encurtador acrescenta sub_id=<grupo>-<campanha> no clique (22/Out).
const SHOPEE_AFILIADO = "18177790005";
async function shopeeComMarca(link: string): Promise<string | null> {
  let u = link;
  for (let i = 0; i < 3 && /s\.shopee\.com\.br\/(?!an_redir)/.test(u); i++) {
    try {
      const r = await fetch(u, { redirect: "manual", headers: { "user-agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(6000) });
      const loc = r.headers.get("location");
      if (!loc) break;
      u = new URL(loc, u).toString();
    } catch { return null; }
  }
  const m = u.match(/shopee\.com\.br\/(?:product|opaanlp)\/(\d+)\/(\d+)/) || u.match(/-i\.(\d+)\.(\d+)/);
  if (!m) return null;
  const origem = `https://shopee.com.br/product/${m[1]}/${m[2]}`;
  return `https://s.shopee.com.br/an_redir?origin_link=${encodeURIComponent(origem)}&affiliate_id=${SHOPEE_AFILIADO}`;
}

/** Devolve o link curto da oferta (registra no encurtador e grava na oferta se ainda não for nosso). */
export async function garantirLinkCurto(db: DB, offerId: string, link: string, shortDomain: string | null, plataforma?: string | null): Promise<string> {
  if (!shortDomain || !link) return link;
  // Shopee com link antigo (sem marca): troca pelo formato que aceita marca, mesmo que já seja curto nosso
  if (plataforma === "shopee" && !link.includes(`${shortDomain}/l/p`)) {
    let destino = link;
    if (link.includes(`${shortDomain}/l/`)) {
      try {
        const r = await fetch(link, { redirect: "manual", signal: AbortSignal.timeout(6000) });
        destino = r.headers.get("location") || link;
      } catch { /* mantém */ }
    }
    const marcado = await shopeeComMarca(destino);
    if (marcado) return registrar(db, offerId, marcado, shortDomain, "p");
  }
  if (link.includes(`${shortDomain}/l/`)) return link;
  return registrar(db, offerId, link, shortDomain, "o");
}

async function registrar(db: DB, offerId: string, link: string, shortDomain: string, prefixo: string): Promise<string> {
  const secret = process.env.UTM_WORKER_SECRET;
  if (!secret) return link;
  const slug = prefixo + slugDe(link).slice(1);
  try {
    const r = await fetch("https://manualdorecemnascido.com.br/_utmapi/register", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Worker-Secret": secret },
      body: JSON.stringify({ slug, url: link, description: "oferta (dispatcher)", hidden: true }),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return link;
  } catch {
    return link; // encurtador fora: posta com o link direto (não trava o post)
  }
  const curto = `https://${shortDomain}/l/${slug}`;
  await db.from("offers").update({ affiliate_url: curto }).eq("id", offerId);
  return curto;
}

/** Marca do grupo no link: nº do "As Ofertas Maternas #N"; outros grupos = final do id. */
export function marcaGrupo(groupName: string | null | undefined, jid: string): string {
  const m = (groupName || "").match(/^As Ofertas Maternas\s*#\s*(\d+)/i);
  return m ? m[1] : "x" + jid.replace(/\D/g, "").slice(-6);
}

/** Marca no link: grupo (g) + campanha (c: m=Maternas, f=Fraldas, c=Cupons, e=Enxoval) — lidos pelo encurtador no clique. */
export const CAMPANHA_CODIGO: Record<string, string> = { geral: "m", fraldas: "f", cupons: "c", enxoval: "e" };
export const comGrupo = (link: string, g: string, c?: string) =>
  `${link}${link.includes("?") ? "&" : "?"}g=${g}${c ? `&c=${c}` : ""}`;
