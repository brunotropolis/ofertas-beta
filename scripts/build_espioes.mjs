// Monta/atualiza o workflow n8n "OFERTAS MATERNAS | Espiões (ladrão de lead)" (26/Out, pedido do Bruno).
// Ladrão de lead entra nos grupos, baixa a lista e sai adicionando as pessoas nos grupos dele (relato no grupo
// "Boas Práticas Amazon"). Dois alarmes, só avisam (não removem ninguém):
//  NÍVEL 1 — espiões: os 3 fakes do meteórico (fake1 Fernanda, fake2 Jaíne, fake3 Helena, WAHA geral) entram
//    DEVAGAR nos grupos do Ofertas Maternas (cada um 1/3 dos grupos, até 6 por dia, 9h–20h, horário sorteado).
//    A cada 15 min: fake adicionado num grupo que NÃO é nosso (dono não é número nosso) ou convite de grupo
//    no privado → WhatsApp pro Bruno com quem foi e em quais grupos nossos essa pessoa está.
//  NÍVEL 2 — a cada 3h: quem está em 5+ grupos nossos (fora nossos números e admins) → WhatsApp pro Bruno.
//    Base 26/Out: das 9.815 pessoas, só 5 estavam em 5+ grupos (4 = números nossos).
// Uso: node scripts/build_espioes.mjs [--activate]   ·   PRINT_CODE=pasta → grava os 2 códigos pra teste
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
const NAME = "OFERTAS MATERNAS | Espiões (ladrão de lead)";
const PERFIL = "8e8332fa-ebd8-41d5-948f-21bb6cd27a97"; // OFERTAS MATERNAS

// trecho comum aos 2 nós (números nossos, envio do alerta)
const comum = `
const h = this.helpers;
const WAHA_GERAL = ${JSON.stringify(env.WAHA_URL)}, KEY_GERAL = ${JSON.stringify(env.WAHA_API_KEY)};
const WAHA_OF = ${JSON.stringify(env.WAHA_OFERTAS_URL)}, KEY_OF = ${JSON.stringify(env.WAHA_OFERTAS_API_KEY)};
const WHAPI = ${JSON.stringify(env.WHAPI_TOKEN)};
const FAKES = { fake1: 'Fernanda', fake2: 'Jaíne', fake3: 'Helena' };
// números nossos (ofertas, fakes, Bruno, 1658, atendimento) — nunca são suspeitos
const NOSSOS = new Set(['554185052019','554184739476','554184477531','554184434952','554188611658','554184302127','5541984302127','554191412344','554187695142','5541936180713','5521936183013','5511936243586']);
const so = (x) => String(x || '').split('@')[0].replace(/\\D/g, '');
const fone = (p) => so(p && (p.phoneNumber || p.pn || (String(p.id || '').endsWith('@c.us') ? p.id : '')));
const nosso = (n) => NOSSOS.has(n) || NOSSOS.has(n.replace(/^(55\\d\\d)9(\\d{8})$/, '$1$2'));
const get = async (url, key) => { const r = await h.httpRequest({ url, headers: { 'X-Api-Key': key }, json: true, timeout: 120000 }); return Array.isArray(r) ? r : Object.values(r || {}); };
const avisar = async (texto) => h.httpRequest({ url: 'https://gate.whapi.cloud/messages/text', method: 'POST', headers: { Authorization: 'Bearer ' + WHAPI, 'content-type': 'application/json' }, body: { to: '554184302127', body: '🕵️ *Espiões Ofertas*\\n\\n' + texto }, json: true, ignoreHttpStatusErrors: true, timeout: 30000 });
const hora = new Date(Date.now() - 3 * 3600e3).getUTCHours();
const hoje = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const st = $getWorkflowStaticData('global');
// nossos grupos (vêm do nó anterior: campaign_groups do perfil, habilitados)
const nossos = new Map($input.all().flatMap((i) => (Array.isArray(i.json) ? i.json : [i.json])).filter((g) => g.group_jid).map((g) => [g.group_jid, g]));
const nomeCurto = (n) => String(n || '').replace(/^As Ofertas Maternas\\s*/i, '');
// em quais grupos nossos um número está (lista completa vista pelo nº 2019, que é admin em todos)
async function mapaMembros() {
  const grupos = await get(WAHA_OF + '/api/default/groups?limit=1000', KEY_OF);
  const m = new Map(), admins = new Set();
  for (const g of grupos) {
    const jid = typeof g.id === 'string' ? g.id : g.id && g.id._serialized;
    if (!nossos.has(jid)) continue;
    for (const p of g.participants || []) {
      const n = fone(p); if (!n) continue;
      if (p.admin || p.isAdmin || p.isSuperAdmin) admins.add(n);
      if (!m.has(n)) m.set(n, []);
      m.get(n).push(nomeCurto(nossos.get(jid).group_name));
    }
  }
  return { m, admins };
}
`;

const codigoNivel1 = `// GERADO por ofertas-beta/scripts/build_espioes.mjs — editar lá e rodar o build.
${comum}
st.n1 = st.n1 || { base: {}, alertados: {}, ultimoDm: {}, entradas: {} };
const s = st.n1;
const ordenados = [...nossos.values()].filter((g) => g.invite_code).sort((a, b) => a.group_jid.localeCompare(b.group_jid));
const nomes = Object.keys(FAKES);
const alertas = [], log = [];
let membros = null;
for (const [k, fake] of nomes.entries()) {
  let grupos;
  try { grupos = await get(WAHA_GERAL + '/api/' + fake + '/groups?limit=1000', KEY_GERAL); } catch (e) { log.push(fake + ': erro lendo grupos'); continue; }
  const dele = new Set(grupos.map((g) => (typeof g.id === 'string' ? g.id : g.id && g.id._serialized)));
  // 1) grupo estranho: não é nosso, dono não é número nosso, não estava lá na 1ª checagem
  const primeira = !s.base[fake];
  if (primeira) s.base[fake] = [];
  for (const g of grupos) {
    const jid = typeof g.id === 'string' ? g.id : g.id && g.id._serialized;
    if (nossos.has(jid) || s.base[fake].includes(jid) || s.alertados[jid]) continue;
    const dono = so(g.ownerPn || g.owner || g.subjectOwnerPn);
    if (primeira || nosso(dono) || /soninho|meteoric|dream baby|manual do rec/i.test(g.subject || '')) { s.base[fake].push(jid); continue; }
    s.alertados[jid] = Date.now();
    const admins = (g.participants || []).filter((p) => p.admin || p.isAdmin || p.isSuperAdmin).map(fone).filter((n) => n && !nosso(n));
    const suspeitos = [...new Set([dono, ...admins].filter((n) => n && !nosso(n)))];
    if (!membros) membros = (await mapaMembros()).m;
    const onde = suspeitos.map((n) => '+' + n + (membros.get(n) ? ' (está nos nossos: ' + membros.get(n).slice(0, 8).join(', ') + (membros.get(n).length > 8 ? '…' : '') + ')' : ' (não está em grupo nosso agora)')).join('\\n');
    alertas.push('🚨 A *' + FAKES[fake] + '* (espiã) foi colocada num grupo que NÃO é nosso: *' + (g.subject || jid) + '* (' + (g.size || (g.participants || []).length) + ' pessoas).\\nQuem manda nesse grupo:\\n' + (onde || '(não consegui ver)') + '\\n\\nProvável ladrão de lead: remover dos nossos grupos.');
  }
  // 2) convite de grupo no privado
  try {
    const chats = await get(WAHA_GERAL + '/api/' + fake + '/chats?limit=40', KEY_GERAL);
    const desde = s.ultimoDm[fake] || (Date.now() / 1000 - 900);
    for (const c of chats) {
      const cid = typeof c.id === 'string' ? c.id : c.id && c.id._serialized;
      if (!cid || !/@(c\\.us|s\\.whatsapp\\.net|lid)$/.test(cid)) continue;
      const ts = c.timestamp || (c.lastMessage && c.lastMessage.timestamp) || 0;
      if (ts <= desde) continue;
      const msgs = await get(WAHA_GERAL + '/api/' + fake + '/chats/' + encodeURIComponent(cid) + '/messages?limit=5&downloadMedia=false', KEY_GERAL);
      for (const m of msgs) {
        if (m.fromMe || (m.timestamp || 0) <= desde) continue;
        const bruto = JSON.stringify(m);
        if (!/chat\\.whatsapp\\.com\\/|groupInvite|convite.{0,30}grupo/i.test(bruto)) continue;
        const de = so(m.from || cid);
        if (nosso(de)) continue;
        if (!membros) membros = (await mapaMembros()).m;
        const onde = membros.get(de);
        alertas.push('🚨 A *' + FAKES[fake] + '* (espiã) recebeu CONVITE de grupo no privado de +' + de + (onde ? ' (está nos nossos: ' + onde.slice(0, 8).join(', ') + ')' : '') + ':\\n_' + String(m.body || '(convite)').slice(0, 160) + '_');
      }
    }
    s.ultimoDm[fake] = Math.floor(Date.now() / 1000);
  } catch (e) { log.push(fake + ': erro lendo privados'); }
  // 3) entrada devagar nos grupos que são dela (1/3 de cada), até 6 por dia, 9h–20h, 1 por vez, sorteado
  const minhas = ordenados.filter((g, i) => i % nomes.length === k);
  const falta = minhas.filter((g) => !dele.has(g.group_jid));
  const e = (s.entradas[fake] = s.entradas[fake] && s.entradas[fake].dia === hoje ? s.entradas[fake] : { dia: hoje, n: 0, erros: 0 });
  if (falta.length && hora >= 9 && hora < 20 && e.n < 6 && e.erros < 3 && Math.random() < 0.45) {
    const alvo = falta[Math.floor(Math.random() * Math.min(falta.length, 5))];
    try {
      await h.httpRequest({ url: WAHA_GERAL + '/api/' + fake + '/groups/join', method: 'POST', headers: { 'X-Api-Key': KEY_GERAL, 'content-type': 'application/json' }, body: { code: alvo.invite_code }, json: true, timeout: 60000 });
      e.n++; log.push(fake + ' entrou em ' + nomeCurto(alvo.group_name));
    } catch (er) { e.erros++; log.push(fake + ' falhou em ' + nomeCurto(alvo.group_name) + ': ' + String(er.message || er).slice(0, 80)); }
  }
  log.push(fake + ': ' + (minhas.length - falta.length) + '/' + minhas.length + ' grupos (hoje ' + e.n + ')');
}
for (const a of alertas) await avisar(a);
return [{ json: { alertas: alertas.length, log } }];
`;

const codigoNivel2 = `// GERADO por ofertas-beta/scripts/build_espioes.mjs — editar lá e rodar o build.
${comum}
st.n2 = st.n2 || { avisados: {} };
const { m, admins } = await mapaMembros();
const LIMITE = 6; // 5 pegava mãe engajada (Maternas + grupos de Cupons e Fraldas)
const novos = [];
for (const [n, gs] of m) {
  if (gs.length < LIMITE || nosso(n) || admins.has(n)) continue;
  const antes = st.n2.avisados[n] || 0;
  if (gs.length < antes + 3 && antes) continue; // já avisado; só repete se entrou em mais 3+
  st.n2.avisados[n] = gs.length;
  novos.push('+' + n + ' está em *' + gs.length + ' grupos* nossos: ' + gs.slice(0, 10).join(', ') + (gs.length > 10 ? '…' : ''));
}
if (novos.length) await avisar('👀 Gente em muitos grupos ao mesmo tempo (padrão de quem rouba lista de membros):\\n\\n' + novos.join('\\n') + '\\n\\nConfere o perfil antes de remover: pode ser mãe que entrou em vários sem querer.');
return [{ json: { pessoas: m.size, em5mais: [...m.values()].filter((g) => g.length >= LIMITE).length, avisados: novos.length } }];
`;

if (process.env.PRINT_CODE) {
  fs.writeFileSync(process.env.PRINT_CODE + "/espioes_n1.js", codigoNivel1);
  fs.writeFileSync(process.env.PRINT_CODE + "/espioes_n2.js", codigoNivel2);
  process.exit(0);
}

// lê os grupos do perfil pela credencial n8n do service_role (oQmJEeSBPZv4UlkE) — a chave não fica no workflow
const lerGrupos = (nome, y) => ({
  parameters: {
    url: `https://qkherjtsvakmpkxebuwy.supabase.co/rest/v1/campaign_groups?select=group_jid,group_name,invite_code,campaigns!inner(perfil_id)&campaigns.perfil_id=eq.${PERFIL}&is_enabled=eq.true`,
    authentication: "genericCredentialType", genericAuthType: "httpHeaderAuth",
    sendHeaders: true, headerParameters: { parameters: [{ name: "apikey", value: env.SUPABASE_ANON_KEY_OFERTAS_BETA }] },
    options: {},
  },
  name: nome, type: "n8n-nodes-base.httpRequest", typeVersion: 4.2, position: [240, y],
  credentials: { httpHeaderAuth: { id: "oQmJEeSBPZv4UlkE", name: "Supabase service_role (fraldas)" } },
});
const nodes = [
  { parameters: { rule: { interval: [{ field: "cronExpression", expression: "*/15 8-21 * * *" }] } }, name: "a cada 15 min", type: "n8n-nodes-base.scheduleTrigger", typeVersion: 1.2, position: [0, 0] },
  lerGrupos("GRUPOS (n1)", 0),
  { parameters: { jsCode: codigoNivel1 }, name: "NÍVEL 1: ESPIÕES", type: "n8n-nodes-base.code", typeVersion: 2, position: [480, 0] },
  { parameters: { rule: { interval: [{ field: "cronExpression", expression: "5 8-22/3 * * *" }] } }, name: "a cada 3h", type: "n8n-nodes-base.scheduleTrigger", typeVersion: 1.2, position: [0, 220] },
  lerGrupos("GRUPOS (n2)", 220),
  { parameters: { jsCode: codigoNivel2 }, name: "NÍVEL 2: EM MUITOS GRUPOS", type: "n8n-nodes-base.code", typeVersion: 2, position: [480, 220] },
];
const connections = {
  "a cada 15 min": { main: [[{ node: "GRUPOS (n1)", type: "main", index: 0 }]] },
  "GRUPOS (n1)": { main: [[{ node: "NÍVEL 1: ESPIÕES", type: "main", index: 0 }]] },
  "a cada 3h": { main: [[{ node: "GRUPOS (n2)", type: "main", index: 0 }]] },
  "GRUPOS (n2)": { main: [[{ node: "NÍVEL 2: EM MUITOS GRUPOS", type: "main", index: 0 }]] },
};
const body = { name: NAME, nodes, connections, settings: { executionOrder: "v1", timezone: "America/Sao_Paulo" } };
const list = await api("GET", "/workflows?limit=250");
const existing = (list.data || []).find((w) => w.name === NAME);
let id;
if (existing) { id = existing.id; await api("POST", `/workflows/${id}/deactivate`).catch(() => {}); await api("PUT", `/workflows/${id}`, body); }
else id = (await api("POST", "/workflows", body)).id;
if (process.argv.includes("--activate")) await api("POST", `/workflows/${id}/activate`);
console.log("workflow", id, existing ? "atualizado" : "criado", process.argv.includes("--activate") ? "(ativo)" : "(inativo)");
