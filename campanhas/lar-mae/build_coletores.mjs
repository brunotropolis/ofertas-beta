// 24/11: coletores automáticos Shopee e Amazon pros perfis ofertas-lar e ofertas-mae (Bruno: 40 ofertas/dia em cada grupo).
// Copia os coletores do Maternas (spdOQNLpjiLYiL4n Shopee, hP2rpjpMyPWOlu1C Amazon), alterna o perfil a cada rodada
// (minuto par = lar, ímpar = mãe) e lê as palavras do perfil no painel. A cada 15 min, 8h-19h.
// Uso: node campanhas/lar-mae/build_coletores.mjs   (recria se já existir com o mesmo nome)
// Desfazer: desativar/apagar os 2 workflows "OFERTAS LAR+MÃE | ..." no n8n.
import fs from "node:fs";
const E = Object.fromEntries(fs.readFileSync("D:/CLAUDE/.env.meta", "utf8").split(/\r?\n/).map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^"|"$/g, "")]));
const B = E.N8N_BASE_URL.replace(/\/$/, ""), h = { "X-N8N-API-KEY": E.N8N_API_KEY, "content-type": "application/json" };
const ORIG = { "Shopee Auto": "spdOQNLpjiLYiL4n", "Amazon Auto": "hP2rpjpMyPWOlu1C", "ML Auto": "xoNfh9TnHtjlOdC0" };
// 24/11 (Bruno: "o mercado livre tem que funcionar nesses grupos"): ML por subcategoria de ofertas, igual ao Maternas
const CATS_ML = {
  "ofertas-lar": [["MLB1613","Banheiros"],["MLB438928","Camas e Colchões"],["MLB1618","Cozinha"],["MLB264051","Cuidado da Casa e Lavanderia"],["MLB436414","Organização para Casa"],["MLB436246","Têxteis de Casa"],["MLB438284","Pequenos Eletrodomésticos"]],
  "ofertas-mae": [["MLB199407","Cuidados com a Pele"],["MLB1263","Cuidados com o Cabelo"],["MLB1248","Maquiagem"],["MLB29884","Manicure e Pedicure"],["MLB6284","Perfumes"],["MLB278194","Tratamentos de Beleza"],["MLB198312","Higiene Pessoal"],["MLB455174","Artefatos para Cabelo"],["MLB439347","Eletro de Cuidado Pessoal"]],
};
const lista = (await (await fetch(B + "/api/v1/workflows?limit=250", { headers: h })).json()).data;
for (const [nome, id] of Object.entries(ORIG)) {
  const w = await (await fetch(`${B}/api/v1/workflows/${id}`, { headers: h })).json();
  const novoNome = `OFERTAS LAR+MÃE | ${nome}`;
  for (const n of w.nodes) {
    const p = n.parameters || {};
    if (n.type.endsWith("scheduleTrigger")) p.rule = { interval: [{ field: "cronExpression", expression: "*/15 8-19 * * *" }] };
    if (n.name === "KEYWORDS MATERNAS") {
      p.jsCode = p.jsCode
        .replace("// Lê as palavras-chave", "// 24/11: alterna o perfil (minuto par = lar, ímpar = mãe).\nconst PERFIL = (Math.floor(Date.now() / 900000) % 2) ? 'ofertas-mae' : 'ofertas-lar';\n// Lê as palavras-chave")
        .replace("slug=ofertas-maternas\"", "slug=\" + PERFIL")
        .replace(/if \(!KW\.length\) KW = \[[^\]]*\];/, "if (!KW.length) return [];")
        .replace("return [{ json: { keyword: k, row_number: 1 } }];", "return [{ json: { keyword: k, row_number: 1, perfil: PERFIL } }];");
      if (!p.jsCode.includes("PERFIL }")) throw new Error("troca do KEYWORDS falhou em " + nome);
    }
    if (n.name === "CATEGORIA MATERNAS") {
      p.jsCode = [
        "// 24/11: alterna o perfil (a cada 15 min) e sorteia a subcategoria de ofertas do ML dele",
        "const PERFIL = (Math.floor(Date.now() / 900000) % 2) ? 'ofertas-mae' : 'ofertas-lar';",
        "const CATS = " + JSON.stringify(CATS_ML) + "[PERFIL];",
        "const [id, label] = CATS[Math.floor(Math.random() * CATS.length)];",
        "return [{ json: { category: id, label, keyword: label, perfil: PERFIL } }];",
      ].join("\n");
    }
    if (n.name === "MAPEAR INGEST MATERNAS") {
      const origem = w.nodes.some((x) => x.name === "CATEGORIA MATERNAS") ? "CATEGORIA MATERNAS" : "KEYWORDS MATERNAS";
      p.jsCode = p.jsCode.replace("perfil:'ofertas-maternas'", "perfil:$('" + origem + "').first().json.perfil");
      if (!p.jsCode.includes("first().json.perfil")) throw new Error("troca do MAPEAR falhou em " + nome);
    }
    delete n.onError;
  }
  const settings = { executionOrder: "v1", timezone: "America/Sao_Paulo", callerPolicy: "workflowsFromSameOwner" };
  const velho = lista.find((x) => x.name === novoNome);
  if (velho) { await fetch(`${B}/api/v1/workflows/${velho.id}/deactivate`, { method: "POST", headers: h }); await fetch(`${B}/api/v1/workflows/${velho.id}`, { method: "DELETE", headers: h }); }
  const r = await fetch(`${B}/api/v1/workflows`, { method: "POST", headers: h, body: JSON.stringify({ name: novoNome, nodes: w.nodes, connections: w.connections, settings }) });
  const nw = await r.json(); if (!r.ok) { console.log("ERRO", nome, JSON.stringify(nw).slice(0, 300)); continue; }
  const a = await fetch(`${B}/api/v1/workflows/${nw.id}/activate`, { method: "POST", headers: h });
  console.log(novoNome, nw.id, "ativo:", a.status);
}
