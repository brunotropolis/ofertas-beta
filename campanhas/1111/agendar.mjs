// Agenda os avisos do aquecimento 11/11 (arte + texto + link) na fila do painel.
// Uso: node campanhas/1111/agendar.mjs [--dry]
// Cada aviso vira uma oferta (status queued, promo_meta.aviso) + item na fila com scheduled_at (BRT -> UTC).
// O dispatcher posta o texto do jeito que está, com a arte no card, no 1º tick depois do horário.
// Desfazer: delete from publication_queue where offer_id in (select id from offers where source_ref like 'aviso_1111_%');
//           delete from offers where source_ref like 'aviso_1111_%';
import fs from "node:fs";

const ENV = Object.fromEntries(fs.readFileSync("D:/CLAUDE/.env.meta", "utf8").split(/\r?\n/)
  .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^"|"$/g, "")]));
const K = ENV.SUPABASE_SERVICE_ROLE_OFERTAS_BETA;
const U = "https://qkherjtsvakmpkxebuwy.supabase.co/rest/v1";
const H = { apikey: K, Authorization: `Bearer ${K}`, "content-type": "application/json", Prefer: "return=representation" };
const DRY = process.argv.includes("--dry");
const cfg = JSON.parse(fs.readFileSync(new URL("./avisos.json", import.meta.url), "utf8"));
const PERFIL = { m: "8e8332fa-ebd8-41d5-948f-21bb6cd27a97", g: "f3887ae2-7b2c-462b-8984-e1e6618a0ba6" };
const CAMPANHA = { m: "c3fa658f-fb1d-4a65-a978-3576506e62a0", g: "c6600a9c-dae3-4cff-8924-3ae62e59a248" };
const LINK = { m: cfg.link_m, g: cfg.link_g };

let pos = 1000;
for (const a of cfg.avisos) {
  const quando = new Date(a.quando + ":00-03:00");
  if (quando.getTime() < Date.now()) { console.log("pulado (horário passou)", a.id, a.quando); continue; }
  const link = LINK[a.perfil];
  const oferta = {
    source: "manual", source_ref: `aviso_1111_${a.id}`, platform: null, kind: "produto", status: "queued",
    url: link, affiliate_url: link, title: a.titulo, image_url: `https://app.buscadorgeek.com.br/avisos/1111/${a.id}.jpg`,
    extra_text: a.texto.replace("{LINK}", link), perfil_id: PERFIL[a.perfil], source_channel: "aviso 11/11",
    expires_at: new Date(quando.getTime() + 24 * 3600_000).toISOString(),
    promo_meta: { aviso: { descricao: a.descricao, campanha: "aquecimento 11/11" } },
  };
  if (DRY) { console.log("dry", a.id, quando.toISOString(), oferta.extra_text.slice(0, 50)); continue; }
  const ja = await (await fetch(`${U}/offers?source_ref=eq.${oferta.source_ref}&select=id`, { headers: H })).json();
  if (ja.length) { console.log("já existe", a.id); continue; }
  const r = await fetch(`${U}/offers`, { method: "POST", headers: H, body: JSON.stringify(oferta) });
  const o = await r.json();
  if (!r.ok) { console.log("ERRO oferta", a.id, JSON.stringify(o).slice(0, 300)); continue; }
  const q = await fetch(`${U}/publication_queue`, { method: "POST", headers: H, body: JSON.stringify({
    offer_id: o[0].id, campaign_ids: [CAMPANHA[a.perfil]], position: pos++, scheduled_at: quando.toISOString(), status: "pending" }) });
  console.log(q.ok ? "agendado" : "ERRO fila", a.id, a.quando, q.ok ? "" : (await q.text()).slice(0, 200));
}
