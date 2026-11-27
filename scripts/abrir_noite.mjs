// 26/11 (Bruno: "quero que poste até mais tarde hoje e amanhã e nos dias normais também"): os robôs do n8n que
// acionam o painel rodavam só 8h-20h (por isso nada saiu depois das 20h em 26/11, nem os avisos das 21h).
// Agora: Tick e Auto-Enqueue 0h-1h59 e 6h-23h59 todo dia (quem decide a janela de cada campanha é o painel,
// lib/plantao.ts + campaigns.auto_window_*); coletores Amazon/Shopee/ML e Amazon Refresh 6h-22h59.
// Tira as regras antigas do 11/11. Backup em backups/noite-2611/. Desfazer: node scripts/abrir_noite.mjs --desfazer
import fs from "node:fs";
const ENV = Object.fromEntries(fs.readFileSync("D:/CLAUDE/.env.meta", "utf8").split(/\r?\n/).map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]));
const B = ENV.N8N_BASE_URL, H = { "X-N8N-API-KEY": ENV.N8N_API_KEY, "content-type": "application/json" };
const DESFAZER = process.argv.includes("--desfazer");
const NOVO = {
  vFkjMhuwYIe4ZnON: ["* 0-1,6-23 * * *"],     // Cron Tick (dispatcher)
  TovhEgaMOgRW2ng2: ["*/5 0-1,6-23 * * *"],   // Auto-Enqueue
  hP2rpjpMyPWOlu1C: ["*/10 6-22 * * *"],      // Amazon Auto
  spdOQNLpjiLYiL4n: ["*/10 6-22 * * *"],      // Shopee Auto
  xoNfh9TnHtjlOdC0: ["*/10 6-22 * * *"],      // ML Auto
  sizkFtcP9JBTcNGo: ["*/30 6-22 * * *"],      // Amazon Refresh
};
const GATE_1111 = "const dia1111 = br.getMonth() === 10 && br.getDate() === 11 && br.getHours() >= 6; // 11/11: 6h à meia-noite\nreturn [{ json: { hora_num: dia1111 ? 12 : br.getHours(), agora_br: br.toLocaleString('pt-BR') } }];";
const GATE_NOITE = "const noite = br.getHours() >= 6 && br.getHours() < 23; // 26/11: coletores 6h-23h (a trava abaixo era 8h-20h)\nreturn [{ json: { hora_num: noite ? 12 : br.getHours(), agora_br: br.toLocaleString('pt-BR') } }];";
const LIMPA = ["versionId","tags","shared","id","createdAt","updatedAt","active","isArchived","staticData","meta","pinData","versionCounter","triggerCount","description"];
for (const [id, regras] of Object.entries(NOVO)) {
  let w;
  if (DESFAZER) w = JSON.parse(fs.readFileSync(`backups/noite-2611/${id}.json`, "utf8"));
  else {
    w = await (await fetch(`${B}/api/v1/workflows/${id}`, { headers: H })).json();
    if (!fs.existsSync(`backups/noite-2611/${id}.json`)) fs.writeFileSync(`backups/noite-2611/${id}.json`, JSON.stringify(w, null, 1));
    for (const n of w.nodes) {
      if (/schedule/i.test(n.type) && n.parameters?.rule?.interval) n.parameters.rule.interval = regras.map((e) => ({ field: "cronExpression", expression: e }));
      if (n.name === "AGORA BR" && n.parameters?.jsCode) n.parameters.jsCode = n.parameters.jsCode.replace(GATE_1111, GATE_NOITE);
    }
  }
  for (const n of w.nodes) delete n.onError;
  const settings = { ...(w.settings || {}) }; delete settings.availableInMCP;
  const body = { name: w.name, nodes: w.nodes, connections: w.connections, settings };
  await fetch(`${B}/api/v1/workflows/${id}/deactivate`, { method: "POST", headers: H });
  const r = await fetch(`${B}/api/v1/workflows/${id}`, { method: "PUT", headers: H, body: JSON.stringify(body) });
  const a = await fetch(`${B}/api/v1/workflows/${id}/activate`, { method: "POST", headers: H });
  const j = await r.json().catch(() => ({}));
  const rr = (j.nodes || []).filter((n) => /schedule/i.test(n.type)).flatMap((n) => n.parameters.rule.interval.map((x) => x.expression));
  const gate = (j.nodes || []).find((n) => n.name === "AGORA BR")?.parameters?.jsCode;
  console.log(r.ok && a.ok ? "ok" : `ERRO ${r.status}/${a.status}`, id, w.name, "|", rr.join(" + "), gate === undefined ? "" : `| trava ${gate.includes("noite") ? "6h-23h" : gate.includes("dia1111") ? "11/11" : "?"}`);
}
