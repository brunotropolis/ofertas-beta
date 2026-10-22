// Monta/atualiza o workflow n8n "OFERTAS | Alerta Saúde" — a cada 5 min, chama POST /api/cron/saude do painel
// e manda WhatsApp pro Bruno (via WHAPI, número 1658 — independente dos números que disparam) quando:
//   • um número de disparo fica VERMELHO (desconectado/fora do ar) — e quando volta;
//   • uma plataforma (coletor Amazon/Shopee/ML) fica VERMELHA — e quando volta;
//   • o disparo para (nenhum post há 1h dentro da janela) — e quando volta.
// Só avisa na MUDANÇA de estado (guarda o último estado no static data do workflow) — sem spam.
// rate-overlimit não passa por aqui: o próprio dispatcher já avisa na hora.
// Uso: node scripts/build_alerta_saude.mjs [--activate]
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

const NAME = "OFERTAS | Alerta Saúde";
const tick = await api("GET", "/workflows/vFkjMhuwYIe4ZnON");
let cronSecret = null;
for (const n of tick.nodes) for (const h of n.parameters?.headerParameters?.parameters || []) if (/secret/i.test(h.name)) cronSecret = h.value;
if (!cronSecret) throw new Error("CRON_SECRET não achado no Tick");
if (!env.WHAPI_TOKEN) throw new Error("WHAPI_TOKEN faltando no cofre");

const jsCode = `// GERADO por ofertas-beta/scripts/build_alerta_saude.mjs — editar lá e rodar o build.
const h = this.helpers;
const st = $getWorkflowStaticData('global');
st.estado = st.estado || {};
const r = await h.httpRequest({ url: 'https://ofertas-beta-painel.xktssy.easypanel.host/api/cron/saude', method: 'POST',
  headers: { 'x-cron-secret': ${JSON.stringify(cronSecret)} }, json: true, returnFullResponse: true, ignoreHttpStatusErrors: true, timeout: 90000 });

const linhas = [];
const muda = (chave, vermelho, txtCaiu, txtVoltou) => {
  const antes = st.estado[chave];
  if (vermelho && antes !== 'vermelho') linhas.push('🔴 ' + txtCaiu);
  if (!vermelho && antes === 'vermelho') linhas.push('🟢 ' + txtVoltou);
  st.estado[chave] = vermelho ? 'vermelho' : 'ok';
};

if (r.statusCode >= 300) {
  muda('painel', true, 'Painel do Ofertas não respondeu (' + r.statusCode + ') — disparos podem estar parados', 'Painel do Ofertas voltou a responder');
} else {
  muda('painel', false, '', 'Painel do Ofertas voltou a responder');
  for (const p of r.body.perfis || []) {
    for (const n of p.numeros || []) {
      const fim = (n.numero || '').slice(-4) || n.tag;
      muda('num:' + n.url, n.luz === 'vermelho', 'Número final ' + fim + ' (' + p.perfil + ') caiu: ' + n.motivo, 'Número final ' + fim + ' (' + p.perfil + ') voltou e está conectado');
      if (n.score != null && n.luz !== 'vermelho') muda('score:' + n.url, n.score < 60, 'Número final ' + fim + ': score caiu pra ' + n.score + ' (' + (n.score_motivos || []).join(', ') + ')', 'Número final ' + fim + ': score voltou pra ' + n.score);
    }
    for (const x of p.plataformas || []) {
      muda('plat:' + p.perfil + ':' + x.plataforma, x.luz === 'vermelho', x.nome + ' (' + p.perfil + '): ' + x.motivo, x.nome + ' (' + p.perfil + ') voltou a trazer ofertas');
    }
    // por campanha (20/Out): o agregado escondia a Maternas parada enquanto Fraldas/Cupons postavam
    for (const c of p.campanhas || []) {
      muda('camp:' + c.id, c.luz === 'vermelho', c.nome + ': ' + c.motivo, c.nome + ': voltou a postar');
    }
  }
}

let enviado = null;
if (linhas.length) {
  const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
  const body = '⚠️ *Alerta Ofertas* (' + hora + ')\\n\\n' + linhas.join('\\n') + '\\n\\nPainel: app.buscadorgeek.com.br/campanhas';
  const w = await h.httpRequest({ url: 'https://gate.whapi.cloud/messages/text', method: 'POST',
    headers: { Authorization: 'Bearer ' + ${JSON.stringify(env.WHAPI_TOKEN)}, 'content-type': 'application/json' },
    body: { to: '554184302127', body }, json: true, returnFullResponse: true, ignoreHttpStatusErrors: true, timeout: 30000 });
  enviado = w.statusCode;
}
return [{ json: { alertas: linhas, enviado, estado: st.estado } }];
`;

const nodes = [
  { parameters: { rule: { interval: [{ field: "cronExpression", expression: "*/5 * * * *" }] } }, name: "a cada 5 min", type: "n8n-nodes-base.scheduleTrigger", typeVersion: 1.2, position: [0, 0] },
  { parameters: { jsCode }, name: "CHECAR + AVISAR", type: "n8n-nodes-base.code", typeVersion: 2, position: [240, 0] },
];
const connections = { "a cada 5 min": { main: [[{ node: "CHECAR + AVISAR", type: "main", index: 0 }]] } };
if (process.env.PRINT_CODE) { fs.writeFileSync(process.env.PRINT_CODE, jsCode); process.exit(0); }
const body = { name: NAME, nodes, connections, settings: { executionOrder: "v1", timezone: "America/Sao_Paulo" } };

const list = await api("GET", "/workflows?limit=250");
const existing = (list.data || []).find((w) => w.name === NAME);
let id;
if (existing) { id = existing.id; await api("POST", `/workflows/${id}/deactivate`).catch(() => {}); await api("PUT", `/workflows/${id}`, body); }
else id = (await api("POST", "/workflows", body)).id;
if (process.argv.includes("--activate")) await api("POST", `/workflows/${id}/activate`);
console.log("workflow", id, existing ? "atualizado" : "criado", process.argv.includes("--activate") ? "(ativo)" : "(inativo)");
