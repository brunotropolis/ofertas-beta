// Importa a planilha "Hot Deals" da Amazon Associados (formato de 25/Nov: ASIN, Título, Marca, Categoria,
// Classificação, Início do deal DD/MM/AAAA, Horário, Fim do deal, Preço da oferta, Preço cheio, % de desconto, URL)
// e distribui pelos 4 perfis como OFERTA EXCLUSIVA (fura a fila dentro do prazo, teto por grupo no auto-enqueue).
//
// 25/Nov (Bruno: "atualiza os disparos da amazon", planilha "Hot Deals BF - Associados.xlsx").
// Uso (precisa do tsx por causa da regra dos perfis em TypeScript):
//   npx tsx scripts/importar_hotdeals_amazon.mjs <arquivo.xlsx> [--dry] [--amostra]
//
// Perfil pela categoria da Amazon + a mesma regra dos grupos (src/lib/regras-perfil.ts):
//   Maternas = Baby, Toys/Saúde com sinal de bebê · Lar = cozinha, casa, eletrodoméstico, móveis, limpeza
//   Mãe = beleza e cuidados pessoais · Brunotropolis = PC, eletrônicos, celular, games, câmera, livro cultura pop
// Vinho, pet, esporte, mala, roupa, ferramenta e jardim ficam de fora. Desconto mínimo 20% (bebê 10%).
import fs from "node:fs";
import XLSX from "xlsx";
import { foraDoPerfil } from "../src/lib/regras-perfil.ts";

const ENV = Object.fromEntries(fs.readFileSync("D:/CLAUDE/.env.meta", "utf8").split(/\r?\n/)
  .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]));
const DRY = process.argv.includes("--dry");
const ARQ = process.argv[2];
if (!ARQ) { console.error("uso: npx tsx scripts/importar_hotdeals_amazon.mjs <arquivo.xlsx> [--dry]"); process.exit(1); }
const nomeArquivo = ARQ.split(/[\\/]/).pop();

const wb = XLSX.readFile(ARQ);
const bruto = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { raw: true });
const quando = (d, h) => { const [D, M, Y] = String(d).split("/").map(Number); const [hh, mm] = String(h || "00:00").split(":").map(Number); return new Date(Date.UTC(Y, M - 1, D, hh + 3, mm || 0)).toISOString(); };
const linhas = bruto.filter((r) => /^[A-Z0-9]{10}$/.test(r["Código ASIN"] || "")).map((r) => ({
  asin: r["Código ASIN"], titulo: String(r["Título do produto"] || "").trim(), categoria: String(r["Categoria"] || "").trim(),
  inicio: quando(r["Início do deal"], r["Horário de início"]), fim: quando(r["Fim do deal"], "23:59"),
  promo: Number(r["Preço da oferta"]) || null, capa: Number(r["Preço cheio"]) || null,
  desconto: Math.round(Math.abs(Number(r["% de desconto"]) || 0) * 100),
}));
console.log(`${nomeArquivo}: ${linhas.length} ofertas lidas`);

const BEBE = /\bbeb[eê]s?\b|infantil|fralda|mamadeira|chupeta|rec[eé]m[- ]nascido|gestante|maternidade|amament|len[çc]os? umedecido|ber[çc]o|banheira|\bbaby\b|\bkids\b|crian[çc]a/i;
const POP = /mang[áa]|\bhq\b|quadrinho|graphic novel|marvel|\bdc\b|batman|star wars|harry potter|tolkien|senhor dos an[ée]is|hobbit|stephen king|anime|naruto|one piece|dragon ball|pok[ée]mon|zelda|geek|nerd|duna\b|sandman/i;
// "Health & Personal Care" da Amazon mistura pilha, limpeza e farmácia com beleza: isso não vai pro Mãe
const CASA_NA_SAUDE = /pilha|bateria|tira ?manchas|vanish|lava ?roupas?|amaciante|sab[aã]o em (p[oó]|barra)|detergente|desinfetante|papel higi[eê]nico|fralda geri|incontin|preservativ|lubrificante [ií]ntimo|teste de gravidez|aparelho de press[aã]o|ox[ií]metro/i;
const chave = (t) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\b(preto|branco|azul|rosa|cinza|verde|vermelho|roxo|bege|grafite|prata|dourado|lil[aá]s|110v|127v|220v|bivolt)\b/g, "").replace(/[^a-z0-9]+/g, " ").trim().slice(0, 60);
const CATS = {
  "ofertas-maternas": (o) => (o.categoria === "Baby" || ((o.categoria === "Toys" || /Health|Personal_Care/.test(o.categoria)) && BEBE.test(o.titulo))),
  "ofertas-lar": (o) => /^(Kitchen|Home|Major Appliances|Furniture|Home Improvement|Grocery)$/.test(o.categoria) && !BEBE.test(o.titulo),
  "ofertas-mae": (o) => /^(Beauty|Luxury Beauty|Health & Personal Care|Personal_Care_Appliances)$/.test(o.categoria) && !BEBE.test(o.titulo) && !CASA_NA_SAUDE.test(o.titulo),
  "buscador-geek": (o) => /^(PC|Electronics|Wireless|Video Games|Camera|Home Entertainment)$/.test(o.categoria) || (o.categoria === "Books" && POP.test(o.titulo)),
};
const PERFIL_ID = { "ofertas-maternas": "8e8332fa-ebd8-41d5-948f-21bb6cd27a97", "ofertas-lar": "9b2a012e-4d44-41b3-8f1c-896c55c57d18", "ofertas-mae": "aa6b7dcb-11c6-4e8f-bcab-5965ec51462d", "buscador-geek": "f3887ae2-7b2c-462b-8984-e1e6618a0ba6" };
const agora = Date.now();
const valida = (o) => new Date(o.fim).getTime() > agora + 2 * 3600_000 && o.promo && o.capa && o.promo < o.capa;
const grupos = {}; const fora = {};
for (const [perfil, f] of Object.entries(CATS)) {
  const min = perfil === "ofertas-maternas" ? 10 : 20;
  grupos[perfil] = linhas.filter((o) => valida(o) && f(o) && o.desconto >= min).filter((o) => {
    const m = foraDoPerfil(PERFIL_ID[perfil], o.titulo); if (m) fora[m] = (fora[m] || 0) + 1; return !m;
  }).sort((a, b) => b.desconto - a.desconto).filter((o, i, l) => l.findIndex((x) => chave(x.titulo) === chave(o.titulo)) === i); // variação de cor/voltagem: 1 só
}
for (const [p, l] of Object.entries(grupos)) console.log(`${p}: ${l.length} (desconto ${l.at(-1)?.desconto ?? 0}%–${l[0]?.desconto ?? 0}%)`);
console.log("barradas pela regra do perfil:", fora);
if (process.argv.includes("--amostra")) { for (const [p, l] of Object.entries(grupos)) { console.log("== " + p); l.slice(0, 12).forEach((o) => console.log(`${o.desconto}% | ${o.categoria} | ${o.titulo.slice(0, 70)} | R$ ${o.promo} de ${o.capa} | até ${o.fim.slice(5, 10)}`)); } process.exit(0); }

// Foto, estoque e título pela Creators API
const tok = await (await fetch("https://api.amazon.com/auth/o2/token", { method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ grant_type: "client_credentials", client_id: ENV.AMAZON_ACCESS_KEY, client_secret: ENV.AMAZON_SECRET_KEY, scope: "creatorsapi::default" }) })).json();
const asins = [...new Set(Object.values(grupos).flat().map((o) => o.asin))];
const info = {};
for (let i = 0; i < asins.length; i += 10) {
  const r = await fetch("https://creatorsapi.amazon/catalog/v1/getItems", { method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer " + tok.access_token, "x-marketplace": "www.amazon.com.br" },
    body: JSON.stringify({ itemIds: asins.slice(i, i + 10), partnerTag: ENV.AMAZON_PARTNER_TAG || "manualdorec0c-20", marketplace: "www.amazon.com.br",
      resources: ["itemInfo.title", "images.primary.large", "offersV2.listings.availability", "offersV2.listings.price"] }) });
  const j = await r.json().catch(() => ({}));
  for (const it of j?.itemsResult?.items ?? []) info[it.asin] = it;
  await new Promise((res) => setTimeout(res, 1100));
}
const tituloCurto = (t) => { let s = t.split(/\s[|–]\s/)[0].trim(); if (s.length > 110) s = s.slice(0, 110).replace(/[\s,;:-]+\S*$/, "") + "…"; return s; };

const shopeeWf = await (await fetch(ENV.N8N_BASE_URL + "/api/v1/workflows/spdOQNLpjiLYiL4n", { headers: { "X-N8N-API-KEY": ENV.N8N_API_KEY } })).json();
const SECRET = shopeeWf.nodes.find((n) => n.name === "POST INGEST").parameters.headerParameters.parameters[0].value;
const fonte = `planilha amazon ${nomeArquivo.replace(/\.(xlsx|csv)$/i, "")}`.slice(0, 80);
const resumo = {};
for (const [perfil, lista] of Object.entries(grupos)) {
  const r0 = (resumo[perfil] = { criadas: 0, repetidas: 0, sem_foto: 0, sem_estoque: 0, puladas: 0, erros: 0 });
  for (const o of lista) {
    const it = info[o.asin];
    const img = it?.images?.primary?.large?.url;
    const l = it?.offersV2?.listings?.[0];
    if (!img) { r0.sem_foto++; continue; }
    if (!l || l.availability?.type === "OUT_OF_STOCK") { r0.sem_estoque++; continue; }
    const corpo = {
      source: "manual", source_ref: `exclusiva_amazon_${o.asin}_${o.inicio.slice(0, 10)}_${perfil}`,
      platform: "amazon", url: `https://www.amazon.com.br/dp/${o.asin}`, affiliate_url: `https://www.amazon.com.br/dp/${o.asin}?tag=manualdorec0c-20`,
      title: tituloCurto(it?.itemInfo?.title?.displayValue || o.titulo), price_current: o.promo, price_original: o.capa,
      discount_pct: o.desconto, image_url: img, perfil, kind: "produto", source_channel: "amazon exclusivas",
      promo_meta: { exclusiva: { inicio: o.inicio, fim: o.fim, preco_promo: o.promo, fonte }, categoria_amazon: o.categoria },
    };
    if (DRY) { r0.criadas++; continue; }
    const r = await fetch("https://app.buscadorgeek.com.br/api/ingest", { method: "POST", headers: { "x-ingest-secret": SECRET, "content-type": "application/json" }, body: JSON.stringify(corpo) });
    const j = await r.json().catch(() => ({}));
    if (j.deduped) r0.repetidas++; else if (j.skipped) r0.puladas++; else if (r.ok) r0.criadas++; else { r0.erros++; if (r0.erros < 4) console.log("erro", r.status, JSON.stringify(j).slice(0, 200)); }
  }
}
console.log(DRY ? "(simulação, nada gravado)" : "", resumo);
