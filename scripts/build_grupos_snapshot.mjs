// Monta/atualiza o workflow n8n "OFERTAS | Grupos Snapshot" — de hora em hora (8h-20h + 23h BRT)
// chama POST /api/cron/grupos do painel (x-cron-secret = o mesmo do Tick), que tira o retrato dos
// membros dos grupos e soma entradas/saídas do dia (card "Grupos" do Início).
// Uso: node scripts/build_grupos_snapshot.mjs [--activate]
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

const NAME = "OFERTAS | Grupos Snapshot";
const tick = await api("GET", "/workflows/vFkjMhuwYIe4ZnON");
let cronSecret = null;
for (const n of tick.nodes) for (const h of n.parameters?.headerParameters?.parameters || []) if (/secret/i.test(h.name)) cronSecret = h.value;
if (!cronSecret) throw new Error("CRON_SECRET não achado no Tick");

const jsCode = `// GERADO por ofertas-beta/scripts/build_grupos_snapshot.mjs — editar lá e rodar o build.
const r = await this.helpers.httpRequest({ url: 'https://ofertas-beta-painel.xktssy.easypanel.host/api/cron/grupos', method: 'POST',
  headers: { 'x-cron-secret': ${JSON.stringify(cronSecret)} }, json: true, returnFullResponse: true, ignoreHttpStatusErrors: true, timeout: 150000 });
if (r.statusCode >= 300) throw new Error('painel ' + r.statusCode + ' ' + JSON.stringify(r.body).slice(0, 300));
return [{ json: r.body }];
`;

const nodes = [
  { parameters: { rule: { interval: [{ field: "cronExpression", expression: "5 8-20,23 * * *" }] } }, name: "de hora em hora", type: "n8n-nodes-base.scheduleTrigger", typeVersion: 1.2, position: [0, 0] },
  { parameters: { jsCode }, name: "RETRATO DOS GRUPOS", type: "n8n-nodes-base.code", typeVersion: 2, position: [240, 0] },
];
const connections = { "de hora em hora": { main: [[{ node: "RETRATO DOS GRUPOS", type: "main", index: 0 }]] } };
const body = { name: NAME, nodes, connections, settings: { executionOrder: "v1", timezone: "America/Sao_Paulo" } };

const list = await api("GET", "/workflows?limit=250");
const existing = (list.data || []).find((w) => w.name === NAME);
let id;
if (existing) { id = existing.id; await api("POST", `/workflows/${id}/deactivate`).catch(() => {}); await api("PUT", `/workflows/${id}`, body); }
else id = (await api("POST", "/workflows", body)).id;
if (process.argv.includes("--activate")) await api("POST", `/workflows/${id}/activate`);
console.log("workflow", id, existing ? "atualizado" : "criado", process.argv.includes("--activate") ? "(ativo)" : "(inativo)");
