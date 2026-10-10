// Monta/atualiza o workflow n8n "OFERTAS MATERNAS | Amazon Refresh" (30/30 min, 8h–20h BRT).
// Confere na Amazon (Creators API getItems) as ofertas Amazon ainda não publicadas:
// esgotado → sai do painel/fila; senão atualiza preço atual + Prime/selo/fim da oferta/preço por unidade/vendedor.
// Uso: node scripts/build_amazon_refresh.mjs [--activate]
import fs from "fs";

const env = Object.fromEntries(
  fs.readFileSync("D:/CLAUDE/.env.meta", "utf8").split(/\r?\n/).filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^'(.*)'$/, "$1").replace(/^"(.*)"$/, "$1")]; })
);
const N8N = env.N8N_BASE_URL, KEY = env.N8N_API_KEY;
const api = async (method, p, body) => {
  const r = await fetch(`${N8N}/api/v1${p}`, { method, headers: { "X-N8N-API-KEY": KEY, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${p} ${r.status} ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : {};
};

const NAME = "OFERTAS MATERNAS | Amazon Refresh";
const shopeeWf = await api("GET", "/workflows/spdOQNLpjiLYiL4n");
const ingestSecret = shopeeWf.nodes.find((n) => n.name === "POST INGEST").parameters.headerParameters.parameters[0].value;

const jsCode = `// GERADO por ofertas-beta/scripts/build_amazon_refresh.mjs — editar lá e rodar o build.
const h = this.helpers;
const SECRET = ${JSON.stringify(ingestSecret)};
const BASE = 'https://app.buscadorgeek.com.br/api/ingest/atualizar';
const lista = await h.httpRequest({ url: BASE + '?perfil=ofertas-maternas&dias=3', headers: { 'x-ingest-secret': SECRET }, json: true });
const itens = (lista && lista.itens) || [];
if (!itens.length) return [{ json: { conferidos: 0 } }];

const tok = await h.httpRequest({ url: 'https://api.amazon.com/auth/o2/token', method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ grant_type: 'client_credentials', client_id: $env.AMAZON_ACCESS_KEY, client_secret: $env.AMAZON_SECRET_KEY, scope: 'creatorsapi::default' }), json: false });
const access = (typeof tok === 'string' ? JSON.parse(tok) : tok).access_token;

const byAsin = {};
for (const it of itens) (byAsin[it.asin] = byAsin[it.asin] || []).push(it);
const asins = Object.keys(byAsin);
const info = {};
for (let i = 0; i < asins.length; i += 10) {
  const r = await h.httpRequest({ url: 'https://creatorsapi.amazon/catalog/v1/getItems', method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + access, 'x-marketplace': 'www.amazon.com.br' },
    body: JSON.stringify({ itemIds: asins.slice(i, i + 10), partnerTag: $env.AMAZON_PARTNER_TAG || 'manualdorec0c-20', marketplace: 'www.amazon.com.br',
      resources: ['offersV2.listings.price', 'offersV2.listings.dealDetails', 'offersV2.listings.availability', 'offersV2.listings.merchantInfo'] }),
    json: false, ignoreHttpStatusErrors: true });
  const j = typeof r === 'string' ? JSON.parse(r || '{}') : r;
  for (const it of (j.itemsResult && j.itemsResult.items) || []) info[it.asin] = (it.offersV2 && it.offersV2.listings && it.offersV2.listings[0]) || null;
  await new Promise((res) => setTimeout(res, 1100)); // Creators API: ~1 req/s
}

const out = [];
for (const asin of asins) {
  const l = info[asin];
  if (l === undefined) continue; // sem resposta: não mexe
  for (const it of byAsin[asin]) {
    if (!l || (l.availability && l.availability.type === 'OUT_OF_STOCK')) { out.push({ id: it.id, esgotado: true }); continue; }
    const price = l.price && l.price.money ? l.price.money.amount : null;
    const orig = l.price && l.price.savingBasis && l.price.savingBasis.money ? l.price.savingBasis.money.amount : null;
    const ppu = l.price && l.price.pricePerUnit;
    const d = l.dealDetails || {};
    out.push({ id: it.id, price_current: price, price_original: orig && price && orig > price ? orig : null, promo: {
      prime_exclusive: d.accessType === 'PRIME_EXCLUSIVE', badge: d.badge || null, deal_end: d.endTime || null,
      unit_price: ppu && /unidade/i.test(ppu.displayAmount || '') ? ppu.amount : null,
      amazon_seller: l.merchantInfo && l.merchantInfo.name ? /amazon/i.test(l.merchantInfo.name) : null } });
  }
}
// grava em lotes: 1 POST com centenas de itens passava dos 100s da Cloudflare (524)
const resposta = { removidos: 0, atualizados: 0, lotes_com_erro: 0 };
for (let i = 0; i < out.length; i += 40) {
  try {
    const r = await h.httpRequest({ url: BASE, method: 'POST', headers: { 'x-ingest-secret': SECRET, 'content-type': 'application/json' }, body: JSON.stringify({ itens: out.slice(i, i + 40) }), json: false });
    const j = typeof r === 'string' ? JSON.parse(r) : r;
    resposta.removidos += j.removidos || 0; resposta.atualizados += j.atualizados || 0;
  } catch (e) { resposta.lotes_com_erro++; }
}
if (resposta.lotes_com_erro && !resposta.atualizados && !resposta.removidos) throw new Error('todos os lotes falharam');
return [{ json: { conferidos: itens.length, asins: asins.length, resposta } }];
`;

const nodes = [
  // só 8h–20h BRT (regra do perfil: nada de madrugada)
  { parameters: { rule: { interval: [{ field: "cronExpression", expression: "*/30 8-19 * * *" }] } }, name: "A cada 30 min", type: "n8n-nodes-base.scheduleTrigger", typeVersion: 1.2, position: [0, 0] },
  { parameters: { jsCode }, name: "CONFERIR AMAZON", type: "n8n-nodes-base.code", typeVersion: 2, position: [240, 0] },
];
const connections = { "A cada 30 min": { main: [[{ node: "CONFERIR AMAZON", type: "main", index: 0 }]] } };
const body = { name: NAME, nodes, connections, settings: { executionOrder: "v1", timezone: "America/Sao_Paulo" } };

const list = await api("GET", "/workflows?limit=250");
const existing = (list.data || []).find((w) => w.name === NAME);
let id;
if (existing) { id = existing.id; await api("POST", `/workflows/${id}/deactivate`).catch(() => {}); await api("PUT", `/workflows/${id}`, body); }
else id = (await api("POST", "/workflows", body)).id;
if (process.argv.includes("--activate")) await api("POST", `/workflows/${id}/activate`);
console.log("workflow", id, existing ? "atualizado" : "criado", process.argv.includes("--activate") ? "(ativo)" : "(inativo)");
