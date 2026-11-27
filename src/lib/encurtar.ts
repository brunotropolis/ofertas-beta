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
const AMAZON_TAG_CAMPANHA: Record<string, string> = { m: "mrnofmaternas-20", f: "mrnoffraldas-20", c: "mrnofcupons-20", e: "mrnofenxoval-20", l: "mrnoflar-20", b: "mrnofmae-20", g: "buscadorgeek-20" }; // g = Buscador Geek (16/Nov); l/b = Lar e Mãe (26/Nov)
// 26/Nov (Bruno: medir as vendas de cada projeto): etiqueta do ML por campanha, gerada na hora de postar (antes o
// meli.la vinha da coleta com uma etiqueta só). Etiquetas criadas na conta do Manual. m segue asofertasmaternas
// (a etiqueta de sempre dos grupos, não quebra o histórico desde 23/10).
const ML_ETIQUETA_CAMPANHA: Record<string, string> = { m: "asofertasmaternas", f: "mrnoffraldas", c: "mrnofcupons", e: "mrnofenxoval", l: "mrnoflar", b: "mrnofmae" };
// Sessões candidatas, em ordem: 1) campanha LAR (slot só do servidor, gravado com a sessão da conta do Manual, que é
// a dona das etiquetas mrnof*); 2) campanha principal das Maternas (a extensão grava ali a sessão do Chrome dela, que em
// 26/11 era a conta Brunotropolis). Só vale o link se o ML devolver a MESMA etiqueta pedida (conta errada devolve a
// etiqueta padrão dela): assim nunca sai venda pra conta errada.
const ML_SESSOES = ["6ce489b0-dcfe-4726-a4a8-83eb6ba7ca21", "c3fa658f-fb1d-4a65-a978-3576506e62a0"];
let sessoesMl: { cookies: string[]; em: number } = { cookies: [], em: 0 };
async function cookiesMl(): Promise<string[]> {
  if (Date.now() - sessoesMl.em < 10 * 60e3) return sessoesMl.cookies;
  const out: string[] = [];
  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const db = createAdminClient();
    for (const id of ML_SESSOES) {
      const { data } = await db.rpc("get_platform_secrets", { p_campaign_id: id, p_platform: "ml" });
      const c = ((Array.isArray(data) ? data[0] : data) as { cookie?: string } | null)?.cookie;
      if (c && /(?:^|;\s*)_csrf=/.test(c)) out.push(c);
    }
  } catch { /* banco fora: segue sem trocar a etiqueta */ }
  sessoesMl = { cookies: out, em: Date.now() };
  return out;
}
/** meli.la com a etiqueta da campanha (sessão do ML guardada no painel); falhou = null e o post sai com o link de antes */
async function mlComEtiqueta(link: string, campanha: string): Promise<string | null> {
  const tag = ML_ETIQUETA_CAMPANHA[campanha];
  if (!tag) return null;
  let url = link;
  try {
    for (let i = 0; i < 4 && /meli\.la\//.test(url); i++) {
      const r = await fetch(url, { redirect: "manual", headers: { "user-agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(6000) });
      const loc = r.headers.get("location"); if (!loc) break; url = new URL(loc, url).toString();
    }
  } catch { return null; }
  // o meli.la de produto abre a vitrine (/social/<conta>?ref=...) com o produto no 1º card: pega o link dele
  if (/\/social\//.test(url) && /[?&]ref=/.test(url)) {
    try {
      const h = await (await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0 Safari/537.36" }, signal: AbortSignal.timeout(8000) })).text();
      const i = h.indexOf('"polycards"');
      const m = i >= 0 ? h.slice(i, i + 6000).match(/"url":"([^"]+)"/) : null;
      if (!m) return null;
      url = "https://" + m[1].replace(/\\u002F/g, "/").replace(/^https?:\/\//, "");
    } catch { return null; }
  }
  if (!/mercadolivre\.com\.br\//.test(url) || /\/social\//.test(url) || !/MLB/i.test(url)) return null; // só página de produto
  const produto = url.split("#")[0].split("?")[0];
  for (const cookie of await cookiesMl()) {
    const csrf = cookie.match(/(?:^|;\s*)_csrf=([^;]+)/)?.[1];
    if (!csrf) continue;
    try {
      const r = await fetch("https://www.mercadolivre.com.br/affiliate-program/api/v2/affiliates/createLink", {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json", origin: "https://www.mercadolivre.com.br", referer: "https://www.mercadolivre.com.br/afiliados/linkbuilder", "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0 Safari/537.36", "x-csrf-token": decodeURIComponent(csrf), cookie },
        body: JSON.stringify({ urls: [produto], tag }),
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) continue;
      const u0 = (await r.json())?.urls?.[0];
      if (u0?.short_url && u0.tag === tag) return u0.short_url;
    } catch { /* tenta a próxima sessão */ }
  }
  return null;
}
export const __mlComEtiqueta = mlComEtiqueta; // teste local
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
// 16/Nov: a sessão vem primeiro da extensão "Sessões de Afiliado" (gravada criptografada na campanha principal do
// Maternas, sempre fresca); o env AMAZON_SITESTRIPE_COOKIE fica de reserva. Cache de 10 min pra não ler o banco a cada post.
// 19/Nov: a cópia da sessão vencia ~30-40 min depois de chegar (9h47 de 19/11 os posts saíram longos): o servidor
// não guardava os cookies que a Amazon devolve a cada chamada (session-id etc.) e, com a sessão morta, ainda
// segurava a cópia por 10 min. Agora: (1) junta o Set-Cookie da Amazon na cópia em memória, como um navegador;
// (2) resposta ruim zera o cache e tenta de novo na hora com a sessão mais nova do banco (a extensão manda a cada troca).
let sessaoAmz: { cookie: string | null; em: number; base: string | null } = { cookie: null, em: 0, base: null };
function juntarCookies(cookie: string, setCookies: string[]): string {
  if (!setCookies.length) return cookie;
  const jar = new Map(cookie.split(/;\s*/).filter(Boolean).map((kv) => { const i = kv.indexOf("="); return [kv.slice(0, i), kv.slice(i + 1)] as [string, string]; }));
  for (const sc of setCookies) {
    const kv = sc.split(";")[0]; const i = kv.indexOf("=");
    if (i <= 0) continue;
    const v = kv.slice(i + 1);
    if (!v || /^(deleted|"")$/.test(v) || /max-age=0|expires=thu, 01[- ]jan[- ]1970/i.test(sc)) continue; // nunca apaga login
    jar.set(kv.slice(0, i), v);
  }
  return [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
}
async function cookieAmazon(): Promise<string | null> {
  if (Date.now() - sessaoAmz.em < 10 * 60e3) return sessaoAmz.cookie || process.env.AMAZON_SITESTRIPE_COOKIE || null;
  let c: string | null = null;
  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const db = createAdminClient();
    const { data: pf } = await db.from("perfis").select("id").eq("slug", "ofertas-maternas").maybeSingle();
    const { data: camp } = pf ? await db.from("campaigns").select("id").eq("perfil_id", pf.id).order("created_at").limit(1).maybeSingle() : { data: null };
    if (camp) {
      const { data } = await db.rpc("get_platform_secrets", { p_campaign_id: camp.id, p_platform: "amazon" });
      c = (Array.isArray(data) ? data[0]?.cookie : null) || null;
    }
  } catch { /* banco fora: segue com o env */ }
  // mesma sessão do banco de antes: mantém a cópia em memória (que já tem os cookies que a Amazon devolveu)
  if (c && c === sessaoAmz.base && sessaoAmz.cookie) sessaoAmz = { ...sessaoAmz, em: Date.now() };
  else sessaoAmz = { cookie: c, em: Date.now(), base: c };
  return sessaoAmz.cookie || process.env.AMAZON_SITESTRIPE_COOKIE || null;
}
async function amazonCurto(longo: string, tentativa = 1): Promise<string | null> {
  const cookie = await cookieAmazon();
  const marca = (ok: boolean, erro: string | null) => Object.assign(amazonCurtoStatus, { ok, erro, quando: new Date().toISOString() });
  if (!cookie) { marca(false, "sem login da Amazon no servidor (extensão ou AMAZON_SITESTRIPE_COOKIE)"); return null; }
  const emCache = cacheAmzn.get(longo);
  if (emCache) return emCache;
  const deNovo = async (erro: string) => {
    const usada = sessaoAmz.base;
    sessaoAmz = { cookie: null, em: 0, base: null }; // próxima leitura vai no banco
    if (tentativa === 1) { await cookieAmazon(); if (sessaoAmz.base && sessaoAmz.base !== usada) return amazonCurto(longo, 2); }
    marca(false, erro); return null;
  };
  try {
    const r = await fetch(`https://www.amazon.com.br/associates/sitestripe/getShortUrl?longUrl=${encodeURIComponent(longo)}&marketplaceId=526970`, {
      redirect: "manual",
      headers: { cookie, "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36", accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    const sc = typeof r.headers.getSetCookie === "function" ? r.headers.getSetCookie() : [];
    if (sc.length && sessaoAmz.cookie === cookie) sessaoAmz.cookie = juntarCookies(cookie, sc);
    if (r.status !== 200) return deNovo(`Amazon respondeu ${r.status} (login caiu?)`);
    const j = await r.json().catch(() => null);
    const curto = j?.shortUrl as string | undefined;
    if (!curto || !/^https:\/\/(amzn\.to|link\.amazon)\//.test(curto)) { marca(false, "Amazon não devolveu link curto"); return null; }
    marca(true, null);
    if (cacheAmzn.size > 2000) cacheAmzn.clear();
    cacheAmzn.set(longo, curto);
    return curto;
  } catch (e) { marca(false, `falha ao chamar a Amazon: ${String(e).slice(0, 80)}`); return null; }
}

// 19/Nov (Bruno: "vamos de 1"): caminho principal do amzn.to = extensão "Buscador Geek" no Chrome logado. O gatilho
// da publication_queue já pede o link quando a oferta entra na fila; aqui usa o cache (amzn.to não vence). Se ainda
// não tem, pede e espera até 75 s, mas só se a extensão deu sinal nos últimos 5 min (Chrome ligado).
async function curtoDaExtensao(asin: string, tag: string): Promise<string | null> {
  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const db = createAdminClient();
    const ler = async () => (await db.from("amazon_links").select("curto, status").eq("asin", asin).eq("tag", tag).maybeSingle()).data;
    let row = await ler();
    if (row?.status === "ok" && row.curto) return row.curto as string;
    if (!row) await db.from("amazon_links").upsert({ asin, tag }, { onConflict: "asin,tag", ignoreDuplicates: true });
    const { data: tk } = await db.from("extensao_tokens").select("last_used_at").is("revoked_at", null).order("last_used_at", { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
    const viva = tk?.last_used_at && Date.now() - Date.parse(tk.last_used_at as string) < 5 * 60e3;
    if (!viva) return null;
    for (let i = 0; i < 15; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      row = await ler();
      if (row?.status === "ok" && row.curto) return row.curto as string;
    }
  } catch (e) { console.warn("[amazon-links]", e instanceof Error ? e.message : e); }
  return null;
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
    if (asin) { const c = await curtoDaExtensao(asin.toUpperCase(), tag); if (c) return c; }
    return (await amazonCurto(longo)) || longo; // reserva: cópia do cookie no servidor; sem ela, link longo
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
    } else if (/shopee\.com\.br\/(user\/voucher|m\/|search|collections|shop)/.test(u)) {
      // 26/Nov: link de cupom (carteira, página de campanha) também leva a marca da campanha
      const curto = await shopeeLinkCurto(u, campanha);
      if (curto) return curto;
    }
    return destino;
  }
  // ML: meli.la direto. Vitrine (posts de cupom) → meli.la fixo da vitrine, o mesmo que a equipe postava (04/Nov,
  // Bruno: "link de cupom do ML indo com URL gigante"). O gerador do ML (createLink) só aceita produto, então não dá pra
  // gerar um por campanha; este leva pra social/manualdorecemnascido com a etiqueta padrão da conta.
  // 27/11 (Bruno: "pq as urls não estão encurtadas? magalu, amazon, natura"): Magalu e Natura não têm encurtador
  // oficial; o link fica com o domínio da loja (decisão 04/Nov: não esconder a loja), só sem o nome do produto.
  // Testados no Chrome/curl: abrem o produto e mantêm a loja da Day (magazinemanualdorn / consultoria).
  const mg = destino.match(/^https:\/\/www\.magazinevoce\.com\.br\/([^/?#]+)\/[^?#]*?\/p\/([a-z0-9]{6,})\//i);
  if (mg) return `https://www.magazinevoce.com.br/${mg[1]}/p/${mg[2]}/`;
  const nt = destino.match(/^https:\/\/www\.minhaloja\.natura\.com\/p\/[^/?#]+\/((?:NAT|AVN)BRA-\d+)/i);
  if (nt) {
    const cons = (destino.match(/[?&]consultoria=([^&#]+)/) || [])[1] || "manualdorecemnascido";
    return `https://www.minhaloja.natura.com/p/x/${nt[1].toUpperCase()}?consultoria=${cons}${/^AVN/i.test(nt[1]) ? "&marca=avon" : ""}`;
  }
  if (/mercadolivre\.com\.br\/social\/manualdorecemnascido/.test(destino)) return ML_VITRINE_CURTO;
  if (plataforma === "ml" || /meli\.la\/|mercadolivre\.com\.br/.test(destino)) {
    const comTag = await mlComEtiqueta(destino, campanha);
    if (comTag) return comTag;
  }
  return destino;
}

/** Marca do grupo no link: nº do "As Ofertas Maternas #N"; outros grupos = final do id. */
export function marcaGrupo(groupName: string | null | undefined, jid: string): string {
  const m = (groupName || "").match(/^As Ofertas Maternas\s*#\s*(\d+)/i);
  return m ? m[1] : "x" + jid.replace(/\D/g, "").slice(-6);
}

/** Marca no link: grupo (g) + campanha (c: m=Maternas, f=Fraldas, c=Cupons, e=Enxoval) — lidos pelo encurtador no clique. */
export const CAMPANHA_CODIGO: Record<string, string> = { geral: "m", fraldas: "f", cupons: "c", enxoval: "e" };
/** 26/Nov: Lar e Mãe são "mix" (geral) mas medem venda à parte: l = Lar, b = Mãe (beleza e bem-estar) */
export const PERFIL_CODIGO: Record<string, string> = { "ofertas-lar": "l", "ofertas-mae": "b" };
export const codigoCampanha = (slug: string | null | undefined, categoria: string | null | undefined) =>
  (slug && PERFIL_CODIGO[slug] && (categoria ?? "geral") === "geral") ? PERFIL_CODIGO[slug] : (CAMPANHA_CODIGO[categoria ?? "geral"] ?? "m");
export const comGrupo = (link: string, g: string, c?: string) =>
  `${link}${link.includes("?") ? "&" : "?"}g=${g}${c ? `&c=${c}` : ""}`;
