// Monta/atualiza o workflow n8n "OFERTAS MATERNAS | ML Vendas Sync" (todo dia 8h e 14h BRT).
// Puxa as vendas de afiliado do Mercado Livre (conta materna, últimos 35 dias) pelo endpoint interno
// do painel de afiliados (só cookie) e grava no painel via POST /api/vendas/import (x-import-secret = CRON_SECRET).
// A Amazon NÃO entra aqui (relatório só pelo navegador → skill /vendas-sync).
// Uso: node scripts/build_ml_vendas_sync.mjs [--activate]
// ⚠️ cookie = ML_COOKIE_MATERNA do cofre (HARDCODED no nó) — ao renovar o cookie, rodar este build de novo.
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

const NAME = "OFERTAS MATERNAS | ML Vendas Sync";
// segredo do painel = o mesmo que o Cron Tick usa (x-cron-secret)
const tick = await api("GET", "/workflows/vFkjMhuwYIe4ZnON");
let cronSecret = null;
for (const n of tick.nodes) for (const h of n.parameters?.headerParameters?.parameters || []) if (/secret/i.test(h.name)) cronSecret = h.value;
if (!cronSecret) throw new Error("CRON_SECRET não achado no Tick");

const jsCode = `// GERADO por ofertas-beta/scripts/build_ml_vendas_sync.mjs — editar lá e rodar o build.
const h = this.helpers;
const COOKIE = ${JSON.stringify(env.ML_COOKIE_MATERNA)};
const SECRET = ${JSON.stringify(cronSecret)};
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36';
const DIAS = 35;
const brt = (ms) => new Date(ms - 3 * 3600e3).toISOString().slice(0, 10);
const fim = brt(Date.now());                       // hoje 00:00 BRT (fim precisa ser <= hoje)
const ini = brt(Date.now() - DIAS * 86400e3);
const range = encodeURIComponent(ini + 'T00:00:00.000-03:00--' + fim + 'T00:00:00.000-03:00');
const ST = { APPROVED: 'CONFIRMED', IN_REVIEW: 'PENDING', CANCELED: 'CANCELLED', REJECTED: 'CANCELLED' };
const get = async (page) => {
  const r = await h.httpRequest({ url: 'https://www.mercadolivre.com.br/affiliate-program/api/dashboard/sales/general?filter_time_range=' + range + '&items_per_page=50&page=' + page + '&order_by=ord_date_created&sort=desc&type=GENERAL',
    headers: { cookie: COOKIE, 'user-agent': UA, accept: 'application/json' }, json: false, returnFullResponse: true, ignoreHttpStatusErrors: true, timeout: 30000 });
  if (r.statusCode !== 200) throw new Error('ML respondeu ' + r.statusCode + ' (sessão da conta materna caiu? renovar ML_COOKIE_MATERNA + rodar o build)');
  return typeof r.body === 'string' ? JSON.parse(r.body) : r.body;
};
const first = await get(1);
const total = first.total_results || 0;
if (total < 10) throw new Error('ML devolveu só ' + total + ' vendas em ' + DIAS + ' dias — conta errada ou sessão caída');
const rows = [];
const push = (j) => { for (const it of j.item_list || []) { const [d, m, y] = String(it.date || '').split('/');
  rows.push({ external_id: String(it.id), sold_at: y + '-' + m + '-' + d + 'T12:00:00.000-03:00', product_name: it.productName, product_image: it.productImage,
    category: it.categoryName, store: it.storeName, gross_value: Number(it.saleValue) || 0, units: Number(it.saleUnits) || 1, commission: Number(it.commissionValue) || 0,
    commission_pct: it.commissionPercentage != null ? Number(it.commissionPercentage) : null, status: ST[it.status] || it.status, sale_type: it.saleType }); } };
push(first);
for (let p = 2; p <= Math.ceil(total / 50); p++) push(await get(p));
let gravadas = 0;
for (let i = 0; i < rows.length; i += 400) {
  const r = await h.httpRequest({ url: 'https://ofertas-beta-painel.xktssy.easypanel.host/api/vendas/import', method: 'POST',
    headers: { 'x-import-secret': SECRET, 'content-type': 'application/json' }, body: JSON.stringify({ source: 'ml', rows: rows.slice(i, i + 400) }), json: false, returnFullResponse: true, ignoreHttpStatusErrors: true, timeout: 60000 });
  if (r.statusCode >= 300) throw new Error('import ' + r.statusCode + ' ' + String(r.body).slice(0, 200));
  gravadas += Math.min(400, rows.length - i);
}
const com = rows.filter((r) => r.status !== 'CANCELLED').reduce((a, r) => a + r.commission, 0);

// Por ETIQUETA (23/Out): a lista de vendas não diz a etiqueta; a página de ganhos (afiliados/dashboard, bloco
// "earnings") diz cliques/vendas/comissão por etiqueta no período → 1 dia por vez, últimos 10 dias + hoje.
// Vai pra tabela à parte (afiliado_etiquetas_diario). Falha aqui não derruba o sync de vendas acima.
const etiquetas = [];
let erroEtiquetas = null;
try {
  for (let k = 10; k >= 0; k--) {
    const dia = brt(Date.now() - k * 86400e3), prox = brt(Date.now() - (k - 1) * 86400e3);
    const r = await h.httpRequest({ url: 'https://www.mercadolivre.com.br/afiliados/dashboard?filter_time_range=' + encodeURIComponent(dia + 'T00:00:00.000-03:00--' + prox + 'T00:00:00.000-03:00'),
      headers: { cookie: COOKIE, 'user-agent': UA }, json: false, returnFullResponse: true, ignoreHttpStatusErrors: true, timeout: 60000 });
    const t = String(r.body || '');
    const m = t.match(/"earnings":\\{"item_list":(\\[[^\\]]*\\])/);
    if (!m) continue;
    for (const e of JSON.parse(m[1])) etiquetas.push({ tag: e.tag, dia, cliques: e.clicks || 0, vendas: e.quantity || 0, comissao: e.earnings || 0 });
  }
  if (etiquetas.length) {
    const r = await h.httpRequest({ url: 'https://ofertas-beta-painel.xktssy.easypanel.host/api/vendas/import', method: 'POST',
      headers: { 'x-import-secret': SECRET, 'content-type': 'application/json' }, body: JSON.stringify({ source: 'ml', etiquetas }), json: false, returnFullResponse: true, ignoreHttpStatusErrors: true, timeout: 60000 });
    if (r.statusCode >= 300) erroEtiquetas = 'import etiquetas ' + r.statusCode + ' ' + String(r.body).slice(0, 150);
  }
} catch (e) { erroEtiquetas = String(e).slice(0, 200); }
return [{ json: { janela: ini + '..' + fim, vendas: rows.length, gravadas, comissao_sem_canceladas: Math.round(com * 100) / 100, etiquetas: etiquetas.length, erroEtiquetas } }];
`;

const nodes = [
  { parameters: { rule: { interval: [{ field: "cronExpression", expression: "0 8,14 * * *" }] } }, name: "8h e 14h", type: "n8n-nodes-base.scheduleTrigger", typeVersion: 1.2, position: [0, 0] },
  { parameters: { jsCode }, name: "PUXAR VENDAS ML + GRAVAR", type: "n8n-nodes-base.code", typeVersion: 2, position: [240, 0] },
];
const connections = { "8h e 14h": { main: [[{ node: "PUXAR VENDAS ML + GRAVAR", type: "main", index: 0 }]] } };
if (process.env.PRINT_CODE) { fs.writeFileSync(process.env.PRINT_CODE, jsCode); process.exit(0); }
if (process.env.CRON_TESTE) nodes[0].parameters.rule.interval[0].expression = process.env.CRON_TESTE;
const body = { name: NAME, nodes, connections, settings: { executionOrder: "v1", timezone: "America/Sao_Paulo" } };

const list = await api("GET", "/workflows?limit=250");
const existing = (list.data || []).find((w) => w.name === NAME);
let id;
if (existing) { id = existing.id; await api("POST", `/workflows/${id}/deactivate`).catch(() => {}); await api("PUT", `/workflows/${id}`, body); }
else id = (await api("POST", "/workflows", body)).id;
if (process.argv.includes("--activate")) await api("POST", `/workflows/${id}/activate`);
console.log("workflow", id, existing ? "atualizado" : "criado", process.argv.includes("--activate") ? "(ativo)" : "(inativo)");
