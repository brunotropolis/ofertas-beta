// 24/11 (Bruno: "ficou ótimo, programa para mim"): convites Black dos grupos Lar e Mãe no grupo geral das Maternas,
// qua 25 a sex 27/11, Lar 12h40 e Mãe 18h40. Artes artes/xl1-3.jpg e xm1-3.jpg sobem pro bucket público `avisos`.
// Uso: node campanhas/lar-mae/agendar_black.mjs [--dry]
// Desfazer: delete from publication_queue where offer_id in (select id from offers where source_ref like 'aviso_larmae_%' and status='queued');
//           delete from offers where source_ref like 'aviso_larmae_%' and status='queued';
import fs from "node:fs";
const ENV = Object.fromEntries(fs.readFileSync("D:/CLAUDE/.env.meta", "utf8").split(/\r?\n/)
  .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^"|"$/g, "")]));
const K = ENV.SUPABASE_SERVICE_ROLE_OFERTAS_BETA;
const BASE = "https://qkherjtsvakmpkxebuwy.supabase.co";
const U = `${BASE}/rest/v1`;
const H = { apikey: K, Authorization: `Bearer ${K}`, "content-type": "application/json", Prefer: "return=representation" };
const PERFIL = "8e8332fa-ebd8-41d5-948f-21bb6cd27a97", GERAL = "c3fa658f-fb1d-4a65-a978-3576506e62a0";
const DRY = process.argv.includes("--dry");
const DIR = new URL(".", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const LINK = { l: "https://asofertasmaternas.com.br/l/lar", m: "https://asofertasmaternas.com.br/l/mae" };
const HORA = { l: "12:40", m: "18:40" };
const P = [
  ["2026-11-25", "l", "xl1", "Grupo novo: Ofertas Maternas para o Lar", "🏠 *GRUPO NOVO: OFERTAS MATERNAS PARA O LAR!*\n\nAté a Black a gente vai trazer as melhores ofertas de sabão, amaciante, limpeza e cozinha. Coisa de casa que você compra todo mês, pagando menos 💛\n\n👉 Entra aqui, é de graça:\n{LINK}"],
  ["2026-11-25", "m", "xm1", "Grupo novo: Ofertas Maternas para Mãe", "💄 *GRUPO NOVO: OFERTAS MATERNAS PARA MÃE!*\n\nAté a Black a gente vai trazer as melhores ofertas de beleza, cabelo, unhas e autocuidado. Porque mãe também merece um mimo 🥰\n\n👉 Entra aqui, é de graça:\n{LINK}"],
  ["2026-11-26", "l", "xl2", "Sabão e amaciante com preço de Black", "🧺 *SABÃO E AMACIANTE COM PREÇO DE BLACK*\n\nNo nosso grupo novo *Ofertas Maternas para o Lar* vão chegar as ofertas de Black de lavanderia, limpeza e cozinha. Aproveita pra fazer o estoque do mês ✨\n\n👉 Entra aqui:\n{LINK}"],
  ["2026-11-26", "m", "xm2", "Maquiagem e esmalte com preço de Black", "✨ *MAQUIAGEM E ESMALTE COM PREÇO DE BLACK*\n\nBeleza, cabelo e unhas em oferta no nosso grupo novo *Ofertas Maternas para Mãe*. Só coisa boa pra você 💛\n\n👉 Entra aqui:\n{LINK}"],
  ["2026-11-27", "l", "xl3", "É hoje: Black da casa", "🚨 *É HOJE: BLACK DA CASA!*\n\nAs melhores ofertas de Black pra casa estão saindo no grupo *Ofertas Maternas para o Lar*. Entra agora pra não perder 🏠\n\n👉 {LINK}"],
  ["2026-11-27", "m", "xm3", "É hoje: Black da mãe", "🚨 *É HOJE: BLACK DA MÃE!*\n\nBeleza, cabelo e unhas com preço de Black no grupo *Ofertas Maternas para Mãe*. Corre que acaba 💄\n\n👉 {LINK}"],
];
let pos = 1000, n = 0;
for (const [dia, g, arte, titulo, texto] of P) {
  const quando = new Date(`${dia}T${HORA[g]}:00-03:00`);
  const ref = `aviso_larmae_${arte}_${dia}`;
  const caminho = `larmae/${arte}.jpg`;
  const image_url = `${BASE}/storage/v1/object/public/avisos/${caminho}`;
  const link = LINK[g];
  if (DRY) { console.log("dry", ref, quando.toISOString(), image_url); n++; continue; }
  const up = await fetch(`${BASE}/storage/v1/object/avisos/${caminho}`, { method: "POST",
    headers: { apikey: K, Authorization: `Bearer ${K}`, "content-type": "image/jpeg", "x-upsert": "true" },
    body: fs.readFileSync(`${DIR}artes/${arte}.jpg`) });
  if (!up.ok) { console.log("ERRO upload", arte, (await up.text()).slice(0, 200)); continue; }
  const ja = await (await fetch(`${U}/offers?source_ref=eq.${ref}&select=id`, { headers: H })).json();
  if (ja.length) { console.log("ja existe", ref); continue; }
  const oferta = { source: "manual", source_ref: ref, platform: null, kind: "produto", status: "queued", url: link, affiliate_url: link,
    title: titulo, image_url, extra_text: texto.replace("{LINK}", link), perfil_id: PERFIL, source_channel: "aviso grupos",
    expires_at: new Date(quando.getTime() + 24 * 3600_000).toISOString(),
    promo_meta: { aviso: { descricao: g === "l" ? "convite grupo do Lar (Black)" : "convite grupo da Mãe (Black)", campanha: "grupos Lar e Mãe" } } };
  const r = await fetch(`${U}/offers`, { method: "POST", headers: H, body: JSON.stringify(oferta) });
  const o = await r.json(); if (!r.ok) { console.log("ERRO", ref, JSON.stringify(o).slice(0, 200)); continue; }
  const q = await fetch(`${U}/publication_queue`, { method: "POST", headers: H, body: JSON.stringify({ offer_id: o[0].id, campaign_ids: [GERAL], position: pos++, scheduled_at: quando.toISOString(), status: "pending" }) });
  if (q.ok) { n++; console.log("ok", ref, quando.toISOString()); } else console.log("ERRO fila", ref, (await q.text()).slice(0, 200));
}
console.log(DRY ? "dry" : "agendados", n);
