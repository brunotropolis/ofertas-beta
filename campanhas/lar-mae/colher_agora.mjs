// 24/11: 1ª colheita na mão pros perfis ofertas-lar e ofertas-mae (mesma lógica dos coletores n8n: Shopee productOfferV2
// e Amazon Creators API), 1 página por palavra-chave do perfil, manda pro /api/ingest como source=auto.
// Uso: node campanhas/lar-mae/colher_agora.mjs [lar|mae] [--dry]
import fs from "node:fs";
import crypto from "node:crypto";
const E = Object.fromEntries(fs.readFileSync("D:/CLAUDE/.env.meta", "utf8").split(/\r?\n/).map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^"|"$/g, "")]));
const SEC = E.CRON_SECRET_OFERTAS_BETA, APP = "https://app.buscadorgeek.com.br";
const DRY = process.argv.includes("--dry");
const quais = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const perfis = (quais.length ? quais : ["lar", "mae"]).map((k) => `ofertas-${k}`);
const num = (v) => { const n = parseFloat(v); return isNaN(n) ? null : n; };
async function shopee(kw) {
  const ts = Math.floor(Date.now() / 1000).toString();
  const body = JSON.stringify({ query: `{ productOfferV2(listType: 0, sortType: 2, keyword: "${kw}", page: 1, limit: 20) { nodes { itemId productName offerLink priceMin priceMax commissionRate sales ratingStar imageUrl shopName priceDiscountRate shopType } } }` });
  const sig = crypto.createHash("sha256").update(E.SHOPEE_APP_ID + ts + body + E.SHOPEE_APP_SECRET).digest("hex");
  const j = await (await fetch("https://open-api.affiliate.shopee.com.br/graphql", { method: "POST", headers: { "content-type": "application/json", Authorization: `SHA256 Credential=${E.SHOPEE_APP_ID},Timestamp=${ts},Signature=${sig}` }, body })).json();
  return (j.data?.productOfferV2?.nodes || []).filter((p) => (+p.commissionRate || 0) >= 0.03 && (+p.ratingStar || 0) >= 4 && (+p.sales || 0) >= 30).map((p) => {
    const pmin = num(p.priceMin), pmax = num(p.priceMax), m = {};
    if (+p.ratingStar >= 4) m.rating = Math.round(+p.ratingStar * 10) / 10;
    const s = +p.sales; if (s >= 50) m.vendidos = s >= 1000 ? "+" + (Math.floor(s / 100) / 10).toString().replace(".", ",").replace(/,0$/, "") + " mil" : "+" + s;
    if ([].concat(p.shopType || []).includes(1)) m.loja_oficial = true;
    return { source: "auto", source_ref: "shopee_" + p.itemId, platform: "shopee", url: p.offerLink, affiliate_url: p.offerLink, title: String(p.productName || "").slice(0, 500), image_url: p.imageUrl,
      price_current: pmin, price_original: pmax && pmin && pmax > pmin ? pmax : null, discount_pct: p.priceDiscountRate > 0 && p.priceDiscountRate < 100 ? p.priceDiscountRate : null, promo_meta: Object.keys(m).length ? m : null };
  });
}
let tokenAmz = null;
async function amazon(kw) {
  if (!tokenAmz) tokenAmz = (await (await fetch("https://api.amazon.com/auth/o2/token", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ grant_type: "client_credentials", client_id: E.AMAZON_ACCESS_KEY, client_secret: E.AMAZON_SECRET_KEY, scope: "creatorsapi::default" }) })).json()).access_token;
  const j = await (await fetch("https://creatorsapi.amazon/catalog/v1/searchItems", { method: "POST", headers: { "content-type": "application/json", Authorization: "Bearer " + tokenAmz, "x-marketplace": "www.amazon.com.br" },
    body: JSON.stringify({ itemPage: 1, sortBy: "Relevance", keywords: kw, partnerTag: E.AMAZON_PARTNER_TAG, marketplace: "www.amazon.com.br", resources: ["itemInfo.title", "offersV2.listings.price", "offersV2.listings.availability", "images.primary.medium", "customerReviews.starRating", "customerReviews.count"] }) })).json();
  const out = [];
  for (const it of j.searchResult?.items || []) {
    const l = (it.offersV2?.listings || []).find((x) => x.isBuyBoxWinner) || (it.offersV2?.listings || [])[0];
    const cur = l?.price?.money?.amount; if (!cur) continue;
    const orig = l.price.savingBasis?.money?.amount || 0, rating = it.customerReviews?.starRating?.value || 0, cnt = it.customerReviews?.count || 0;
    if (cnt > 0 && rating < 4) continue;
    const img = it.images?.primary?.medium?.url; if (!img) continue;
    out.push({ source: "auto", source_ref: "amazon_" + it.asin, platform: "amazon", url: it.detailPageURL, affiliate_url: it.detailPageURL, title: String(it.itemInfo?.title?.displayValue || "").slice(0, 500),
      image_url: img.replace(/\._(S[LXY]\d+|SS\d+|AC_[^.]*)_\./, "._SL500_."), price_current: cur, price_original: orig > cur ? orig : null, discount_pct: orig > cur ? Math.round((1 - cur / orig) * 100) : null });
  }
  return out;
}
for (const perfil of perfis) {
  const kw = (await (await fetch(`${APP}/api/keywords/collector?slug=${perfil}`, { headers: { "x-ingest-secret": SEC } })).json()).keywords || [];
  const tot = { novo: 0, dup: 0, pulado: 0, erro: 0 };
  for (const k of kw) {
    for (const [fonte, fn] of [["shopee", shopee], ["amazon", amazon]]) {
      let itens = []; try { itens = await fn(k); } catch (e) { console.log("erro fonte", fonte, k, e.message); continue; }
      for (const it of itens.slice(0, 8)) {
        if (DRY) { tot.novo++; continue; }
        const r = await fetch(`${APP}/api/ingest`, { method: "POST", headers: { "content-type": "application/json", "x-ingest-secret": SEC }, body: JSON.stringify({ ...it, perfil }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) tot.erro++; else if (j.deduped) tot.dup++; else if (j.skipped) tot.pulado++; else tot.novo++;
      }
    }
  }
  console.log(perfil, kw.length, "palavras", JSON.stringify(tot));
}
