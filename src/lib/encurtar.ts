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
export async function garantirLinkCurto(db: DB, offerId: string, link: string, shortDomain: string | null, plataforma?: string | null, kind?: string | null): Promise<string> {
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
  // letra do slug diz a origem (c = cupom, a = Amazon, o = resto), como era no ingest
  return registrar(db, offerId, link, shortDomain, kind === "cupom" ? "c" : plataforma === "amazon" ? "a" : "o");
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

// ─────────────────────────────────────────────────────────────────────────────
// Link DIRETO da loja (04/Nov, Bruno: "quero os links do jeito que era no manual, mesmo perdendo o traqueamento").
// O post volta a sair com amazon.com.br / meli.la / s.shopee.com.br, como a equipe postava. Perde o clique por
// grupo (encurtador); a campanha segue marcada dentro do próprio link (tag Amazon, sub_id Shopee, etiqueta ML).
// Desfazer: no dispatcher, voltar a chamar garantirLinkCurto no lugar de linkDaLoja.
// ─────────────────────────────────────────────────────────────────────────────
const AMAZON_TAG_CAMPANHA: Record<string, string> = { m: "mrnofmaternas-20", f: "mrnoffraldas-20", c: "mrnofcupons-20", e: "mrnofenxoval-20" };
const ML_VITRINE_CURTO = "https://meli.la/2Axm7cw"; // vitrine social/manualdorecemnascido (link da equipe, conta Manual RN)

async function shopeeLinkCurto(origem: string, campanha: string): Promise<string | null> {
  const appId = process.env.SHOPEE_APP_ID, secret = process.env.SHOPEE_APP_SECRET;
  if (!appId || !secret) return null;
  // subIds "0-<campanha>": grupo desconhecido (0), campanha mantida no relatório de vendas (utmContent)
  const body = JSON.stringify({ query: `mutation{generateShortLink(input:{originUrl:${JSON.stringify(origem)},subIds:["0",${JSON.stringify(campanha)}]}){shortLink}}` });
  const ts = Math.floor(Date.now() / 1000).toString();
  const sig = createHash("sha256").update(appId + ts + body + secret).digest("hex");
  try {
    const r = await fetch("https://open-api.affiliate.shopee.com.br/graphql", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `SHA256 Credential=${appId},Timestamp=${ts},Signature=${sig}` },
      body,
      signal: AbortSignal.timeout(8000),
    });
    const j = await r.json();
    return j?.data?.generateShortLink?.shortLink || null;
  } catch { return null; }
}

// Amazon amzn.to pelo SiteStripe (o mesmo botão "Texto" da barra de associados). Só funciona logado: a sessão da
// conta de associado fica em AMAZON_SITESTRIPE_COOKIE (env do servidor; cofre .env.meta). Sem ela ou se a sessão
// cair → null, o post sai com o link longo e a saúde avisa (amazonCurtoStatus).
export const amazonCurtoStatus: { ok: boolean | null; quando: string | null; erro: string | null } = { ok: null, quando: null, erro: null };
const cacheAmzn = new Map<string, string>();
async function amazonCurto(longo: string): Promise<string | null> {
  const cookie = process.env.AMAZON_SITESTRIPE_COOKIE;
  const marca = (ok: boolean, erro: string | null) => Object.assign(amazonCurtoStatus, { ok, erro, quando: new Date().toISOString() });
  if (!cookie) { marca(false, "sem login da Amazon no servidor (AMAZON_SITESTRIPE_COOKIE)"); return null; }
  const emCache = cacheAmzn.get(longo);
  if (emCache) return emCache;
  try {
    const r = await fetch(`https://www.amazon.com.br/associates/sitestripe/getShortUrl?longUrl=${encodeURIComponent(longo)}&marketplaceId=526970`, {
      redirect: "manual",
      headers: { cookie, "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36", accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (r.status !== 200) { marca(false, `Amazon respondeu ${r.status} (login caiu?)`); return null; }
    const j = await r.json().catch(() => null);
    const curto = j?.shortUrl as string | undefined;
    if (!curto || !/^https:\/\/(amzn\.to|link\.amazon)\//.test(curto)) { marca(false, "Amazon não devolveu link curto"); return null; }
    marca(true, null);
    if (cacheAmzn.size > 2000) cacheAmzn.clear();
    cacheAmzn.set(longo, curto);
    return curto;
  } catch (e) { marca(false, `falha ao chamar a Amazon: ${String(e).slice(0, 80)}`); return null; }
}

/** Link direto da loja pro post. Se a oferta já tem link curto nosso, descobre o destino dele e usa o destino. */
export async function linkDaLoja(link: string, shortDomain: string | null, plataforma: string | null | undefined, campanha: string): Promise<string> {
  if (!link) return link;
  let destino = link;
  // link curto nosso em QUALQUER domínio (o ingest da Amazon grava manualdorecemnascido.com.br/l/… quando o perfil
  // não tem domínio próprio, ex.: BRUNOTROPOLIS) → descobre o destino e usa o link direto
  const ehCurtoNosso = (u: string) => /^https:\/\/(?:www\.)?(?:asofertasmaternas\.com\.br|manualdorecemnascido\.com\.br)\/l\//.test(u)
    || (!!shortDomain && u.includes(`${shortDomain}/l/`));
  if (ehCurtoNosso(link)) {
    try {
      const r = await fetch(link.split("?")[0], { redirect: "manual", headers: { "user-agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(6000) });
      destino = r.headers.get("location") || link;
    } catch { return link; } // encurtador fora: segue com o curto (não trava o post)
  }
  if (ehCurtoNosso(destino)) return link;

  // Amazon: página do produto com a tag da campanha → amzn.to (como a equipe postava); sem login, link longo
  if (plataforma === "amazon" || /amazon\.com\.br/.test(destino)) {
    if (/^https:\/\/(amzn\.to|link\.amazon)\//.test(destino)) return destino;
    const asin = destino.match(/\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})/i)?.[1];
    const tag = AMAZON_TAG_CAMPANHA[campanha] || "manualdorec0c-20";
    let longo = destino;
    if (asin) longo = `https://www.amazon.com.br/dp/${asin.toUpperCase()}?tag=${tag}`;
    else { try { const u = new URL(destino); if (u.hostname.endsWith("amazon.com.br")) { u.searchParams.set("tag", tag); longo = u.toString(); } } catch { /* segue */ } }
    return (await amazonCurto(longo)) || longo;
  }
  // Shopee: link curto oficial s.shopee.com.br gerado na hora (nosso afiliado)
  if (plataforma === "shopee" || /shopee\.com\.br/.test(destino)) {
    let u = destino;
    try { const o = new URL(destino).searchParams.get("origin_link"); if (o) u = o; } catch { /* segue */ }
    for (let i = 0; i < 3 && /s\.shopee\.com\.br\/(?!an_redir)/.test(u); i++) {
      try {
        const r = await fetch(u, { redirect: "manual", headers: { "user-agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(6000) });
        const loc = r.headers.get("location"); if (!loc) break; u = new URL(loc, u).toString();
      } catch { break; }
    }
    const m = u.match(/shopee\.com\.br\/(?:product|opaanlp)\/(\d+)\/(\d+)/) || u.match(/-i\.(\d+)\.(\d+)/);
    if (m) {
      const curto = await shopeeLinkCurto(`https://shopee.com.br/product/${m[1]}/${m[2]}`, campanha);
      if (curto) return curto;
    }
    return destino;
  }
  // ML: meli.la direto. Vitrine (posts de cupom) → meli.la fixo da vitrine, o mesmo que a equipe postava (04/Nov,
  // Bruno: "link de cupom do ML indo com URL gigante"). O gerador do ML (createLink) só aceita produto, então não dá pra
  // gerar um por campanha; este leva pra social/manualdorecemnascido com a etiqueta padrão da conta.
  if (/mercadolivre\.com\.br\/social\/manualdorecemnascido/.test(destino)) return ML_VITRINE_CURTO;
  return destino;
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
