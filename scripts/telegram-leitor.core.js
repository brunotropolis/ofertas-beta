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
// "ESGOTADO" (o canal costuma EDITAR o post depois). "Esgota rápido" é chamada de urgência, não conta.
const ESGOTADO = /esgotad[oa]s?|esgotou|acabou o estoque|sem estoque/i;
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
function semCanal(t) { return t.replace(/(?:https?://)?(?:t|telegram).me/S+/gi, "").replace(/(^|s)@[A-Za-z0-9_]{4,}/g, "$1").replace(/[ 	]+
/g, "
").trim(); }
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
  const { cookie, csrf, tag } = ctx.cfg.ml;
  const r = await ctx.http({
    url: "https://www.mercadolivre.com.br/affiliate-program/api/v2/affiliates/createLink", method: "POST",
    headers: { accept: "application/json", "content-type": "application/json", origin: "https://www.mercadolivre.com.br", referer: "https://www.mercadolivre.com.br/afiliados/linkbuilder", "user-agent": UA, "x-csrf-token": csrf, cookie },
    body: JSON.stringify({ urls: [productUrl], tag }),
  });
  const j = typeof r.body === "string" ? JSON.parse(r.body) : r.body;
  if (r.status === 401) throw new Error("ML_UNAUTHORIZED");
  return j?.urls?.[0]?.short_url || null;
}

// produto: link do post → { platform, ref, url, affiliate_url }
async function productLink(ctx, links) {
  for (const l of links) {
    const plat = platformOf(l);
    if (!plat) continue;
    const { url, body } = await resolve(ctx, l);
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
      return { platform: "shopee", ref: m[2], url: clean, affiliate_url: aff, image: info?.imageUrl || null, officialTitle: info?.productName || null };
    }
    if (p2 === "ml") {
      let prod = null, mlImage = null;
      if (/\/p\/MLB\d+|produto\.mercadolivre\.com\.br\/MLB-?\d+|\/MLB-\d+/.test(url)) prod = url.split(/[?#]/)[0];
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
      return { platform: "ml", ref, url: prod, affiliate_url: aff, image: mlImage };
    }
  }
  return null;
}

// cupom: loja + nosso link da página de cupons/vitrine
async function couponLink(ctx, p) {
  const t = norm(p.text);
  const plats = p.links.map(platformOf).filter(Boolean);
  let loja = /shopee/.test(t) ? "shopee" : /mercado ?livre|\bml\b/.test(t) ? "ml" : /amazon/.test(t) ? "amazon" : null;
  if (!loja) {
    for (const l of p.links) { const r = await resolve(ctx, l); const pl = platformOf(r.url); if (pl && pl !== "short") { loja = pl; break; } }
  }
  if (!loja && plats.length) loja = plats.find((x) => x !== "short") || null;
  if (loja === "shopee") return { loja, affiliate_url: await shopeeShort(ctx, "https://shopee.com.br/user/voucher-wallet") };
  if (loja === "ml") return { loja, affiliate_url: `${ctx.cfg.ml.social}?matt_word=${ctx.cfg.ml.tag}` };
  return { loja, affiliate_url: null }; // Amazon/outras: sem link de cupom nosso
}

const LOJA_NOME = { shopee: "Shopee", ml: "Mercado Livre", amazon: "Amazon" };

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

    for (const p of fresh) {
      if (ESGOTADO.test(p.text)) { res.esgotado++; continue; }
      const kind = classify(p);
      if (kind === "ruido") { res.ruido++; continue; }
      try {
        if (kind === "produto") {
          if (!nicheOk(p.text, ctx.kw)) { res.fora_nicho++; continue; }
          const link = await productLink(ctx, p.links);
          if (link && link.esgotado) { res.esgotado++; continue; }
          if (!link) {
            res.sem_link++;
            const l0 = p.links.find((l) => platformOf(l));
            if (l0 && (res.debug = res.debug || []).length < 6) { const r0 = await resolve(ctx, l0); res.debug.push(`${ch}/${p.id} ${l0} -> ${r0.url.slice(0, 140)}`); }
            continue;
          }
          let { cur, orig } = pricesOf(p.text);
          const codes = extractCodes(p.text);
          const promo = { ...promoFlags(p.text) };
          if (link.amazon) {
            // preço que vale é o do anúncio agora (o canal costuma já descontar o programe e poupe)
            if (link.amazon.price) { cur = link.amazon.price; orig = link.amazon.original && link.amazon.original > cur ? link.amazon.original : null; }
            for (const [k, v] of Object.entries(link.amazon.promo)) if (v !== undefined) promo[k] = v;
            promo.checked_at = new Date().toISOString();
          }
          res.enviados.push({
            source: "telegram", source_channel: "@" + ch, kind: "produto", perfil: "ofertas-maternas",
            source_ref: `tg_${link.platform}_${link.ref}_${brtStamp(p.time)}`,
            platform: link.platform, url: link.url, affiliate_url: link.affiliate_url,
            title: titleOf(p.text) || link.officialTitle || null, price_current: cur, price_original: orig,
            image_url: link.image || null, coupon_code: codes[0] || null, // nunca a foto do post (tem a marca do canal) — 10/Out
            extra_text: null,
            coupon_meta: { post: `https://t.me/${ch}/${p.id}`, foto: link.image ? "loja" : "telegram", codes: codes.length ? codes : undefined },
            promo_meta: Object.keys(promo).length ? promo : null,
          });
        } else {
          if (CUPOM_FORA.test(p.text) && !BABY.test(p.text)) { res.fora_nicho++; continue; }
          const codes = extractCodes(p.text);
          if (!codes.length) { res.sem_link++; continue; }
          const { loja, affiliate_url } = await couponLink(ctx, p);
          if (!loja || !affiliate_url) { res.sem_link++; continue; }
          const regra = p.text.split("\n").map((l) => l.trim()).filter((l) => /off|desconto|acima|limite|m[ií]nimo|%/i.test(l) && !/https?:/.test(l)).slice(0, 4).join("\n");
          const regra1 = (regra.split("\n")[0] || "").replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE0F}🎟📍✅🔥💥]/gu, "").trim();
          res.enviados.push({
            source: "telegram", source_channel: "@" + ch, kind: "cupom", perfil: "ofertas-maternas",
            source_ref: `tgcupom_${loja}_${[...codes].sort().join("-")}_${brtStamp(p.time)}`,
            platform: loja === "amazon" ? "amazon" : loja, url: affiliate_url, affiliate_url,
            title: `Cupom ${LOJA_NOME[loja]}${regra1 ? ": " + regra1 : ""}`.slice(0, 200),
            image_url: null, coupon_code: codes[0], // cupom: sem a foto do canal (marca deles) — 10/Out
            extra_text: regra || null,
            coupon_meta: { codes, loja, regra, post: `https://t.me/${ch}/${p.id}` },
          });
        }
      } catch (e) {
        res.erros.push(`${ch}/${p.id}: ${e.message}`);
        if (e.message === "ML_UNAUTHORIZED") res.ml_unauthorized = true;
      }
    }
  }
  return res;
}

if (typeof module !== "undefined") module.exports = { runLeitor, parseChannel, classify, extractCodes, titleOf, pricesOf };
