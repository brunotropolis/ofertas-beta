// Monta/atualiza o workflow n8n "OFERTAS MATERNAS | Telegram Leitor" a partir de scripts/telegram-leitor.core.js.
// Uso: node scripts/build_telegram_leitor.mjs   (lê D:\CLAUDE\.env.meta; segredo do ingest vem do coletor Shopee maternas)
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
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

const NAME = "OFERTAS MATERNAS | Telegram Leitor";
const CHANNELS = ["grupo_promocoes", "amigacompra", "promocaozinha", "cuponsm", "afiliadosshopeebroficial", "cuponsdasho", "fadadoscupons"];

// segredo do ingest = o mesmo dos coletores maternas
const shopeeWf = await api("GET", "/workflows/spdOQNLpjiLYiL4n");
const ingestSecret = shopeeWf.nodes.find((n) => n.name === "POST INGEST").parameters.headerParameters.parameters[0].value;
// cookie ML = o mesmo do coletor ML maternas (fonte: cofre)
const mlCookie = env.ML_COOKIE_MATERNA;

const core = fs.readFileSync(path.join(here, "telegram-leitor.core.js"), "utf8").replace(/\nif \(typeof module[\s\S]*$/, "\n");

const sha256 = `
function sha256(ascii){function rr(v,a){return(v>>>a)|(v<<(32-a))}var mp=Math.pow,mw=mp(2,32),r='',w=[],abl=ascii.length*8,h=[],k=[],pc=0,ic={};
for(var c=2;pc<64;c++){if(!ic[c]){for(var i=0;i<313;i+=c)ic[i]=c;h[pc]=(mp(c,.5)*mw)|0;k[pc++]=(mp(c,1/3)*mw)|0}}
ascii+='\\x80';while(ascii.length%64-56)ascii+='\\x00';
for(i=0;i<ascii.length;i++){var j=ascii.charCodeAt(i);if(j>>8)return null;w[i>>2]|=j<<((3-i)%4)*8}
w[w.length]=((abl/mw)|0);w[w.length]=(abl);
for(j=0;j<w.length;){var ww=w.slice(j,j+=16),oh=h;h=h.slice(0,8);
for(i=0;i<64;i++){var w15=ww[i-15],w2=ww[i-2],a=h[0],e=h[4];
var t1=h[7]+(rr(e,6)^rr(e,11)^rr(e,25))+((e&h[5])^((~e)&h[6]))+k[i]+(ww[i]=(i<16)?ww[i]:(ww[i-16]+(rr(w15,7)^rr(w15,18)^(w15>>>3))+ww[i-7]+(rr(w2,17)^rr(w2,19)^(w2>>>10)))|0);
var t2=(rr(a,2)^rr(a,13)^rr(a,22))+((a&h[1])^(a&h[2])^(h[1]&h[2]));h=[(t1+t2)|0].concat(h);h[4]=(h[4]+t1)|0}
for(i=0;i<8;i++)h[i]=(h[i]+oh[i])|0}
for(i=0;i<8;i++)for(j=3;j+1;j--){var b=(h[i]>>(j*8))&255;r+=((b<16)?0:'')+b.toString(16)}return r}
function sha256utf8(s){return sha256(unescape(encodeURIComponent(s)))}
`;

const main = `
const helpers = this.helpers;
const http = async ({ url, method = 'GET', headers = {}, body, manual }) => {
  const r = await helpers.httpRequest({ url, method, headers, body, json: false, returnFullResponse: true, ignoreHttpStatusErrors: true, disableFollowRedirect: !!manual, timeout: 25000 });
  return { status: r.statusCode, headers: r.headers || {}, body: typeof r.body === 'string' ? r.body : (Buffer.isBuffer(r.body) ? r.body.toString('utf8') : JSON.stringify(r.body)) };
};
const INGEST_SECRET = ${JSON.stringify(ingestSecret)};
let kw = [];
try {
  const k = await helpers.httpRequest({ url: 'https://app.buscadorgeek.com.br/api/keywords/collector?slug=ofertas-maternas', headers: { 'x-ingest-secret': INGEST_SECRET }, json: true });
  if (k && Array.isArray(k.keywords)) kw = k.keywords;
} catch (e) {}
const state = $getWorkflowStaticData('global');
const res = await runLeitor({
  http, sha256: sha256utf8, state, kw,
  cfg: {
    channels: ${JSON.stringify(CHANNELS)},
    shopee: { appId: ${JSON.stringify(env.SHOPEE_APP_ID)}, secret: ${JSON.stringify(env.SHOPEE_APP_SECRET)} },
    ml: { cookie: ${JSON.stringify(mlCookie)}, csrf: 'Mqp1xO_51aAxfOR-BiDjSQnt', tag: 'manualmanual20230331072922', social: 'https://www.mercadolivre.com.br/social/manualdorecemnascido' },
    amazon: { accessKey: $env.AMAZON_ACCESS_KEY, secretKey: $env.AMAZON_SECRET_KEY, partnerTag: $env.AMAZON_PARTNER_TAG || 'manualdorec0c-20' },
    amazonTag: 'manualdorec0c-20', firstRunHours: 6,
  },
});
let ok = 0, dedup = 0; const falhas = [];
for (const o of res.enviados) {
  try {
    const r = await helpers.httpRequest({ url: 'https://app.buscadorgeek.com.br/api/ingest', method: 'POST', headers: { 'x-ingest-secret': INGEST_SECRET, 'content-type': 'application/json' }, body: JSON.stringify(o), json: false, returnFullResponse: true, ignoreHttpStatusErrors: true, timeout: 20000 });
    const b = typeof r.body === 'string' ? JSON.parse(r.body || '{}') : r.body;
    if (r.statusCode >= 300) falhas.push(o.source_ref + ' ' + r.statusCode + ' ' + JSON.stringify(b).slice(0, 160));
    else if (b && b.deduped) dedup++; else ok++;
  } catch (e) { falhas.push(o.source_ref + ' ' + e.message); }
}
let removidos_esgotado = 0;
if (res.esgotados.length) {
  try {
    const r = await helpers.httpRequest({ url: 'https://app.buscadorgeek.com.br/api/ingest/esgotado', method: 'POST', headers: { 'x-ingest-secret': INGEST_SECRET, 'content-type': 'application/json' }, body: JSON.stringify({ posts: res.esgotados }), json: true, timeout: 20000 });
    removidos_esgotado = (r && r.removidos) || 0;
  } catch (e) { falhas.push('esgotado ' + e.message); }
}
const { enviados, esgotados, ...resumo } = res;
return [{ json: { ...resumo, removidos_esgotado, candidatos: enviados.length, criados: ok, repetidos: dedup, falhas_ingest: falhas, itens: enviados.map((e) => '[' + e.kind + '] ' + e.source_channel + ' ' + e.platform + ' | ' + e.title) } }];
`;

const jsCode = `// GERADO por ofertas-beta/scripts/build_telegram_leitor.mjs — não editar aqui, editar o core e rodar o build.\n${sha256}\n${core}\n${main}`;

if (process.env.PRINT_CODE) { fs.writeFileSync(process.env.PRINT_CODE, jsCode); process.exit(0); }

const nodes = [
  // só 8h–20h BRT (decisão Bruno 02/Out: nada de madrugada)
  { parameters: { rule: { interval: [{ field: "cronExpression", expression: "*/5 8-19 * * *" }] } }, name: "A cada 5 min", type: "n8n-nodes-base.scheduleTrigger", typeVersion: 1.2, position: [0, 0] },
  { parameters: { jsCode }, name: "LER CANAIS + INGEST", type: "n8n-nodes-base.code", typeVersion: 2, position: [240, 0] },
];
const connections = { "A cada 5 min": { main: [[{ node: "LER CANAIS + INGEST", type: "main", index: 0 }]] } };
const body = { name: NAME, nodes, connections, settings: { executionOrder: "v1", timezone: "America/Sao_Paulo" } };

const list = await api("GET", "/workflows?limit=250");
const existing = (list.data || []).find((w) => w.name === NAME);
let id;
if (existing) {
  id = existing.id;
  await api("POST", `/workflows/${id}/deactivate`).catch(() => {});
  await api("PUT", `/workflows/${id}`, body);
} else {
  id = (await api("POST", "/workflows", body)).id;
}
if (process.argv.includes("--activate")) await api("POST", `/workflows/${id}/activate`);
console.log("workflow", id, existing ? "atualizado" : "criado", process.argv.includes("--activate") ? "(ativo)" : "(inativo)");
