// Monta/atualiza o workflow n8n "OFERTAS MATERNAS | Amazon Cupons" (26/Out) — a cada 2h das 8h às 18h BRT.
// Lê a página pública de produtos com cupom da Amazon (deals-collection-coupons; abre do servidor, sem captcha),
// fica só com o que combina com o público das Maternas e manda pro /api/ingest como PRODUTO com cupom:
// preço já com o cupom + "✔️Ative o cupom de R$ X no anúncio" (promo_meta.cupom_anuncio). O mix da Maternas
// (auto-enqueue) pega como qualquer produto Amazon. Tag = manualdorec0c-20 (o encurtador troca pela da campanha).
// Uso: node scripts/build_amazon_cupons.mjs [--activate]   ·   PRINT_CODE=arq.js → só grava o código do nó
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

const NAME = "OFERTAS MATERNAS | Amazon Cupons";
// segredo do ingest = o mesmo dos coletores maternas (nó POST INGEST do coletor Shopee)
const shopeeWf = await api("GET", "/workflows/spdOQNLpjiLYiL4n");
const ingestSecret = shopeeWf.nodes.find((n) => n.name === "POST INGEST").parameters.headerParameters.parameters[0].value;

const jsCode = `// GERADO por ofertas-beta/scripts/build_amazon_cupons.mjs — editar lá e rodar o build.
const h = this.helpers;
const SECRET = ${JSON.stringify(ingestSecret)};
const TAG = 'manualdorec0c-20';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36';
// categorias da Amazon que combinam com mãe/bebê/casa; o resto (drone, PC, TV, móvel de escritório, pet) fica fora
const CATS = new Set(['gl_baby_product', 'gl_toy', 'gl_beauty', 'gl_drugstore', 'gl_kitchen', 'gl_home', 'gl_grocery', 'gl_apparel', 'gl_shoes', 'gl_personal_care_appliances', 'gl_home_improvement', 'gl_luggage', 'gl_sports']);
const FORA = /cadeira de rodas|adulto|gamer|drone|\\bpet\\b|gatos?\\b|c[aã]es|cachorro|vinho|cerveja|whisky|masculino|barbear|tabaco|arma|faca t[aá]tica|escrit[oó]rio/i;
const r = await h.httpRequest({ url: 'https://www.amazon.com.br/deals?bubble-id=deals-collection-coupons', headers: { 'user-agent': UA, 'accept-language': 'pt-BR,pt;q=0.9' }, json: false, returnFullResponse: true, ignoreHttpStatusErrors: true, timeout: 45000 });
const t = String(r.body || '');
if (r.statusCode !== 200 || /captcha/i.test(t.slice(0, 20000))) throw new Error('Amazon respondeu ' + r.statusCode + (/captcha/i.test(t) ? ' (captcha)' : ''));
const vistos = new Map();
let pos = 0;
while ((pos = t.indexOf('"coupon":{"label"', pos + 1)) > 0) {
  const s = t.lastIndexOf('{"asin":"', pos);
  if (s < 0) continue;
  let e = s, d = 0;
  for (e = s; e < t.length; e++) { if (t[e] === '{') d++; else if (t[e] === '}') { d--; if (d === 0) break; } }
  try { const o = JSON.parse(t.slice(s, e + 1)); if (o.asin) vistos.set(o.asin, o); } catch (x) {}
}
const hoje = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10).replace(/-/g, '');
const brl = (n) => 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const res = { lidos: vistos.size, enviados: 0, fora: 0, dedup: 0, erros: [] };
for (const o of vistos.values()) {
  const cat = o.productCategory && o.productCategory.symbol;
  const preco = parseFloat(o.price && o.price.priceToPay && o.price.priceToPay.price);
  const frag = ((o.coupon && o.coupon.label && o.coupon.label.fragments) || []).find((f) => f.money);
  const comCupom = frag ? parseFloat(frag.money.amount) : null;
  const img = o.image && (o.image.hiRes || o.image.lowRes);
  // farmácia/mercado: só o que é de bebê/mãe/cuidado (suplemento de adulto não vai pros grupos das mães)
  const precisaTema = cat === 'gl_drugstore' || cat === 'gl_grocery';
  if (precisaTema && !/beb[eê]|infantil|kids|crian[cç]a|gestante|mam[aã]e|matern|fralda|len[cç]o|pomada|assadura|sabonete|shampoo|hidratante|protetor solar|repelente/i.test(o.title || '')) { res.fora++; continue; }
  if (!CATS.has(cat) || FORA.test(o.title || '') || !(preco > 0) || !(comCupom > 0) || comCupom >= preco || !img || preco > 400) { res.fora++; continue; }
  const url = 'https://www.amazon.com.br/dp/' + o.asin + '?tag=' + TAG;
  const body = {
    source: 'auto', source_channel: 'amazon:cupons', source_ref: 'amzcupom_' + o.asin + '_' + hoje, kind: 'produto', platform: 'amazon',
    perfil: 'ofertas-maternas', url, affiliate_url: url, title: o.title, price_current: comCupom, price_original: preco,
    discount_pct: Math.round((1 - comCupom / preco) * 100), image_url: img.baseUrl + '.' + (img.extension || 'jpg'),
    promo_meta: { cupom_anuncio: brl(preco - comCupom), checked_at: new Date().toISOString() },
  };
  try {
    const x = await h.httpRequest({ url: 'https://app.buscadorgeek.com.br/api/ingest', method: 'POST', headers: { 'x-ingest-secret': SECRET, 'content-type': 'application/json' }, body: JSON.stringify(body), json: false, returnFullResponse: true, ignoreHttpStatusErrors: true, timeout: 30000 });
    if (x.statusCode >= 300) res.erros.push(o.asin + ' ' + x.statusCode);
    else if (/deduped/.test(String(x.body))) res.dedup++; else res.enviados++;
  } catch (er) { res.erros.push(o.asin + ' ' + String(er).slice(0, 80)); }
}
return [{ json: res }];
`;

const nodes = [
  { parameters: { rule: { interval: [{ field: "cronExpression", expression: "10 8-18/2 * * *" }] } }, name: "a cada 2h (8h-18h)", type: "n8n-nodes-base.scheduleTrigger", typeVersion: 1.2, position: [0, 0] },
  { parameters: { jsCode }, name: "LER CUPONS AMAZON + INGEST", type: "n8n-nodes-base.code", typeVersion: 2, position: [240, 0] },
];
const connections = { "a cada 2h (8h-18h)": { main: [[{ node: "LER CUPONS AMAZON + INGEST", type: "main", index: 0 }]] } };
if (process.env.PRINT_CODE) { fs.writeFileSync(process.env.PRINT_CODE, jsCode); process.exit(0); }
const body = { name: NAME, nodes, connections, settings: { executionOrder: "v1", timezone: "America/Sao_Paulo" } };

const list = await api("GET", "/workflows?limit=250");
const existing = (list.data || []).find((w) => w.name === NAME);
let id;
if (existing) { id = existing.id; await api("POST", `/workflows/${id}/deactivate`).catch(() => {}); await api("PUT", `/workflows/${id}`, body); }
else id = (await api("POST", "/workflows", body)).id;
if (process.argv.includes("--activate")) await api("POST", `/workflows/${id}/activate`);
console.log("workflow", id, existing ? "atualizado" : "criado", process.argv.includes("--activate") ? "(ativo)" : "(inativo)");
