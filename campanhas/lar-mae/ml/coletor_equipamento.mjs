// 26/11 (estudo dos produtos, Bruno: "pode aplicar as 5"): busca de propósito o enxoval/equipamento de marca conhecida
// que a equipe postava (cadeirão, carrinho, berço, babá eletrônica, banheira, bomba, mamadeira, bebê conforto) e que os
// canais do Telegram quase não trazem. Amazon pela Creators API (busca por palavra), ingest no perfil Ofertas Maternas.
// O publicador usa isso na cota de "enxoval e equipamento" (~20% da geral, META_EQUIP no auto-enqueue).
// Roda no PC junto do coletor de lojas (run_lojas.bat, a cada 2 h): 4 buscas sorteadas por rodada.
// Uso: node coletor_equipamento.mjs [--dry]
import fs from "node:fs";
const E = Object.fromEntries(fs.readFileSync("D:/CLAUDE/.env.meta", "utf8").split(/\r?\n/).map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^"|"$/g, "")]));
const DRY = process.argv.includes("--dry");
const SEC = E.CRON_SECRET_OFERTAS_BETA, APP = "https://app.buscadorgeek.com.br";

const BUSCAS = [
  "cadeira de alimentação burigotto", "cadeira de alimentação maxi baby", "cadeira de refeição safety 1st", "cadeira de alimentação chicco",
  "carrinho de bebê burigotto", "carrinho de bebê cosco", "travel system safety 1st", "carrinho de bebê galzerano", "carrinho de passeio voyage",
  "babá eletrônica motorola", "babá eletrônica maxi baby", "babá eletrônica intelbras", "babá eletrônica philips avent",
  "berço portátil burigotto", "berço portátil galzerano", "berço portátil voyage", "cercadinho bebê",
  "banheira bebê burigotto", "banheira bebê safety 1st", "bomba tira leite medela", "bomba tira leite philips avent", "bomba tira leite lansinoh",
  "mamadeira philips avent", "mamadeira mam", "mamadeira dr browns", "kit mamadeira lillo", "esterilizador mamadeira",
  "bebê conforto cosco", "bebê conforto burigotto", "cadeirinha carro safety 1st", "cadeirinha carro burigotto",
  "cadeira de descanso bebê fisher price", "cadeira de balanço bebê", "tapete de atividades fisher price", "body bebê carter's", "kit body bebê",
];
const MARCA_BOA = /burigotto|galzerano|cosco|kiddo|maxi ?baby|voyage|safety 1st|chicco|fisher.?price|clingo|motorola|philips|avent|infanti\b|tutti baby|multikids|mastela|dican|\bkuka\b|lillo|\bnuk\b|\bmam\b|tommee|dr\.? ?brown|medela|lansinoh|carter|pimpolho|hering|\bbuba\b|munchkin|skip ?hop|\bjoie\b|graco|maxi-?cosi|abc design|litet|intelbras|bright starts|baby einstein/i;
const sorteia = (l, n) => [...l].sort(() => Math.random() - 0.5).slice(0, n);

const tok = await (await fetch("https://api.amazon.com/auth/o2/token", { method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ grant_type: "client_credentials", client_id: E.AMAZON_ACCESS_KEY, client_secret: E.AMAZON_SECRET_KEY, scope: "creatorsapi::default" }) })).json();
const tot = { lidos: 0, bons: 0, novo: 0, dup: 0, pulado: 0, erro: 0 };
for (const kw of sorteia(BUSCAS, 4)) {
  const j = await (await fetch("https://creatorsapi.amazon/catalog/v1/searchItems", { method: "POST",
    headers: { "content-type": "application/json", Authorization: "Bearer " + tok.access_token, "x-marketplace": "www.amazon.com.br" },
    body: JSON.stringify({ itemPage: 1, sortBy: "Relevance", keywords: kw, partnerTag: E.AMAZON_PARTNER_TAG || "manualdorec0c-20", marketplace: "www.amazon.com.br",
      resources: ["itemInfo.title", "offersV2.listings.price", "offersV2.listings.availability", "offersV2.listings.merchantInfo", "images.primary.large", "customerReviews.starRating", "customerReviews.count"] }) })).json().catch(() => ({}));
  for (const it of j.searchResult?.items || []) {
    tot.lidos++;
    const l = (it.offersV2?.listings || []).find((x) => x.isBuyBoxWinner) || (it.offersV2?.listings || [])[0];
    const preco = l?.price?.money?.amount, de = l?.price?.savingBasis?.money?.amount || 0;
    const titulo = String(it.itemInfo?.title?.displayValue || "");
    const nota = it.customerReviews?.starRating?.value || 0, n = it.customerReviews?.count || 0;
    const img = it.images?.primary?.large?.url;
    if (!preco || !img || !titulo || l?.availability?.type === "OUT_OF_STOCK") continue;
    if (preco < 60 || preco > 1500) continue;
    if (n > 0 && nota < 4.2) continue;
    if (!MARCA_BOA.test(titulo)) continue; // só marca conhecida: é o que faltava (a busca já filtra o tipo)
    tot.bons++;
    if (DRY) { console.log("  ", kw, "|", titulo.slice(0, 70), "| R$", preco, de > preco ? "de " + de : ""); continue; }
    const url = `https://www.amazon.com.br/dp/${it.asin}`;
    const body = { source: "auto", source_ref: "amazon_" + it.asin, platform: "amazon", kind: "produto", url, affiliate_url: `${url}?tag=manualdorec0c-20`,
      title: titulo.slice(0, 500), image_url: img, price_current: preco, price_original: de > preco ? de : null, discount_pct: de > preco ? Math.round((1 - preco / de) * 100) : null,
      perfil: "ofertas-maternas", promo_meta: { equipamento: true, busca: kw, rating: nota || null, avaliacoes: n || null } };
    const r = await fetch(`${APP}/api/ingest`, { method: "POST", headers: { "content-type": "application/json", "x-ingest-secret": SEC }, body: JSON.stringify(body) });
    const jj = await r.json().catch(() => ({}));
    if (!r.ok) tot.erro++; else if (jj.deduped) tot.dup++; else if (jj.skipped) tot.pulado++; else tot.novo++;
  }
  await new Promise((res) => setTimeout(res, 1200));
}
console.log(new Date().toISOString(), "equipamento amazon", JSON.stringify(tot));
