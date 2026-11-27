// Leitor de canais públicos do Telegram → /api/ingest (perfil Ofertas Maternas).
// Fonte única: este arquivo é colado no Code node do n8n "OFERTAS MATERNAS | Telegram Leitor"
// (scripts/build_telegram_leitor.mjs monta o nó) e também roda local pra teste
// (scripts/telegram-leitor.test.mjs). Não depende de login: lê t.me/s/<canal>.
//
// ctx = { http, sha256, state, kw, cfg, log }
//   http({url, method, headers, body, manual}) → { status, headers, body }
//   sha256(str) → hex
//   state: objeto persistente { last: { canal: ultimoId } }
//   kw: palavras-chave do perfil (lidas do painel)
//   cfg: { channels, shopee:{appId,secret}, ml:{cookie,csrf,tag,social}, amazonTag, firstRunHours, dryRun }

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36";

const BABY = /beb[eê]|fralda|infantil|len[cç]os? umedecid|mamadeira|chupeta|gestante|matern|carrinho de beb|ber[cç]o|banheira|bab[aá] eletr|kids|crian[cç]a|brinquedo|pampers|huggies|mamypoko|babysec|pom ?pom|personal baby|turma da m[oô]nica baby|johnson'?s baby|granado beb|bepantol baby|baruel baby|desitin|fisher.?price|assadura|enxoval|cadeirinha|beb[eê] conforto|amamenta|tapete de atividade|andador|mordedor|naninha|dia das crian|buba|chicco|galzerano|burigotto|cosco|styll baby|safety 1st|nuk\b|avent|lillo|kababy|multikids baby/i;
const CUPOM_FORA = /\bmoda\b|beleza|decor|\bcasa\b|eletr[oô]n|celular|smartphone|perfum|\bpet\b|m[oó]veis|esporte|games?\b|inform[aá]tica|ferrament|automot|supermercado|bebidas?|vinho|cerveja|maquiagem|skincare|\btv\b|notebook/i;
// 25/Nov (Bruno: "buscar cupons da magazine Luiza, Natura e outros que temos no telegram, já que agora vamos voltar a
// postar"): o que não é de bebê mas é de casa vai pro grupo Ofertas Maternas para o Lar; beleza/autocuidado pro grupo da Mãe.
const LAR_TG = /amaciante|sab[aã]o (em p[oó]|l[ií]quido)|lava[- ]?roupas?|detergente|desinfetante|[aá]gua sanit[aá]ria|limpador|multiuso|papel (higi[eê]nico|toalha)|panelas?\b|frigideira|potes? (herm[eé]tic|de vidro|de mantimento|organizador)|kit (de )?potes|air ?fryer|fritadeira|liquidificador|cafeteira|caf[eé] (em p[oó]|pil[aã]o|melitta|tr[eê]s cora)|\bcozinha\b|toalhas? de banho|len[cç]ol|edredom|travesseiro|organizador|aspirador|\bmop\b|vassoura|ferro de passar|utens[ií]lios?|garrafa t[eé]rmica|lavanderia|varal|decora/i;
// 25/Nov (Bruno: "no ofertas do lar foi um notebook?"): o post dizia "PRA TRABALHAR OU ESTUDAR EM CASA" e o "casa" solto
// mandava pro Lar. Tirei o "casa" e eletrônico/informática nunca vai pro Lar (eletroportátil de cozinha segue).
const NAO_LAR = /notebook|laptop|chromebook|macbook|computador|\bpc\b|monitor|celular|smartphone|iphone|galaxy|tablet|\bipad\b|smart ?tv|\btv\b|televis|console|playstation|\bps[45]\b|xbox|nintendo|placa de v[ií]deo|processador|\bssd\b|hd externo|mem[oó]ria ram|teclado|mouse|headset|fone de ouvido|caixa de som|smartwatch|rel[oó]gio inteligente|impressora|roteador|c[aâ]mera|drone|gamer/i;
const MAE_TG = /shampoo|condicionador|m[aá]scara (capilar|de hidrata)|[oó]leo (capilar|corporal)|creme de pentear|cabelos?\b|maquiagem|batom|base l[ií]quida|corretivo|r[ií]mel|m[aá]scara de c[ií]lios|esmalte|\bunhas?\b|perfume|col[oô]nia|desodorante|hidratante|protetor solar|s[eé]rum|skin ?care|sabonete facial|body splash|secador|chapinha|escova secadora|depila|cadiveu|natura\b|botic[aá]rio|eudora|oc[eé]ane|nivea|dove\b|l'?or[eé]al|vult|ruby rose|\bbeleza\b|autocuidado/i;
const NAO_MAE = /masculin|barba|barbear|\bhomem\b|\bmen\b|infantil|kids/i;
const MAGALU_VITRINE = "https://www.magazinevoce.com.br/magazinemanualdorn/";
// perfil de um post que não é de bebê: casa > Lar, beleza > Mãe, resto fica fora
function perfilCasaOuBeleza(t) {
  if (MAE_TG.test(t) && !NAO_MAE.test(t)) return "ofertas-mae";
  if (LAR_TG.test(t) && !NAO_LAR.test(t)) return "ofertas-lar";
  return null;
}
// Post feito PRA AFILIADO (canais oficiais tipo @afiliadosshopeebroficial e "Crescendo com o Meli"): avisos do
// programa, comissão, "Sextou, Afiliado(a)!". Nunca pode ir pros grupos (23/Out saiu um nos 170 grupos).
const PRA_AFILIADO = /afiliad[oa]s?\b|afiliad[oa]\(a\)|\bcomiss(?:[aã]o|[oõ]es)\b|seus links|link de afiliad|programa de afiliad|criador(?:es|a)? de conte[uú]do|painel de afiliad|\bcreators?\b/i;
// Oferta falsa / troll (26/Out, Bruno: "não cair em enviar link falso"). Tem gente que posta oferta de propósito
// (até produto adulto) pra pegar quem copia por robô. 3 travas antes de aceitar produto do Telegram/WhatsApp:
// (1) palavra proibida no post ou no nome oficial; (2) nome do post sem NADA a ver com o produto do link;
// (3) preço da loja bem acima do que o post promete (oferta falsa ou já acabou).
const PROIBIDO = /\bsex(?:o|y| ?shop|ual\w*)\b|er[oó]tic|consolo|vibrador|p[eê]nis|lubrificante [ií]ntimo|fetiche|bdsm|preservativo|camisinha|pornogr|\bxxx\b|\barma\b|pistola|rev[oó]lver|muni[cç][aã]o|soco ingl[eê]s|canivete|faca t[aá]tica|cigarr|\bvape\b|narguil|tabaco|maconha|cannabis|anabolizante|esteroide|abortiv|cytotec|cassino|\baposta/i;
const PALAVRA_VAZIA = new Set(["para", "com", "sem", "kit", "unidades", "unidade", "cada", "promocao", "oferta", "frete", "gratis", "novo", "nova", "original", "pacote", "tamanho", "cor", "preto", "branco", "infantil", "bebe"]);
function palavras(t) { return new Set(norm(t).replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length >= 4 && !PALAVRA_VAZIA.has(w) && !/^\d+$/.test(w))); }
function nomeBate(tituloPost, oficial) {
  const a = palavras(tituloPost), b = palavras(oficial);
  if (a.size < 2 || b.size < 2) return true; // pouco texto pra julgar
  for (const w of a) if (b.has(w) || [...b].some((x) => x.length >= 5 && w.length >= 5 && (x.startsWith(w.slice(0, 5)) || w.startsWith(x.slice(0, 5))))) return true;
  return false;
}
// "ESGOTADO" (o canal costuma EDITAR o post depois). "Esgota rápido" é chamada de urgência, não conta.
const ESGOTADO = /\besgotad[oa]s?\b|\besgotou\b|\bacabou o estoque\b|\bsem estoque\b/i;
const STOP_CODES = new Set(["OFF", "PIX", "FULL", "SHOPEE", "CUPOM", "CUPONS", "MERCADO", "LIVRE", "AMAZON", "PRIME", "LINK", "ATIVE", "AQUI", "ALERTA", "SAIU", "SAINDO", "RESGATE", "CARRINHO", "LOJAS", "OFICIAIS", "RELAMPAGO", "OFERTA", "OFERTAS", "BRL", "FRETE", "GRATIS", "HOJE", "AGORA", "CORRE", "RAPIDO", "MAGALU", "LISTA", "SITE", "CODIGO", "VOLTOU", "BAIXOU", "PROMO", "PROMOCAO", "ACIMA", "LIMITE", "ATENCAO", "URGENTE", "NOVO", "NOVOS", "DESCONTO", "VALE"]);

function norm(s) { return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }
function decodeHtml(s) {
  return (s || "").replace(/<br\s*\/?>/g, "\n").replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n));
}
// n8n (Code node) não tem o global URL → junta Location relativo na mão
function joinUrl(loc, base) {
  if (/^https?:\/\//i.test(loc)) return loc;
  if (loc.startsWith("//")) return base.split("//")[0] + loc;
  const origin = (base.match(/^https?:\/\/[^/]+/i) || [""])[0];
  if (loc.startsWith("/")) return origin + loc;
  return base.replace(/[^/]*([?#].*)?$/, "") + loc;
}
function money(s) { if (!s) return null; const n = parseFloat(String(s).replace(/\./g, "").replace(",", ".")); return isFinite(n) && n > 0 ? n : null; }
// tira assinatura/divulgação de outros canais do texto (t.me/xxx, @canal) — 10/Out (t.me/sddescontos ia pra legenda)
function semCanal(t) { return t.replace(/(?:https?:\/\/)?(?:t|telegram)\.me\/\S+/gi, "").replace(/(^|\s)@[A-Za-z0-9_]{4,}/g, "$1").replace(/[ \t]+\n/g, "\n").trim(); }
function brtStamp(ms) { return new Date(ms - 3 * 3600_000).toISOString().slice(0, 10).replace(/-/g, ""); }

// ── 1. Ler o canal (página pública) ────────────────────────────────────────
function parseChannel(html, channel) {
  const out = [];
  const parts = html.split('class="tgme_widget_message_wrap');
  for (const blk of parts.slice(1)) {
    const pid = (blk.match(/data-post="[^"/]+\/(\d+)"/) || [])[1];
    if (!pid) continue;
    const tm = (blk.match(/datetime="([^"]+)"/) || [])[1];
    const tx = blk.match(/class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    if (!tx) continue;
    const links = [...tx[1].matchAll(/href="(https?:\/\/[^"]+)"/g)].map((m) => decodeHtml(m[1]));
    const photo = (blk.match(/tgme_widget_message_photo_wrap[^>]*background-image:url\('([^']+)'\)/) || [])[1] || null;
    out.push({ channel, id: +pid, time: tm ? Date.parse(tm) : Date.now(), text: semCanal(decodeHtml(tx[1])), links, photo });
  }
  return out;
}

// ── 2. Classificar ─────────────────────────────────────────────────────────
function classify(p) {
  const t = p.text;
  if (t.length < 40 || /pinned|fixou|formul[aá]rio|inscrev|forms\.gle|zoom\.us/i.test(t)) return "ruido";
  const first = norm(t.split("\n")[0]);
  const temPreco = /R\$ ?\d/.test(t);
  const porPreco = /\bpor:? ?R\$/i.test(t) || /🔥 ?por/i.test(t);
  if (/cupo[mn]s?\b/.test(first) && !porPreco) return "cupom";
  if (/(off|desconto)\s+(acima|em|nas compras|a partir)/i.test(t) && !porPreco) return "cupom";
  if (temPreco) return "produto";
  return "ruido";
}

function platformOf(u) {
  if (/shopee|shp\.ee/.test(u)) return "shopee";
  if (/amzn\.|amazon\.|link\.amazon/.test(u)) return "amazon";
  if (/meli\.la|mercadoli|mercadolibre/.test(u)) return "ml";
  if (/magazineluiza\.com|magazinevoce\.com|divulgador\.magalu|magalu\.com|mglu\.io|magazineluiza\.onelink/.test(u)) return "magalu";
  if (/reduz\.|cutt\.ly|bit\.ly|tinyurl/.test(u)) return "short";
  return null;
}

function nicheOk(text, kw) {
  if (BABY.test(text)) return true;
  const n = norm(text);
  return kw.some((k) => k && n.includes(norm(k)));
}

function extractCodes(t) {
  const codes = [];
  const lines = t.split("\n");
  for (const l of lines) {
    const hint = /cupo[mn]|c[oó]digo|🎟|🏷/i.test(l);
    for (const m of l.matchAll(/\b([A-Z0-9]{4,20})\b/g)) {
      const c = m[1];
      if (!/[A-Z]/.test(c) || STOP_CODES.has(c)) continue;
      if (/^\d+$/.test(c)) continue;
      // código "solto" só conta se a linha fala de cupom ou é só o código
      if (hint || l.replace(/[^\w]/g, "") === c || /^[^\w]*[A-Z0-9]{4,20}[^\w]*$/.test(l.trim())) {
        if (!codes.includes(c)) codes.push(c);
      }
    }
  }
  return codes.slice(0, 6);
}

function titleOf(t) {
  const lines = t.split("\n").map((l) => l.replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}\u{2B00}-\u{2BFF}‼️*_~>]/gu, "").trim());
  const bad = /https?:|R\$|cupo[mn]|compre|frete|vendido por|site confi|tempo limitado|selecione|programe e poupe|resgate|clique|aproveit|parcel|^por\b|^de\b|exclusivo|membros prime|amazon prime|recorr[eê]ncia|adicione|confira o desconto|tela de pagamento/i;
  const hype = /esgota|voltou|baixou|prefere|nova fragr|pacote maior|lan[cç]amento|corre+|aproveit|alerta|presente|imperd[ií]vel|caiu+|pode aproveitar|chega antes|de olho|menor pre[cç]o|achadinho|oferta/i;
  const cand = lines.filter((l) => l.length >= 12 && /[a-zà-ú]/.test(l) && !bad.test(l) && !(l.length < 40 && hype.test(l)) && !/!$/.test(l));
  return (cand[0] || lines.find((l) => l.length > 5) || "").slice(0, 200);
}

function pricesOf(t) {
  const cur = money((t.match(/\bpor:?\s*R\$\s*([\d.]+(?:,\d{1,2})?)/i) || [])[1]) ?? money((t.match(/R\$\s*([\d.]+(?:,\d{1,2})?)/) || [])[1]);
  const orig = money((t.match(/\bde:?\s*R\$\s*([\d.]+(?:,\d{1,2})?)/i) || [])[1]);
  return { cur, orig: orig && cur && orig > cur ? orig : null };
}

// instruções do post de origem → promo_meta (a legenda repete no padrão do grupo)
function promoFlags(t) {
  const f = {};
  if (/programe e poupe|comprar com recorr[eê]ncia|recorr[eê]ncia/i.test(t)) f.programe_poupe = true;
  if (/exclusivo (para|pra) membros prime|oferta prime|s[oó] (para|pra) prime/i.test(t)) f.prime_exclusive = true;
  if (/confira o desconto|tela de pagamento/i.test(t)) f.confira_pagamento = true;
  const v = t.match(/vendido por:?\s*([A-Za-zÀ-ú0-9 &.'-]{2,40}?)(?:\.|\n|$)/i);
  if (v && !/amazon|mercado livre|shopee/i.test(v[1])) f.vendido_por = v[1].trim();
  const a = t.match(/adicione\s+(\d+)\s+ou mais/i);
  if (a) f.adicione_n = +a[1];
  return f;
}

// ── 3. Resolver encurtador → URL final ────────────────────────────────────
async function resolve(ctx, url) {
  let u = url;
  for (let i = 0; i < 8; i++) {
    let r;
    try { r = await ctx.http({ url: u, manual: true, headers: { "user-agent": UA } }); } catch (e) { return { url: u, body: "" }; }
    const loc = r.headers?.location;
    if (r.status >= 300 && r.status < 400 && loc) { u = joinUrl(loc, u); continue; }
    const body = typeof r.body === "string" ? r.body : "";
    const ret = u.match(/[?&]u=([^&]+)/);
    if (/retarget/.test(u) && ret) { u = decodeURIComponent(ret[1]); continue; }
    if (/^https?:\/\/(link\.amazon|reduz\.|cutt\.ly)/.test(u)) {
      const m = body.match(/(?:window\.location(?:\.href)?\s*=\s*|http-equiv="refresh"[^>]*url=)["']?([^"'\s>]+)/i)
        || body.match(/(https?:\/\/(?:www\.)?(?:amazon\.com\.br|mercadolivre\.com\.br|meli\.la|shopee\.com\.br|s\.shopee\.com\.br)[^"'\s<\\]+)/);
      if (m && m[1].startsWith("http") && m[1] !== u) { u = decodeHtml(m[1]); continue; }
    }
    return { url: u, body };
  }
  return { url: u, body: "" };
}

// ── 4. Gerar NOSSO link de afiliado ───────────────────────────────────────
async function shopeeShort(ctx, originUrl) {
  const { appId, secret } = ctx.cfg.shopee;
  const body = JSON.stringify({ query: `mutation{generateShortLink(input:{originUrl:${JSON.stringify(originUrl)},subIds:["telegram"]}){shortLink}}` });
  const ts = Math.floor(Date.now() / 1000).toString();
  const sig = ctx.sha256(appId + ts + body + secret);
  const r = await ctx.http({ url: "https://open-api.affiliate.shopee.com.br/graphql", method: "POST", headers: { "content-type": "application/json", authorization: `SHA256 Credential=${appId},Timestamp=${ts},Signature=${sig}` }, body });
  const j = typeof r.body === "string" ? JSON.parse(r.body) : r.body;
  return j?.data?.generateShortLink?.shortLink || null;
}

async function shopeeInfo(ctx, shopId, itemId) {
  const { appId, secret } = ctx.cfg.shopee;
  const body = JSON.stringify({ query: `{productOfferV2(shopId:${+shopId},itemId:${+itemId},limit:1){nodes{productName imageUrl priceMin}}}` });
  const ts = Math.floor(Date.now() / 1000).toString();
  const r = await ctx.http({ url: "https://open-api.affiliate.shopee.com.br/graphql", method: "POST", headers: { "content-type": "application/json", authorization: `SHA256 Credential=${appId},Timestamp=${ts},Signature=${ctx.sha256(appId + ts + body + secret)}` }, body });
  const j = typeof r.body === "string" ? JSON.parse(r.body) : r.body;
  return j?.data?.productOfferV2?.nodes?.[0] || null;
}

// Amazon Creators API (getItems): foto 500px + título oficial. Token reaproveitado na rodada.
async function amazonInfo(ctx, asin) {
  const a = ctx.cfg.amazon;
  if (!a?.accessKey) return null;
  if (!ctx._amzToken) {
    const t = await ctx.http({ url: "https://api.amazon.com/auth/o2/token", method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ grant_type: "client_credentials", client_id: a.accessKey, client_secret: a.secretKey, scope: "creatorsapi::default" }) });
    ctx._amzToken = (typeof t.body === "string" ? JSON.parse(t.body) : t.body).access_token;
  }
  const r = await ctx.http({ url: "https://creatorsapi.amazon/catalog/v1/getItems", method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + ctx._amzToken, "x-marketplace": "www.amazon.com.br" }, body: JSON.stringify({ itemIds: [asin], partnerTag: a.partnerTag, marketplace: "www.amazon.com.br", resources: ["images.primary.large", "itemInfo.title", "offersV2.listings.price", "offersV2.listings.dealDetails", "offersV2.listings.availability", "offersV2.listings.merchantInfo"] }) });
  const it = (typeof r.body === "string" ? JSON.parse(r.body) : r.body)?.itemsResult?.items?.[0];
  if (!it) return null;
  const l = it.offersV2?.listings?.[0] || {};
  const ppu = l.price?.pricePerUnit;
  return {
    image: it.images?.primary?.large?.url || null, title: it.itemInfo?.title?.displayValue || null,
    outOfStock: l.availability?.type === "OUT_OF_STOCK",
    price: l.price?.money?.amount ?? null, original: l.price?.savingBasis?.money?.amount ?? null,
    promo: {
      prime_exclusive: l.dealDetails?.accessType === "PRIME_EXCLUSIVE" || undefined,
      badge: l.dealDetails?.badge || undefined, deal_end: l.dealDetails?.endTime || undefined,
      unit_price: ppu && /unidade/i.test(ppu.displayAmount || "") ? ppu.amount : undefined,
      amazon_seller: l.merchantInfo?.name ? /amazon/i.test(l.merchantInfo.name) : undefined,
    },
  };
}

async function mlCreateLink(ctx, productUrl) {
  // 16/Nov: Buscador Geek gera o link na conta ML própria dele (BRUNOTROPOLIS, sessão vinda da extensão);
  // sem essa sessão, cai na conta do Manual com a etiqueta padrão (como era desde 09/Nov)
  const conta = ctx._mlConta === "geek" && ctx.cfg.mlGeek?.cookie ? ctx.cfg.mlGeek : ctx.cfg.ml;
  const { cookie, csrf } = conta;
  const tag = ctx._mlTag || conta.tag;
  const r = await ctx.http({
    url: "https://www.mercadolivre.com.br/affiliate-program/api/v2/affiliates/createLink", method: "POST",
    headers: { accept: "application/json", "content-type": "application/json", origin: "https://www.mercadolivre.com.br", referer: "https://www.mercadolivre.com.br/afiliados/linkbuilder", "user-agent": UA, "x-csrf-token": csrf, cookie },
    body: JSON.stringify({ urls: [productUrl], tag }),
  });
  const j = typeof r.body === "string" ? JSON.parse(r.body) : r.body;
  if (r.status === 401) throw new Error("ML_UNAUTHORIZED");
  ctx._mlLast = j?.urls?.[0] || null; // título do produto + long_url (vitrine com ele em 1º, de onde sai a foto)
  return j?.urls?.[0]?.short_url || null;
}

// produto: link do post → { platform, ref, url, affiliate_url }
async function productLink(ctx, links) {
  for (const l of links) {
    const plat = platformOf(l);
    if (!plat) continue;
    const r0 = await resolve(ctx, l);
    const body = r0.body;
    let url = r0.url;
    // 09/Nov: tinyurl do canal de afiliados do ML cai na verificação de conta do ML (?go=<produto>) ou no
    // redirecionador do Google (?q=<produto>) → pega o produto de dentro
    const emb = url.match(/[?&](?:go|q)=([^&]+)/);
    if (emb && /account-verification|google\.com\/url/.test(url)) { try { url = decodeURIComponent(emb[1]); } catch { /* segue */ } }
    const p2 = platformOf(url);
    if (p2 === "amazon") {
      const asin = (url.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/) || [])[1];
      if (!asin) continue; // amzn.to → página do Prime etc.
      const info = await amazonInfo(ctx, asin).catch(() => null);
      if (info?.outOfStock) return { esgotado: true };
      return { platform: "amazon", ref: asin, url: `https://www.amazon.com.br/dp/${asin}`, affiliate_url: `https://www.amazon.com.br/dp/${asin}?tag=${ctx.cfg.amazonTag}`, image: info?.image || null, officialTitle: info?.title || null, amazon: info };
    }
    if (p2 === "shopee") {
      const m = url.match(/\/product\/(\d+)\/(\d+)/) || url.match(/-i\.(\d+)\.(\d+)/) || url.match(/shopee\.com\.br\/[^/?]+\/(\d+)\/(\d+)/);
      if (!m) continue;
      const clean = `https://shopee.com.br/product/${m[1]}/${m[2]}`;
      const aff = await shopeeShort(ctx, clean);
      if (!aff) continue;
      const info = await shopeeInfo(ctx, m[1], m[2]).catch(() => null);
      return { platform: "shopee", ref: m[2], url: clean, affiliate_url: aff, image: info?.imageUrl || null, officialTitle: info?.productName || null, lojaPreco: info?.priceMin ? +info.priceMin : null };
    }
    if (p2 === "magalu") {
      // 20/Nov: Magalu (vitrine da Day). O painel troca pelo link da vitrine e o Chrome do operador lê foto/preço
      // (site dá 403 pro servidor). Aqui só acha o produto: <slug>/p/<sku>/<cat>/<sub>.
      let path = "", seller = null; try { const uu = new URL(url); path = uu.pathname.replace(/^\/magazine[a-z0-9_-]+(?=\/)/i, ""); seller = uu.searchParams.get("seller_id"); } catch { continue; }
      const m = path.match(/^\/([a-z0-9-]+)\/(?:p|divulgador\/oferta)\/([a-z0-9]{6,14})\/([a-z]{2})\/([a-z0-9]{2,8})/i);
      if (!m) continue;
      const vend = seller && /^[a-z0-9_-]{2,60}$/i.test(seller) ? `?seller_id=${seller.toLowerCase()}` : "";
      const canon = `https://www.magazineluiza.com.br/${m[1]}/p/${m[2].toLowerCase()}/${m[3].toLowerCase()}/${m[4].toLowerCase()}/${vend}`;
      return { platform: "magalu", ref: m[2].toLowerCase(), url: canon, affiliate_url: canon, image: null, officialTitle: null, lojaPreco: null };
    }
    if (p2 === "ml") {
      let prod = null, mlImage = null;
      if (/\/p\/MLB\d+|produto\.mercadolivre\.com\.br\/MLB-?\d+|\/MLB-\d+|\/up\/MLBU\d+/.test(url)) prod = url.split(/[?#]/)[0];
      else if (/mercadolivre\.com\.br\/[a-z0-9-]{10,}/i.test(url) && !/\/social\/|account-verification/.test(url)) prod = url.split(/[?#]/)[0]; // página de produto com nome na URL
      else if (/\/social\//.test(url) && body) {
        // vitrine do afiliado → 1º card (produto em destaque do link)
        const m = body.match(/"polycards":\[\{[\s\S]*?"url":"([^"]+)"/);
        const pic = body.match(/"polycards":\[\{[\s\S]*?"pictures":\[\{"id":"([^"]+)"/);
        if (pic) mlImage = `https://http2.mlstatic.com/D_${pic[1]}-O.jpg`;
        if (m) prod = "https://" + m[1].replace(/\\u002F/g, "/").replace(/^https?:\/\//, "").split(/[?#]/)[0];
      }
      if (!prod) continue;
      const aff = await mlCreateLink(ctx, prod);
      if (!aff) continue;
      const ref = (prod.match(/MLB-?(\d+)/) || [])[1] || prod;
      // 09/Nov: link direto de produto (canal de afiliados do ML) não traz foto → a vitrine do nosso link
      // (long_url do createLink) abre com o produto em 1º; a foto sai do 1º card, como no caso /social/
      let tituloMl = null;
      if (ctx._mlLast) {
        tituloMl = ctx._mlLast.title || null;
        if (!mlImage && ctx._mlLast.long_url) {
          try {
            const v = await ctx.http({ url: ctx._mlLast.long_url, headers: { "user-agent": UA } });
            const pic = String(v.body || "").match(/"polycards":\[\{[\s\S]*?"pictures":\[\{"id":"([^"]+)"/);
            if (pic) mlImage = `https://http2.mlstatic.com/D_${pic[1]}-O.jpg`;
          } catch { /* sem foto: fica no painel */ }
        }
      }
      // 18/Nov: preço do ML na página do produto (og:title "... - R$ 48,90") pra conferir com o post
      let mlPreco = null;
      try {
        const pg = String((await ctx.http({ url: prod, headers: { "user-agent": UA } })).body || "");
        const og = pg.match(/og:title"\s+content="[^"]*?- R\$ ([\d.]+(?:,\d{1,2})?)"/) ;
        if (og) mlPreco = +og[1].replace(/\./g, "").replace(",", ".");
        else { const ip = pg.match(/itemprop="price"\s+content="([\d.]+)"/); if (ip) mlPreco = +ip[1]; }
      } catch { /* sem preço: o dispatcher confere de novo antes de postar */ }
      return { platform: "ml", ref, url: prod, affiliate_url: aff, image: mlImage, officialTitle: tituloMl, lojaPreco: mlPreco };
    }
  }
  return null;
}

// cupom: loja + nosso link da página de cupons/vitrine
async function couponLink(ctx, p) {
  const t = norm(p.text);
  const plats = p.links.map(platformOf).filter(Boolean);
  let loja = /shopee/.test(t) ? "shopee" : /mercado ?livre|\bml\b/.test(t) ? "ml" : /amazon/.test(t) ? "amazon" : /magalu|magazine ?luiza/.test(t) ? "magalu" : null;
  if (!loja) {
    for (const l of p.links) { const r = await resolve(ctx, l); const pl = platformOf(r.url); if (pl && pl !== "short") { loja = pl; break; } }
  }
  if (!loja && plats.length) loja = plats.find((x) => x !== "short") || null;
  if (loja === "shopee") return { loja, affiliate_url: await shopeeShort(ctx, "https://shopee.com.br/user/voucher-wallet") };
  if (loja === "ml") return { loja, affiliate_url: `${ctx.cfg.ml.social}?matt_word=${ctx.cfg.ml.tag}` };
  // 25/Nov (Bruno: "buscar cupons da magazine Luiza... já que agora vamos voltar a postar"): cupom Magalu vai com a
  // vitrine da Day (o cupom vale no carrinho da Magalu inteira, a compra pela vitrine conta pra nós)
  if (loja === "magalu") return { loja, affiliate_url: MAGALU_VITRINE };
  return { loja, affiliate_url: null }; // Amazon/outras: sem link de cupom nosso
}

const LOJA_NOME = { shopee: "Shopee", ml: "Mercado Livre", amazon: "Amazon", magalu: "Magalu" };

// ── 5. Rodada ──────────────────────────────────────────────────────────────
async function runLeitor(ctx) {
  const { cfg, state } = ctx;
  if (state.v !== 3) { state.v = 3; state.last = {}; } // troca de versão = relê a janela inicial (dedup no ingest evita repetido)
  state.last = state.last || {};
  const now = Date.now();
  const res = { lidos: 0, novos: 0, ruido: 0, fora_nicho: 0, sem_link: 0, esgotado: 0, enviados: [], erros: [], esgotados: [] };

  for (const ch of cfg.channels) {
    let html;
    try { html = (await ctx.http({ url: `https://t.me/s/${ch}`, headers: { "user-agent": UA } })).body; }
    catch (e) { res.erros.push(`${ch}: ${e.message}`); continue; }
    const posts = parseChannel(String(html || ""), ch);
    res.lidos += posts.length;
    // posts (novos ou antigos, editados) que viraram ESGOTADO → painel tira o item
    for (const p of posts) if (ESGOTADO.test(p.text)) res.esgotados.push(`https://t.me/${ch}/${p.id}`);
    const last = state.last[ch];
    const fresh = posts.filter((p) => (last ? p.id > last : now - p.time < cfg.firstRunHours * 3600_000));
    if (posts.length) state.last[ch] = Math.max(last || 0, ...posts.map((p) => p.id));
    res.novos += fresh.length;

    await processarPosts(ctx, res, fresh, { source: "telegram", canal: "@" + ch, postUrl: (p) => `https://t.me/${ch}/${p.id}` });
  }
  return res;
}

/**
 * Trata posts já lidos (de qualquer origem): classifica, filtra nicho, troca o link pelo nosso e
 * empilha em res.enviados pro /api/ingest. origem = { source, canal, postUrl(p) }.
 * Usado pelo Telegram (runLeitor) e pelo WhatsApp do Bruno (runLeitorWhatsApp — só leitura).
 */
async function processarPosts(ctx, res, fresh, origem) {
  for (const p of fresh) {
    if (ESGOTADO.test(p.text)) { res.esgotado++; continue; }
    if (PRA_AFILIADO.test(p.text)) { res.pra_afiliado = (res.pra_afiliado || 0) + 1; continue; }
    let kind = classify(p);
    // item de lista (comunidade Amazon / canal do ML): é produto quando traz link de loja, mesmo sem "R$"
    if (p.item) kind = p.links.some(platformOf) ? "produto" : "ruido";
    if (kind === "ruido") { res.ruido++; continue; }
    try {
      if (kind === "produto") {
        // 09/Nov: a origem pode separar por perfil (WhatsApp: bebê > Ofertas Maternas; tecnologia/casa/games > Buscador Geek)
        // 25/Nov: Telegram não-bebê de casa/beleza vai pros grupos Lar/Mãe
        const perfil = origem.perfilDe ? origem.perfilDe(p, ctx) : (nicheOk(p.text, ctx.kw) ? "ofertas-maternas" : perfilCasaOuBeleza(p.text));
        if (!perfil) { res.fora_nicho++; continue; }
        const geek = perfil === "buscador-geek";
        ctx._mlConta = geek ? "geek" : "manual";
        ctx._mlTag = geek ? (ctx.cfg.mlGeek?.cookie ? ctx.cfg.mlGeek.tag : (ctx.cfg.ml.tagGeek || ctx.cfg.ml.tag)) : ctx.cfg.ml.tag;
        const link = await productLink(ctx, p.links);
        if (link && link.esgotado) { res.esgotado++; continue; }
        if (!link) {
          res.sem_link++;
          const l0 = p.links.find((l) => platformOf(l));
          if (l0 && (res.debug = res.debug || []).length < 6) { const r0 = await resolve(ctx, l0); res.debug.push(`${origem.canal}/${p.id} ${l0} -> ${r0.url.slice(0, 140)}`); }
          continue;
        }
        const nomeOficial = link.officialTitle || link.amazon?.title || "";
        if (PROIBIDO.test(p.text) || PROIBIDO.test(nomeOficial)) { res.suspeito = (res.suspeito || 0) + 1; (res.suspeitos = res.suspeitos || []).push(`proibido: ${origem.canal}/${p.id}`); continue; }
        const textoNome = p.item ? p.text.split(/\n/).slice(1).join(" \n") : p.text; // item de lista: 1ª linha é a categoria
        if (nomeOficial && !nomeBate(titleOf(textoNome) || "", nomeOficial)) { res.suspeito = (res.suspeito || 0) + 1; (res.suspeitos = res.suspeitos || []).push(`nome não bate: ${origem.canal}/${p.id} "${(titleOf(p.text) || "").slice(0, 40)}" x "${nomeOficial.slice(0, 40)}"`); continue; }
        let { cur, orig } = pricesOf(p.text);
        const precoLoja = link.amazon?.price ?? link.lojaPreco ?? null;
        // post que cita cupom / programe e poupe / Pix / "na tela de pagamento" mostra o preço FINAL, abaixo da página
        // (Pampers R$96,80 com cupom x R$143,88 na página = oferta real). Aí a folga é maior; preço falso (10x) cai igual.
        const comCondicao = /cupo[mn]|programe|poupe|pagamento|carrinho|checkout|\bpix\b|[aà] vista|recorr/i.test(p.text);
        const codes = extractCodes(p.text);
        // 18/Nov (Bruno: "não podemos mais ter esse tipo de erro"): o post NUNCA sai mais barato que a loja.
        // Canal posta o preço final com cupom/moedas e o nosso post saía sem o cupom (Pampers R$29,59 x R$53,99).
        // Agora: preço da loja até 3% acima = ok; acima disso o post sai COM O PREÇO DA LOJA (cupom do canal, se
        // tiver código, vai junto como economia extra). Loja muito acima (25%, ou 60% com código de cupom) = descarta.
        const comCupomEscrito = comCondicao && codes.length > 0;
        if (cur && precoLoja && precoLoja > cur * (comCupomEscrito ? 1.6 : 1.25) + 1) { res.suspeito = (res.suspeito || 0) + 1; (res.suspeitos = res.suspeitos || []).push(`preço não bate: ${origem.canal}/${p.id} post R${cur} x loja R${precoLoja}`); continue; }
        if (precoLoja && !link.amazon && (!cur || precoLoja > cur * 1.03 || precoLoja < cur)) {
          res.preco_corrigido = (res.preco_corrigido || 0) + 1;
          cur = precoLoja;
          if (orig && orig <= cur * 1.02) orig = null;
        }
        const promo = { ...promoFlags(p.text) };
        if (link.amazon) {
          // preço que vale é o do anúncio agora (o canal costuma já descontar o programe e poupe)
          if (link.amazon.price) { cur = link.amazon.price; orig = link.amazon.original && link.amazon.original > cur ? link.amazon.original : null; }
          for (const [k, v] of Object.entries(link.amazon.promo)) if (v !== undefined) promo[k] = v;
          promo.checked_at = new Date().toISOString();
        }
        // lista de "mais vendidos" (iPhone, PS5, livro do momento) não é promoção: item de lista só entra com desconto
        if (p.item && !(orig && cur && orig > cur * 1.05) && !/%\s*off|cupom|desconto/i.test(p.text)) { res.sem_desconto = (res.sem_desconto || 0) + 1; continue; }
        if (origem.exclusiva) { const ex = origem.exclusiva(p); if (ex) promo.exclusiva = ex; }
        const tituloLista = p.item && link.officialTitle ? tituloCurto(link.officialTitle) : null;
        res.enviados.push({
          source: origem.source, source_channel: origem.canal, kind: "produto", perfil,
          source_ref: `tg_${link.platform}_${link.ref}_${brtStamp(p.time)}`,
          platform: link.platform, url: link.url, affiliate_url: link.affiliate_url,
          title: tituloLista || titleOf(textoNome) || link.officialTitle || null, price_current: cur, price_original: orig,
          image_url: link.image || null, coupon_code: codes[0] || null, // nunca a foto do post (tem a marca do canal) — 10/Out
          extra_text: null,
          coupon_meta: { post: origem.postUrl(p), foto: link.image ? "loja" : "telegram", codes: codes.length ? codes : undefined },
          promo_meta: Object.keys(promo).length ? promo : null,
        });
      } else {
        // 25/Nov: cupom de casa/beleza (antes descartado) vai pro grupo Lar/Mãe; cupom geral da Magalu vai pros 3
        let perfisCupom = ["ofertas-maternas"];
        if (CUPOM_FORA.test(p.text) && !BABY.test(p.text)) {
          const pc = perfilCasaOuBeleza(p.text);
          if (!pc) { res.fora_nicho++; continue; }
          perfisCupom = [pc];
        }
        const codes = extractCodes(p.text);
        if (!codes.length) { res.sem_link++; continue; }
        const { loja, affiliate_url } = await couponLink(ctx, p);
        if (!loja || !affiliate_url) { res.sem_link++; continue; }
        if (loja === "magalu" && perfisCupom[0] === "ofertas-maternas" && !BABY.test(p.text)) perfisCupom = ["ofertas-maternas", "ofertas-lar", "ofertas-mae"];
        const regra = p.text.split("\n").map((l) => l.trim()).filter((l) => /off|desconto|acima|limite|m[ií]nimo|%/i.test(l) && !/https?:/.test(l)).slice(0, 4).join("\n");
        const regra1 = (regra.split("\n")[0] || "").replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE0F}🎟📍✅🔥💥]/gu, "").trim();
        for (const perfilCupom of perfisCupom) res.enviados.push({
          source: origem.source, source_channel: origem.canal, kind: "cupom", perfil: perfilCupom,
          source_ref: `tgcupom_${loja}_${[...codes].sort().join("-")}_${brtStamp(p.time)}${perfilCupom === "ofertas-maternas" ? "" : "_" + perfilCupom.slice(8)}`,
          platform: loja === "amazon" ? "amazon" : loja, url: affiliate_url, affiliate_url,
          title: `Cupom ${LOJA_NOME[loja]}${regra1 ? ": " + regra1 : ""}`.slice(0, 200),
          image_url: null, coupon_code: codes[0], // cupom: sem a foto do canal (marca deles) — 10/Out
          extra_text: regra || null,
          coupon_meta: { codes, loja, regra, post: origem.postUrl(p) },
        });
      }
    } catch (e) {
      res.erros.push(`${origem.canal}/${p.id}: ${e.message}`);
      if (e.message === "ML_UNAUTHORIZED") res.ml_unauthorized = true;
    }
  }
}

// ── 6. WhatsApp (número pessoal do Bruno, SÓ LEITURA) ─────────────────────
// Lê apenas os chats da lista (cfg.whatsapp.fontes) pela WAHA "waha-leitura". Nenhuma outra conversa é lida;
// esta sessão nunca envia nada (não está em perfis.waha_urls e não há chamada de envio aqui).
const URL_RE = /https?:\/\/[^\s<>"')\]]+/g;
async function runLeitorWhatsApp(ctx) {
  const { cfg, state } = ctx;
  state.wa = state.wa || {};
  const now = Date.now();
  const res = { lidos: 0, novos: 0, ruido: 0, fora_nicho: 0, sem_link: 0, esgotado: 0, enviados: [], erros: [], esgotados: [] };
  const W = cfg.whatsapp;
  for (const f of W.fontes) {
    let msgs;
    try {
      const url = f.id.endsWith("@newsletter")
        ? `${W.url}/api/${W.session}/channels/${encodeURIComponent(f.id)}/messages/preview?limit=30&downloadMedia=false`
        : `${W.url}/api/${W.session}/chats/${encodeURIComponent(f.id)}/messages?limit=30&downloadMedia=false`;
      const r = await ctx.http({ url, headers: { "X-Api-Key": W.key } });
      if (r.status >= 300) throw new Error(`WAHA ${r.status}`);
      const j = JSON.parse(r.body || "[]");
      msgs = (Array.isArray(j) ? j : []).map((x) => x.message || x);
    } catch (e) { res.erros.push(`${f.nome}: ${e.message}`); continue; }
    if (f.natura) { cuponsNatura(ctx, res, msgs, f, now); continue; } // conversa da Natura: só cupom, mensagem em template
    const posts = msgs
      .filter((m) => !m.fromMe && (m.body || "").trim())
      .map((m) => ({ channel: f.nome, id: Number(m.timestamp) || 0, time: (Number(m.timestamp) || 0) * 1000, text: String(m.body).trim(), links: [...String(m.body).matchAll(URL_RE)].map((x) => x[0]), photo: null }));
    res.lidos += posts.length;
    const last = state.wa[f.id];
    const fresh = posts.filter((p) => (last ? p.id > last : now - p.time < cfg.firstRunHours * 3600_000));
    if (posts.length) state.wa[f.id] = Math.max(last || 0, ...posts.map((p) => p.id));
    res.novos += fresh.length;
    // 26/11: cupom relâmpago da comunidade Amazon ("às 19h15 entra um cupom ... Código: X"; esgota ~7 min depois de abrir)
    if (f.relampago) cuponsRelampago(ctx, res, posts, f, now);
    // 09/Nov: mensagem com vários produtos (lista por categoria) vira um post por produto
    const itens = [];
    for (const p of fresh) {
      if (f.relampago && RELAMPAGO.test(p.text)) continue; // sai pelo cuponsRelampago, na hora em que abre
      const l = quebrarLista(p.text);
      if (!l) { itens.push(p); continue; }
      l.forEach((t, i) => itens.push({ ...p, id: p.id * 100 + i, text: t, links: [...t.matchAll(URL_RE)].map((x) => x[0]), item: true }));
    }
    res.itens = (res.itens || 0) + itens.length;
    await processarPosts(ctx, res, itens, { source: "whatsapp", canal: f.nome, postUrl: () => null, perfilDe: perfilWhatsApp, exclusiva: prazoExclusiva });
  }
  return res;
}

// Cupom relâmpago (26/11, Bruno: "cupons que estão esgotando muito rápido... queria que a gente priorizasse").
// A Amazon avisa ~20 min antes ("Novo cupom às 17h45 ... Código: ELETROBLACK") e manda "*CUPOM ESGOTADO!!!*" uns 7 min
// depois que abre. O leitor guarda o aviso e manda pro painel só quando abre (de 2 min antes até 15 min depois): chega
// fresco e fura a fila (geral e grupo de Cupons). Se vier ESGOTADO depois do aviso, não manda e tira do painel.
const RELAMPAGO = /(novo cupom|entra (um )?cupom)/i;
function cuponsRelampago(ctx, res, posts, f, now) {
  ctx.state.relampago = ctx.state.relampago || {};
  const feitos = ctx.state.relampago;
  for (const k of Object.keys(feitos)) if (now - feitos[k] > 2 * 86400_000) delete feitos[k];
  for (const p of posts) {
    if (!RELAMPAGO.test(p.text) || now - p.time > 6 * 3600_000) continue;
    const cod = (p.text.match(/c[oó]digo:?\s*\*?([A-Z0-9]{4,20})\b/i) || [])[1];
    const hm = p.text.match(/[àa]s\s*\*?(\d{1,2})\s*(?:h|:)\s*(\d{2})?/i);
    if (!cod || !hm) continue;
    const d = new Date(p.time - 3 * 3600_000);
    let inicio = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), +hm[1] + 3, +(hm[2] || 0));
    if (inicio < p.time - 3600_000) inicio += 86400_000; // "às 0h" avisado à noite = amanhã
    const chave = `${cod.toUpperCase()}_${brtStamp(inicio)}`;
    const postKey = `https://wa.me/relampago/${chave}`;
    const esgotou = posts.some((q) => q.time > p.time && ESGOTADO.test(q.text) && q.time >= inicio - 5 * 60_000);
    if (esgotou) { res.esgotados.push(postKey); feitos[chave] = feitos[chave] || now; continue; }
    if (feitos[chave] || now < inicio - 2 * 60_000 || now > inicio + 15 * 60_000) continue;
    feitos[chave] = now;
    const regra = p.text.split("\n").map((l) => l.trim()).filter((l) => /ganhe|off|desconto|acima|limitad/i.test(l) && !/https?:|prime/i.test(l)).slice(0, 2).join("\n");
    const cat = (p.text.match(/cupom especial para\s+\*?([^!.\n*]+)/i) || [])[1]?.trim();
    const perfis = ["ofertas-maternas"];
    if (/casa|decora|cozinha|limpeza|\blar\b/i.test(cat || "")) perfis.push("ofertas-lar");
    if (/beleza|perfum|maquiag|cabelo/i.test(cat || "")) perfis.push("ofertas-mae");
    const url = `https://www.amazon.com.br/blackfriday?tag=${ctx.cfg.amazonTag}`;
    for (const perfil of perfis) res.enviados.push({
      source: "whatsapp", source_channel: f.nome, kind: "cupom", perfil,
      source_ref: `relampago_amazon_${chave}${perfil === "ofertas-maternas" ? "" : "_" + perfil.slice(8)}`,
      platform: "amazon", url, affiliate_url: url,
      title: `Cupom Amazon${cat ? " " + cat.toLowerCase() : ""}: ${(regra.split("\n")[0] || "").replace(/^ganhe\s*/i, "")}`.slice(0, 200),
      image_url: null, coupon_code: cod.toUpperCase(),
      extra_text: (regra ? regra + "\n" : "") + "⚡ Cupom relâmpago: esgota em minutos!",
      coupon_meta: { codes: [cod.toUpperCase()], loja: "amazon", regra, post: postKey, relampago: true, prioridade: true },
    });
    res.relampago = (res.relampago || 0) + 1;
  }
}

// Cupom da Natura/Avon "Minha Loja" (26/11, Bruno: "Consultoria de Beleza Natura e Avon... há cupons que eles vão lançar").
// Conversa direta da Natura com a Day (consultora), mensagens em template (body vazio, texto dentro do template).
// Toda quarta "Oferta da Madrugada" (MLMADRUGADA, 17h/20h até 10h do dia seguinte); em data especial, cupom Natura e Avon.
// Sai no grupo da Mãe quando a validade abre, com o link da loja da Day (consultoria=manualdorecemnascido).
const NATURA_LOJA = (marca) => `https://www.minhaloja.natura.com/?consultoria=manualdorecemnascido&marca=${marca}`;
function textoTemplate(m) {
  const t = m?._data?.message?.templateMessage || m?.message?.templateMessage || null;
  if (!t) return String(m?.body || "");
  return t.interactiveMessageTemplate?.body?.text || t.hydratedTemplate?.hydratedContentText || t.hydratedFourRowTemplate?.hydratedContentText || "";
}
function cuponsNatura(ctx, res, msgs, f, now) {
  ctx.state.natura = ctx.state.natura || {};
  const feitos = ctx.state.natura;
  for (const k of Object.keys(feitos)) if (now - feitos[k] > 10 * 86400_000) delete feitos[k];
  for (const m of msgs) {
    const time = (Number(m.timestamp) || 0) * 1000;
    if (m.fromMe || now - time > 2 * 86400_000) continue;
    const text = textoTemplate(m);
    if (!/cupom/i.test(text)) continue;
    const ano = new Date(time - 3 * 3600_000).getUTCFullYear();
    const quando = (h, dd, mm) => Date.UTC(ano, +mm - 1, +dd, +h + 3, 0);
    const j = text.match(/das\s+(\d{1,2})h\s+do\s+dia\s+(\d{1,2})\/(\d{1,2})\s+at[eé]\s+(?:[àa]s\s+)?(\d{1,2})h\s+de\s+(\d{1,2})\/(\d{1,2})/i)
      || text.match(/dia\s+(\d{1,2})\/(\d{1,2}),?\s+[àa]s\s+(\d{1,2})h,?\s+at[eé]\s+(\d{1,2})\/(\d{1,2}),?\s+[àa]s\s+(\d{1,2})h/i);
    let ini = time, fim = time + 18 * 3600_000;
    if (j && /das\s/i.test(j[0])) { ini = quando(j[1], j[2], j[3]); fim = quando(j[4], j[5], j[6]); }
    else if (j) { ini = quando(j[3], j[1], j[2]); fim = quando(j[6], j[4], j[5]); }
    if (fim < ini) fim = ini + 18 * 3600_000; // data errada na mensagem (ex.: "19/10 até 20/11")
    if (now < ini - 2 * 60_000 || now > fim - 30 * 60_000) continue;
    // cada cupom com a marca da seção em que aparece (🧡 Ofertas Natura / 🩷 Ofertas Avon)
    let marca = /avon/i.test(text) && !/natura/i.test(text) ? "avon" : "natura";
    for (const linha of text.split("\n")) {
      if (/ofertas?\s+natura/i.test(linha)) marca = "natura";
      if (/ofertas?\s+avon/i.test(linha)) marca = "avon";
      const c = linha.match(/cupom:?\s*\*?([A-Z0-9]{5,20})\*?/i);
      if (!c || !/[0-9]|[A-Z]{5,}/.test(c[1]) || c[1] !== c[1].toUpperCase()) continue;
      const cod = c[1];
      const chave = `${marca}_${cod}_${brtStamp(ini)}`;
      if (feitos[chave]) continue;
      feitos[chave] = now;
      const vant = (linha.match(/\(([^)]*off[^)]*)\)/i) || [])[1] || (text.match(/garante\s+(at[eé]\s+\*?\d+%\s*OFF\*?[^.\n]*)/i) || [])[1] || (text.match(/(R\$\s*\d+\s*OFF[^.\n]*)/i) || [])[1] || "";
      const regra = vant.replace(/\*/g, "").trim();
      const nome = marca === "avon" ? "Avon" : "Natura";
      const ate = new Date(fim - 3 * 3600_000);
      const validade = `⏰ Vale até ${ate.getUTCHours()}h de ${String(ate.getUTCDate()).padStart(2, "0")}/${String(ate.getUTCMonth() + 1).padStart(2, "0")}`;
      const madrugada = /madrugada/i.test(text) ? " (Oferta da Madrugada)" : "";
      res.enviados.push({
        source: "whatsapp", source_channel: f.nome, kind: "cupom", perfil: "ofertas-mae",
        source_ref: `natura_${chave}`, platform: null, url: NATURA_LOJA(marca), affiliate_url: NATURA_LOJA(marca),
        title: `Cupom ${nome}${regra ? ": " + regra : ""}${madrugada}`.slice(0, 200),
        image_url: null, coupon_code: cod,
        extra_text: [regra && `🎟️ ${regra}`, validade].filter(Boolean).join("\n"),
        coupon_meta: { codes: [cod], loja: marca, regra, prioridade: true, validade_fim: new Date(fim).toISOString() },
      });
      res.natura = (res.natura || 0) + 1;
    }
  }
}

// ── 6b. Ofertas exclusivas das fontes de afiliado (09/Nov) ────────────────
const GEEK_NICHO = /eletr[oô]n|inform[aá]tic|tecnolog|celular|smartphone|iphone|samsung|xiaomi|motorola|notebook|computador|\bpc\b|monitor|teclado|mouse|headset|headphone|fone|caixa de som|\btv\b|smart ?tv|fire tv|echo|alexa|kindle|tablet|smartwatch|rel[oó]gio intelig|c[aâ]mera|gamer|\bgames?\b|playstation|\bps5\b|xbox|nintendo|switch|console|lego|funko|brinquedo|hot wheels|boneco|casa e cozinha|\bcasa\b|cozinha|airfryer|air fryer|fritadeira|cafeteira|liquidificador|aspirador|rob[oô] aspirador|eletrodom|lava e seca|geladeira|micro-?ondas|ferramenta|furadeira|parafusadeira|mang[aá]|\bhq\b|quadrinho/i;
const FORA_GEEK = /livros e papelaria|papelaria|autoajuda|beleza|maquiagem|perfume|skincare|cabelo|moda|roupa|cal[cç]ado|t[eê]nis|bebida|vinho|cerveja|alimento|mercado|\bpet\b|ra[cç][aã]o/i;
function perfilWhatsApp(p, ctx) {
  if (nicheOk(p.text, ctx.kw)) return "ofertas-maternas";
  if (MAE_TG.test(p.text) && !NAO_MAE.test(p.text)) return "ofertas-mae"; // 25/Nov: beleza (antes descartada) > grupo da Mãe
  const cab = p.text.split("\n")[0] || "";
  // categoria da lista (1ª linha do item) fora do nicho geek (beleza, moda, bebida, pet...) → não posta
  if (FORA_GEEK.test(cab) && !GEEK_NICHO.test(cab)) return null;
  return GEEK_NICHO.test(p.text) ? "buscador-geek" : null;
}
// "Válida de 09/11 a 30/11" (ou "até 12/11") → janela em BRT; sem data = vale só no dia em que chegou
function prazoExclusiva(p) {
  const ano = new Date(p.time - 3 * 3600_000).getUTCFullYear();
  // 00:00 BRT = 03:00 UTC; 23:59 BRT = 02:59 UTC do dia seguinte
  const dia = (dd, mm, fimDoDia) => new Date(Date.UTC(ano, +mm - 1, +dd + (fimDoDia ? 1 : 0), fimDoDia ? 2 : 3, fimDoDia ? 59 : 0)).toISOString();
  const m = p.text.match(/v[aá]lid[oa]\s+de\s+(\d{1,2})\/(\d{1,2})\s+a(?:t[eé])?\s+(\d{1,2})\/(\d{1,2})/i);
  const ate = p.text.match(/(?:v[aá]lid[oa]\s+)?at[eé]\s+(\d{1,2})\/(\d{1,2})/i);
  const hoje = new Date(p.time - 3 * 3600_000);
  const inicio = new Date(p.time).toISOString();
  if (m) { const ini = dia(m[1], m[2], false); return { inicio: ini > inicio ? ini : inicio, fim: dia(m[3], m[4], true), preco_promo: null, fonte: p.channel }; }
  if (ate) return { inicio, fim: dia(ate[1], ate[2], true), preco_promo: null, fonte: p.channel };
  return { inicio, fim: dia(hoje.getUTCDate(), hoje.getUTCMonth() + 1, true), preco_promo: null, fonte: p.channel };
}
function quebrarLista(text) {
  if ((text.match(URL_RE) || []).length < 2) return null;
  const itens = []; let cat = ""; let cur = null;
  for (const raw of text.split("\n")) {
    const l = raw.trim();
    if (!l) continue;
    const ehItem = /^(🔹|🔸|📦|⚡|▪️|•)/u.test(l);
    const ehCat = !ehItem && !/https?:|R\$/.test(l) && l.length < 70 && /^\p{Extended_Pictographic}/u.test(l);
    if (ehItem) { if (cur) itens.push(cur); cur = [cat, l]; continue; }
    if (ehCat && (!cur || cur.some((x) => /https?:/.test(x)))) { if (cur) itens.push(cur); cur = null; cat = l; continue; }
    if (cur) cur.push(l);
  }
  if (cur) itens.push(cur);
  const bons = itens.map((x) => x.filter(Boolean).join("\n")).filter((t) => /https?:\/\//.test(t));
  return bons.length >= 2 ? bons : null;
}
function tituloCurto(t) { let s = String(t).split(/\s[|–]\s/)[0].trim(); if (s.length > 110) s = s.slice(0, 110).replace(/[\s,;:-]+\S*$/, "") + "…"; return s; }

if (typeof module !== "undefined") module.exports = { runLeitor, runLeitorWhatsApp, processarPosts, parseChannel, classify, extractCodes, titleOf, pricesOf };
