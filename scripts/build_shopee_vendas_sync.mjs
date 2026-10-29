// Monta/atualiza o workflow n8n "OFERTAS MATERNAS | Shopee Vendas Sync" (todo dia 8h e 14h BRT).
// Por que existe (29/Out): a API oficial da Shopee (conversionReport) só devolve os ÚLTIMOS 3 MESES e a tela
// Vendas lê ao vivo, então o histórico se perdia. Este robô grava cada item vendido em affiliate_sales
// (source=shopee) pra o Tio Patinhas ter série longa. A tela Vendas continua ao vivo (não lê esta fonte do banco).
// Grão = 1 linha por item de pedido: external_id = <orderId>-<itemId>. sale_type = referrer da Shopee
// (WhatsApp/Websites/Instagram/Others...), utm = utmContent (desde 22/10 os grupos mandam "<grupo>-<campanha>").
// Uso: node scripts/build_shopee_vendas_sync.mjs [--activate]
//      node scripts/build_shopee_vendas_sync.mjs --backfill [dias]   (roda local, grava direto no Supabase; máx ~90 dias)
import fs from "fs";
import crypto from "crypto";

const env = Object.fromEntries(
  fs.readFileSync("D:/CLAUDE/.env.meta", "utf8").split(/\r?\n/).filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^'(.*)'$/, "$1").replace(/^"(.*)"$/, "$1")]; })
);

const QUERY_NODES = "nodes{ purchaseTime conversionId conversionStatus utmContent device referrer buyerType orders{ orderId items{ itemId itemName itemPrice qty actualAmount itemTotalCommission globalCategoryLv1Name shopName attributionType } } } pageInfo{ hasNextPage scrollId }";
const ST = { COMPLETED: "CONFIRMED", PENDING: "PENDING", UNPAID: "PENDING", CANCELLED: "CANCELLED" };

// nó → linhas de affiliate_sales (mesma regra no n8n e no backfill)
function toRows(n) {
  const rows = [];
  for (const o of n.orders || []) for (const it of o.items || []) {
    rows.push({
      external_id: `${o.orderId}-${it.itemId}`,
      sold_at: new Date(Number(n.purchaseTime) * 1000).toISOString(),
      product_name: it.itemName || null,
      category: it.globalCategoryLv1Name || null,
      store: it.shopName || null,
      gross_value: Number(it.actualAmount) || (Number(it.itemPrice) || 0) * (Number(it.qty) || 1),
      units: Number(it.qty) || 1,
      commission: Number(it.itemTotalCommission) || 0,
      status: ST[n.conversionStatus] || n.conversionStatus,
      sale_type: n.referrer || null,
      utm: n.utmContent && n.utmContent.replace(/-/g, "").trim() ? n.utmContent : null,
      device: n.device || null,
      raw: { conversionId: String(n.conversionId), buyerType: n.buyerType, attributionType: it.attributionType },
    });
  }
  return rows;
}

if (process.argv.includes("--backfill")) {
  const dias = Number(process.argv[process.argv.indexOf("--backfill") + 1]) || 89;
  const A = env.SHOPEE_APP_ID, S = env.SHOPEE_APP_SECRET;
  const call = async (query) => {
    const body = JSON.stringify({ query }); const ts = Math.floor(Date.now() / 1000);
    const sig = crypto.createHash("sha256").update(A + ts + body + S).digest("hex");
    const r = await fetch("https://open-api.affiliate.shopee.com.br/graphql", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `SHA256 Credential=${A}, Timestamp=${ts}, Signature=${sig}` }, body });
    const j = await r.json(); if (j.errors) throw new Error(j.errors[0].message); return j.data.conversionReport;
  };
  const end = Math.floor(Date.now() / 1000);
  let rows = [];
  for (let start = end - dias * 86400; start < end; start += 15 * 86400) {
    const e2 = Math.min(start + 15 * 86400, end); let sc = "";
    for (let p = 0; p < 200; p++) {
      const cr = await call(`query{ conversionReport(purchaseTimeStart:${start}, purchaseTimeEnd:${e2}, limit:500, scrollId:${JSON.stringify(sc)}){ ${QUERY_NODES} } }`);
      for (const n of cr.nodes) rows.push(...toRows(n));
      if (!cr.pageInfo.hasNextPage) break; sc = cr.pageInfo.scrollId;
    }
  }
  const uniq = new Map(rows.map((r) => [r.external_id, r])); rows = [...uniq.values()];
  const U = env.SUPABASE_URL_OFERTAS_BETA, K = env.SUPABASE_SERVICE_ROLE_OFERTAS_BETA, now = new Date().toISOString();
  for (let i = 0; i < rows.length; i += 500) {
    const r = await fetch(`${U}/rest/v1/affiliate_sales?on_conflict=source,external_id`, { method: "POST",
      headers: { apikey: K, Authorization: `Bearer ${K}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(rows.slice(i, i + 500).map((x) => ({ ...x, source: "shopee", synced_at: now }))) });
    if (!r.ok) throw new Error(`upsert ${r.status} ${await r.text()}`);
  }
  const com = rows.filter((r) => r.status !== "CANCELLED").reduce((a, r) => a + r.commission, 0);
  console.log(`backfill Shopee ${dias}d: ${rows.length} itens, comissão R$ ${com.toFixed(2)}`);
  process.exit(0);
}

const N8N = env.N8N_BASE_URL, KEY = env.N8N_API_KEY;
const api = async (method, p, body) => {
  const r = await fetch(`${N8N}/api/v1${p}`, { method, headers: { "X-N8N-API-KEY": KEY, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${p} ${r.status} ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : {};
};

const NAME = "OFERTAS MATERNAS | Shopee Vendas Sync";
const SECRET = env.CRON_SECRET_OFERTAS_BETA;
if (!SECRET) throw new Error("CRON_SECRET_OFERTAS_BETA faltando no cofre");

const jsCode = `// GERADO por ofertas-beta/scripts/build_shopee_vendas_sync.mjs — editar lá e rodar o build.
const h = this.helpers;
const crypto = require('crypto');
const APP_ID = ${JSON.stringify(env.SHOPEE_APP_ID)};
const APP_SECRET = ${JSON.stringify(env.SHOPEE_APP_SECRET)};
const SECRET = ${JSON.stringify(SECRET)};
const DIAS = 35; // status muda de PENDING pra COMPLETED/CANCELLED por semanas
const ST = ${JSON.stringify(ST)};
const toRows = ${toRows.toString()};
const call = async (query) => {
  const body = JSON.stringify({ query }); const ts = Math.floor(Date.now() / 1000);
  const sig = crypto.createHash('sha256').update(APP_ID + ts + body + APP_SECRET).digest('hex');
  const r = await h.httpRequest({ url: 'https://open-api.affiliate.shopee.com.br/graphql', method: 'POST', body,
    headers: { 'Content-Type': 'application/json', Authorization: 'SHA256 Credential=' + APP_ID + ', Timestamp=' + ts + ', Signature=' + sig }, json: false, timeout: 60000 });
  const j = typeof r === 'string' ? JSON.parse(r) : r;
  if (j.errors) throw new Error('Shopee: ' + j.errors[0].message);
  return j.data.conversionReport;
};
const end = Math.floor(Date.now() / 1000);
let rows = [];
for (let start = end - DIAS * 86400; start < end; start += 15 * 86400) {
  const e2 = Math.min(start + 15 * 86400, end); let sc = '';
  for (let p = 0; p < 200; p++) {
    const cr = await call('query{ conversionReport(purchaseTimeStart:' + start + ', purchaseTimeEnd:' + e2 + ', limit:500, scrollId:' + JSON.stringify(sc) + '){ ${QUERY_NODES} } }');
    for (const n of cr.nodes) rows.push(...toRows(n));
    if (!cr.pageInfo.hasNextPage) break; sc = cr.pageInfo.scrollId;
  }
}
rows = [...new Map(rows.map((r) => [r.external_id, r])).values()];
if (rows.length < 20) throw new Error('Shopee devolveu só ' + rows.length + ' itens em ' + DIAS + ' dias');
for (let i = 0; i < rows.length; i += 400) {
  const r = await h.httpRequest({ url: 'https://ofertas-beta-painel.xktssy.easypanel.host/api/vendas/import', method: 'POST',
    headers: { 'x-import-secret': SECRET, 'content-type': 'application/json' }, body: JSON.stringify({ source: 'shopee', rows: rows.slice(i, i + 400) }), json: false, returnFullResponse: true, ignoreHttpStatusErrors: true, timeout: 60000 });
  if (r.statusCode >= 300) throw new Error('import ' + r.statusCode + ' ' + String(r.body).slice(0, 200));
}
const com = rows.filter((r) => r.status !== 'CANCELLED').reduce((a, r) => a + r.commission, 0);
return [{ json: { itens: rows.length, comissao: Math.round(com * 100) / 100, dias: DIAS } }];
`;

const nodes = [
  { id: "cron", name: "8H E 14H", type: "n8n-nodes-base.scheduleTrigger", typeVersion: 1.2, position: [0, 0],
    parameters: { rule: { interval: [{ field: "cronExpression", expression: "15 8,14 * * *" }] } } },
  { id: "sync", name: "PUXAR SHOPEE + GRAVAR", type: "n8n-nodes-base.code", typeVersion: 2, position: [260, 0], parameters: { jsCode } },
];
const connections = { "8H E 14H": { main: [[{ node: "PUXAR SHOPEE + GRAVAR", type: "main", index: 0 }]] } };
const settings = { executionOrder: "v1", timezone: "America/Sao_Paulo" };

const list = await api("GET", "/workflows?limit=250");
const found = list.data.find((w) => w.name === NAME);
let id;
if (found) {
  id = found.id;
  if (found.active) await api("POST", `/workflows/${id}/deactivate`);
  await api("PUT", `/workflows/${id}`, { name: NAME, nodes, connections, settings });
} else {
  id = (await api("POST", "/workflows", { name: NAME, nodes, connections, settings })).id;
}
if (process.argv.includes("--activate")) await api("POST", `/workflows/${id}/activate`);
console.log(`${NAME} = ${id}${process.argv.includes("--activate") ? " (ativo)" : ""}`);
