// 11/11 (data especial, Bruno: "das 6 da manhã até meia-noite"): soma regras de horário SÓ do dia 11/11 nos robôs
// e solta a trava 8h–20h dos coletores só nesse dia. No dia 12 tudo volta sozinho (as regras citam "11 11").
// Backup dos workflows em backups/1111/. Desfazer: node scripts/abrir_1111.mjs --desfazer
import fs from "node:fs";
const ENV = Object.fromEntries(fs.readFileSync("D:/CLAUDE/.env.meta", "utf8").split(/\r?\n/).map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^"|"$/g, "")]));
const B = ENV.N8N_BASE_URL, H = { "X-N8N-API-KEY": ENV.N8N_API_KEY, "content-type": "application/json" };
const DESFAZER = process.argv.includes("--desfazer");
const EXTRA = {
  vFkjMhuwYIe4ZnON: ["* 6-7,20-23 11 11 *"],                 // Cron Tick (dispatcher)
  TovhEgaMOgRW2ng2: ["*/5 6-7,20-23 11 11 *"],               // Auto-Enqueue
  exaVk84tksQYCJmI: ["*/2 5-6,20-23 11 11 *"],               // Telegram Leitor (base 7-19)
  pCqEhy3PXX6jPyVg: ["*/5 6-7,20-23 11 11 *", "5-59/10 8-19 11 11 *"], // WhatsApp Leitor: a cada 5 min no dia
  hP2rpjpMyPWOlu1C: ["*/10 6-7,20-23 11 11 *"],              // Amazon Auto
  spdOQNLpjiLYiL4n: ["*/10 6-7,20-23 11 11 *"],              // Shopee Auto
  xoNfh9TnHtjlOdC0: ["*/10 6-7,20-23 11 11 *"],              // ML Auto
  sizkFtcP9JBTcNGo: ["*/30 6-7,20-23 11 11 *"],              // Amazon Refresh (confere preço das exclusivas)
};
const GATE_OLD = "return [{ json: { hora_num: br.getHours(), agora_br: br.toLocaleString('pt-BR') } }];";
const GATE_NEW = "const dia1111 = br.getMonth() === 10 && br.getDate() === 11 && br.getHours() >= 6; // 11/11: 6h à meia-noite\nreturn [{ json: { hora_num: dia1111 ? 12 : br.getHours(), agora_br: br.toLocaleString('pt-BR') } }];";
const LIMPA = ["versionId","tags","shared","id","createdAt","updatedAt","active","isArchived","staticData","meta","pinData","versionCounter","triggerCount","description"];
for (const [id, extras] of Object.entries(EXTRA)) {
  const w = await (await fetch(`${B}/api/v1/workflows/${id}`, { headers: H })).json();
  if (!DESFAZER) fs.writeFileSync(`backups/1111/${id}.json`, JSON.stringify(w, null, 1));
  for (const n of w.nodes) {
    delete n.onError;
    if (/schedule/i.test(n.type) && n.parameters?.rule?.interval) {
      const iv = n.parameters.rule.interval.filter((r) => !/ 11 11 \*$/.test(r.expression || ""));
      if (!DESFAZER) for (const e of extras) iv.push({ field: "cronExpression", expression: e });
      n.parameters.rule.interval = iv;
    }
    if (n.name === "AGORA BR" && n.parameters?.jsCode) {
      n.parameters.jsCode = DESFAZER ? n.parameters.jsCode.replace(GATE_NEW, GATE_OLD) : n.parameters.jsCode.replace(GATE_OLD, GATE_NEW);
    }
  }
  const settings = { ...(w.settings || {}) }; delete settings.availableInMCP;
  const body = { name: w.name, nodes: w.nodes, connections: w.connections, settings };
  await fetch(`${B}/api/v1/workflows/${id}/deactivate`, { method: "POST", headers: H });
  const r = await fetch(`${B}/api/v1/workflows/${id}`, { method: "PUT", headers: H, body: JSON.stringify(body) });
  const a = await fetch(`${B}/api/v1/workflows/${id}/activate`, { method: "POST", headers: H });
  const j = await r.json().catch(() => ({}));
  const regras = (j.nodes || []).filter((n) => /schedule/i.test(n.type)).flatMap((n) => n.parameters.rule.interval.map((x) => x.expression));
  const gate = (j.nodes || []).find((n) => n.name === "AGORA BR")?.parameters?.jsCode?.includes("dia1111");
  console.log(r.ok && a.ok ? "ok" : `ERRO ${r.status}/${a.status}`, id, w.name, "|", regras.join(" + "), gate === undefined ? "" : `| trava 11/11 ${gate ? "solta" : "normal"}`);
}
