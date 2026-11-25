// 24/11 (Bruno: "programa os convites do ofertas maternas beleza e do lar, também nos grupos das ofertas maternas"):
// convites normais (depois da Black) no grupo geral das Maternas, seg 30/11 a sáb 12/12 (mesmo fim dos convites de Fraldas/Cupons),
// Lar 12h40 e Mãe 18h40, revezando as 5 artes de cada (artes/l1-5.jpg e m1-5.jpg, textos em textos.md).
// Uso: node agendar_normais.mjs [--dry]
// Desfazer: delete from publication_queue where offer_id in (select id from offers where source_ref like 'aviso_larmae_n_%' and status='queued');
//           delete from offers where source_ref like 'aviso_larmae_n_%' and status='queued';
import fs from "node:fs";
const ENV = Object.fromEntries(fs.readFileSync("D:/CLAUDE/.env.meta", "utf8").split(/\r?\n/)
  .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^"|"$/g, "")]));
const K = ENV.SUPABASE_SERVICE_ROLE_OFERTAS_BETA;
const BASE = "https://qkherjtsvakmpkxebuwy.supabase.co", U = `${BASE}/rest/v1`;
const H = { apikey: K, Authorization: `Bearer ${K}`, "content-type": "application/json", Prefer: "return=representation" };
const PERFIL = "8e8332fa-ebd8-41d5-948f-21bb6cd27a97", GERAL = "c3fa658f-fb1d-4a65-a978-3576506e62a0";
const DRY = process.argv.includes("--dry");
const DIR = new URL(".", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const LINK = { l: "https://asofertasmaternas.com.br/l/lar", m: "https://asofertasmaternas.com.br/l/mae" };
const HORA = { l: "12:40", m: "18:40" };
const T = {
  l: [
    ["Grupo só de oferta pra casa", "🏠 *TEM GRUPO SÓ DE OFERTA PRA CASA!*\n\nSabão, amaciante, limpeza e cozinha com os melhores preços, no nosso grupo *Ofertas Maternas para o Lar*. É de graça 💛\n\n👉 Entra aqui:\n{LINK}"],
    ["Sabão em pó mais barato", "🧺 *SABÃO EM PÓ MAIS BARATO*\n\nA gente avisa no grupo do Lar quando o preço cai, aí você faz o estoque pagando menos ✨\n\n👉 Entra aqui:\n{LINK}"],
    ["Cozinha em oferta", "🍳 *COZINHA EM OFERTA*\n\nPanela, potes e utilidades pagando menos, todo dia no grupo *Ofertas Maternas para o Lar* 🤍\n\n👉 Entra aqui:\n{LINK}"],
    ["Casa em dia sem pagar caro", "✨ *CASA EM DIA SEM PAGAR CARO*\n\nOfertas de casa selecionadas pra mãe, no nosso grupo do Lar. É de graça 💛\n\n👉 Entra aqui:\n{LINK}"],
    ["Mãe ajuda mãe: grupo do Lar", "🤱 *MÃE AJUDA MÃE*\n\nEntra no grupo *Ofertas Maternas para o Lar* e chama quem também cuida da casa. Só oferta boa 🥰\n\n👉 Link do grupo:\n{LINK}"],
  ],
  m: [
    ["Você também merece", "💄 *VOCÊ TAMBÉM MERECE*\n\nBeleza e autocuidado com preço bom, no nosso grupo *Ofertas Maternas para Mãe*. É de graça 💛\n\n👉 Entra aqui:\n{LINK}"],
    ["Cabelo em dia", "💇‍♀️ *CABELO EM DIA*\n\nKits de cabelo e cachos em oferta no grupo da Mãe ✨\n\n👉 Entra aqui:\n{LINK}"],
    ["Unhas lindas gastando pouco", "💅 *UNHAS LINDAS GASTANDO POUCO*\n\nEsmalte e maquiagem em oferta no grupo *Ofertas Maternas para Mãe* 🤍\n\n👉 Entra aqui:\n{LINK}"],
    ["Cuidar de você também", "🤍 *CUIDAR DE VOCÊ TAMBÉM*\n\nHidratante e óleo pra essa fase do pós-parto, com preço bom no grupo da Mãe 💛\n\n👉 Entra aqui:\n{LINK}"],
    ["Mãe ajuda mãe: grupo da Mãe", "🤱 *MÃE AJUDA MÃE*\n\nEntra no grupo *Ofertas Maternas para Mãe* e chama as amigas que também se cuidam 🥰\n\n👉 Link do grupo:\n{LINK}"],
  ],
};
// sobe as 10 artes uma vez
const subidas = {};
for (const g of ["l", "m"]) for (let i = 1; i <= 5; i++) {
  const arte = `${g}${i}`, caminho = `larmae/${arte}.jpg`;
  subidas[arte] = `${BASE}/storage/v1/object/public/avisos/${caminho}`;
  if (DRY) continue;
  const up = await fetch(`${BASE}/storage/v1/object/avisos/${caminho}`, { method: "POST",
    headers: { apikey: K, Authorization: `Bearer ${K}`, "content-type": "image/jpeg", "x-upsert": "true" }, body: fs.readFileSync(`${DIR}artes/${arte}.jpg`) });
  if (!up.ok) throw new Error("upload " + arte + " " + (await up.text()).slice(0, 200));
}
let pos = 2000, n = 0, d = 0;
for (let t = Date.parse("2026-11-30T12:00:00-03:00"); t <= Date.parse("2026-12-12T12:00:00-03:00"); t += 86400000, d++) {
  const dia = new Date(t - 3 * 3600e3).toISOString().slice(0, 10);
  for (const g of ["l", "m"]) {
    const i = d % 5, arte = `${g}${i + 1}`, [titulo, texto] = T[g][i];
    const quando = new Date(`${dia}T${HORA[g]}:00-03:00`), ref = `aviso_larmae_n_${arte}_${dia}`, link = LINK[g];
    if (DRY) { console.log("dry", ref, quando.toISOString(), titulo); n++; continue; }
    const ja = await (await fetch(`${U}/offers?source_ref=eq.${ref}&select=id`, { headers: H })).json();
    if (ja.length) { console.log("ja existe", ref); continue; }
    const oferta = { source: "manual", source_ref: ref, platform: null, kind: "produto", status: "queued", url: link, affiliate_url: link,
      title: titulo, image_url: subidas[arte], extra_text: texto.replace("{LINK}", link), perfil_id: PERFIL, source_channel: "aviso grupos",
      expires_at: new Date(quando.getTime() + 24 * 3600_000).toISOString(),
      promo_meta: { aviso: { descricao: g === "l" ? "convite grupo do Lar" : "convite grupo da Mãe", campanha: "grupos Lar e Mãe" } } };
    const r = await fetch(`${U}/offers`, { method: "POST", headers: H, body: JSON.stringify(oferta) });
    const o = await r.json(); if (!r.ok) { console.log("ERRO", ref, JSON.stringify(o).slice(0, 200)); continue; }
    const q = await fetch(`${U}/publication_queue`, { method: "POST", headers: H, body: JSON.stringify({ offer_id: o[0].id, campaign_ids: [GERAL], position: pos++, scheduled_at: quando.toISOString(), status: "pending" }) });
    if (q.ok) { n++; console.log("ok", ref, quando.toISOString()); } else console.log("ERRO fila", ref, (await q.text()).slice(0, 200));
  }
}
console.log(DRY ? "dry" : "agendados", n);
