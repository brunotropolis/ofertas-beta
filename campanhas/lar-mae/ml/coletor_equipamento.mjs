// 26/11 (estudo dos produtos, Bruno: "pode aplicar as 5"): busca de propósito o que os canais do Telegram quase não trazem,
// pela Creators API da Amazon (busca por palavra), e manda pro /api/ingest do perfil certo:
//   maternas = enxoval/equipamento de marca conhecida (cadeirão, carrinho, berço, babá, banheira, bomba, mamadeira...)
//   lar      = casa de marca (26/11, "manda ver em tudo", orientação dos concorrentes): cama e banho, cozinha, eletroportátil,
//              limpeza, organização, eletro grande
//   mae      = beleza e bem-estar de marca: cabelo, pele, perfume e corpo, bem-estar (colágeno, whey, ômega, café), aparelho
// O publicador usa isso nas cotas por categoria (auto-enqueue: META_EQUIP nas Maternas, COTA_LAR / COTA_MAE).
// Roda no PC junto do coletor de lojas (run_lojas.bat, a cada 2 h): 4 buscas sorteadas por perfil por rodada.
// Uso: node coletor_equipamento.mjs [maternas|lar|mae ...] [--dry]
import fs from "node:fs";
const E = Object.fromEntries(fs.readFileSync("D:/CLAUDE/.env.meta", "utf8").split(/\r?\n/).map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^"|"$/g, "")]));
const DRY = process.argv.includes("--dry");
const SEC = E.CRON_SECRET_OFERTAS_BETA, APP = "https://app.buscadorgeek.com.br";

const PERFIS = {
  maternas: {
    slug: "ofertas-maternas", min: 60, max: 1500,
    buscas: ["cadeira de alimentação burigotto", "cadeira de alimentação maxi baby", "cadeira de refeição safety 1st", "cadeira de alimentação chicco",
      "carrinho de bebê burigotto", "carrinho de bebê cosco", "travel system safety 1st", "carrinho de bebê galzerano", "carrinho de passeio voyage",
      "babá eletrônica motorola", "babá eletrônica maxi baby", "babá eletrônica intelbras", "babá eletrônica philips avent",
      "berço portátil burigotto", "berço portátil galzerano", "berço portátil voyage", "cercadinho bebê",
      "banheira bebê burigotto", "banheira bebê safety 1st", "bomba tira leite medela", "bomba tira leite philips avent", "bomba tira leite lansinoh",
      "mamadeira philips avent", "mamadeira mam", "mamadeira dr browns", "kit mamadeira lillo", "esterilizador mamadeira",
      "bebê conforto cosco", "bebê conforto burigotto", "cadeirinha carro safety 1st", "cadeirinha carro burigotto",
      "cadeira de descanso bebê fisher price", "cadeira de balanço bebê", "tapete de atividades fisher price", "body bebê carter's", "kit body bebê"],
    marca: /burigotto|galzerano|cosco|kiddo|maxi ?baby|voyage|safety 1st|chicco|fisher.?price|clingo|motorola|philips|avent|infanti\b|tutti baby|multikids|mastela|dican|\bkuka\b|lillo|\bnuk\b|\bmam\b|tommee|dr\.? ?brown|medela|lansinoh|carter|pimpolho|hering|\bbuba\b|munchkin|skip ?hop|\bjoie\b|graco|maxi-?cosi|abc design|litet|intelbras|bright starts|baby einstein/i,
    extra: { equipamento: true },
  },
  lar: {
    slug: "ofertas-lar", min: 25, max: 4000,
    buscas: ["jogo de toalhas buddemeyer", "jogo de toalhas karsten", "jogo de cama santista", "edredom altenburg", "travesseiro altenburg", "jogo de lençol 400 fios",
      "jogo de panelas tramontina", "panela de pressão tramontina", "jogo de panelas brinox", "garrafa térmica stanley", "faqueiro tramontina", "potes herméticos electrolux",
      "air fryer philco", "air fryer mondial", "air fryer philips walita", "liquidificador oster", "cafeteira oster", "aspirador de pó electrolux", "robô aspirador wap", "purificador de água electrolux", "ventilador mondial", "climatizador britânia",
      "sabão líquido omo", "amaciante downy", "lava roupas ypê", "papel higiênico neve", "mop giratório", "desinfetante lysoform",
      "cesto de roupa", "organizador de armário ordene", "caixa organizadora plasútil",
      "lavadora midea", "geladeira consul", "ar condicionado inverter"],
    marca: /tramontina|brinox|oikos|marinex|electrolux|brastemp|consul|philco|mondial|arno|oster|brit[aâ]nia|walita|philips|\bwap\b|midea|samsung|\blg\b|black.?decker|cadence|karsten|buddemeyer|santista|altenburg|teka|stanley|lyor|oxford|rochedo|panelux|tupperware|omo\b|yp[eê]|downy|comfort|vanish|veja\b|brilhante|ariel|neve\b|lysoform|cif\b|kitchenaid|nespresso|dolce gusto|mallory|ordene|plasutil|sanremo|flash limp|coza/i,
    extra: {},
  },
  mae: {
    slug: "ofertas-mae", min: 15, max: 1200,
    buscas: ["óleo elseve", "shampoo pantene", "kit wella", "kérastase", "máscara capilar lola", "creme para pentear salon line", "kit truss",
      "cetaphil", "neutrogena hidratante", "protetor solar la roche posay", "sérum principia", "creamy", "nivea creme", "eucerin",
      "perfume boticário", "natura ekos", "hidratante natura tododia", "bio oil", "granado",
      "colágeno verisol", "whey protein growth", "ômega 3", "creatina", "café em cápsula três corações", "multivitamínico",
      "secador de cabelo taiff", "escova secadora britânia", "escova de dente elétrica oral-b",
      "base maybelline", "máscara de cílios", "paleta de sombras ruby rose"],
    marca: /natura|botic[aá]rio|eudora|oc[eé]ane|granado|l.?occitane|lor[eé]al|elseve|pantene|wella|k[eé]rastase|redken|joico|lola|salon line|truss|siage|inoar|tresemm[eé]|cadiveu|nivea|dove|neutrogena|cetaphil|la roche|vichy|cerave|bioderma|eucerin|principia|sallve|creamy|episol|isdin|bio.?oil|ruby rose|vult|maybelline|max love|mari maria|philips|taiff|brit[aâ]nia|mondial|cadence|gama|oral.?b|vitafor|growth|integralmedica|max titanium|\bdux\b|essential nutrition|sanavita|verisol|nestl[eé]|tr[eê]s cora|melitta|nescaf[eé]|centrum|puravida/i,
    fora: /infantil|crian[cç]a|kids|beb[eê]|disney|masculin|\bmen\b|for men|barbe|barba|aparador|gillette(?!.*venus)/i,
    extra: {},
  },
};
const sorteia = (l, n) => [...l].sort(() => Math.random() - 0.5).slice(0, n);
const quais = process.argv.slice(2).filter((a) => PERFIS[a]);
const grupos = quais.length ? quais : Object.keys(PERFIS);

const tok = await (await fetch("https://api.amazon.com/auth/o2/token", { method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ grant_type: "client_credentials", client_id: E.AMAZON_ACCESS_KEY, client_secret: E.AMAZON_SECRET_KEY, scope: "creatorsapi::default" }) })).json();
for (const g of grupos) {
  const P = PERFIS[g];
  const tot = { lidos: 0, bons: 0, novo: 0, dup: 0, pulado: 0, erro: 0 };
  for (const kw of sorteia(P.buscas, 4)) {
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
      if (preco < P.min || preco > P.max) continue;
      if (n > 0 && nota < 4.2) continue;
      if (!P.marca.test(titulo) || (P.fora && P.fora.test(titulo))) continue; // só marca conhecida: é o que faltava
      tot.bons++;
      if (DRY) { console.log("  ", g, "|", kw, "|", titulo.slice(0, 65), "| R$", preco, de > preco ? "de " + de : ""); continue; }
      const url = `https://www.amazon.com.br/dp/${it.asin}`;
      const body = { source: "auto", source_ref: "amazon_" + it.asin, platform: "amazon", kind: "produto", url, affiliate_url: `${url}?tag=manualdorec0c-20`,
        title: titulo.slice(0, 500), image_url: img, price_current: preco, price_original: de > preco ? de : null, discount_pct: de > preco ? Math.round((1 - preco / de) * 100) : null,
        perfil: P.slug, promo_meta: { ...P.extra, busca: kw, rating: nota || null, avaliacoes: n || null } };
      const r = await fetch(`${APP}/api/ingest`, { method: "POST", headers: { "content-type": "application/json", "x-ingest-secret": SEC }, body: JSON.stringify(body) });
      const jj = await r.json().catch(() => ({}));
      if (!r.ok) tot.erro++; else if (jj.deduped) tot.dup++; else if (jj.skipped) tot.pulado++; else tot.novo++;
    }
    await new Promise((res) => setTimeout(res, 1200));
  }
  console.log(new Date().toISOString(), "amazon", P.slug, JSON.stringify(tot));
}
