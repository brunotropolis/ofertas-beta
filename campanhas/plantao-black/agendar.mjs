// 26/11 (Bruno: "disparar alguns avisos hoje nos grupos falando que amanhã vamos fazer plantão da black").
// 3 avisos com arte (artes/p1-p3.jpg, molde do 11.11) nos grupos Maternas, Fraldas, Cupons, Enxoval, Lar e Mãe.
// Uso: node agendar.mjs [--dry] [HH:MM HH:MM HH:MM]   (padrão 21:00 22:15 23:30, dia de hoje BRT)
// Desfazer: delete from publication_queue where offer_id in (select id from offers where source_ref like 'aviso_plantao_%' and status='queued');
//           delete from offers where source_ref like 'aviso_plantao_%' and status='queued';
import fs from "node:fs";
const ENV = Object.fromEntries(fs.readFileSync("D:/CLAUDE/.env.meta", "utf8").split(/\r?\n/)
  .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]));
const K = ENV.SUPABASE_SERVICE_ROLE_OFERTAS_BETA;
const BASE = "https://qkherjtsvakmpkxebuwy.supabase.co";
const U = `${BASE}/rest/v1`;
const H = { apikey: K, Authorization: `Bearer ${K}`, "content-type": "application/json", Prefer: "return=representation" };
const PERFIL = "8e8332fa-ebd8-41d5-948f-21bb6cd27a97";
const NOMES = ["OFERTAS MATERNAS", "OFERTAS FRALDAS", "OFERTAS CUPONS", "ENXOVAL DESCOMPLICADO", "OFERTAS LAR", "OFERTAS MÃE"];
const DRY = process.argv.includes("--dry");
const horas = process.argv.slice(2).filter((a) => /^\d{1,2}:\d{2}$/.test(a));
const HORAS = horas.length === 3 ? horas : ["21:00", "22:15", "23:30"];
const DIR = new URL(".", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const LINK = "https://asofertasmaternas.com.br";
const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const P = [
  ["p1", "Amanhã tem plantão da Black", "📣 *ANOTA AÍ: AMANHÃ TEM PLANTÃO DA BLACK!*\n\nNossa equipe vai ficar de plantão das *6h da manhã à meia-noite*, trazendo as melhores ofertas e cupons da Black Friday aqui no grupo 💛\n\nNão silencia o grupo pra não perder nada!"],
  ["p2", "É amanhã: Black Friday", "⏰ *É AMANHÃ: BLACK FRIDAY!*\n\nA partir das 6h a gente começa a soltar as ofertas de Black aqui no grupo. Tem oferta que acaba em minutos, então fica de olho 👀"],
  ["p3", "Plantão começa às 6h", "🚨 *ÚLTIMA CHAMADA: O PLANTÃO COMEÇA ÀS 6H!*\n\nAtiva as notificações do grupo e deixa o celular por perto. Amanhã é dia de economizar 🤱💛"],
];
const camps = await (await fetch(`${U}/campaigns?select=id,name&is_active=eq.true`, { headers: H })).json();
const ids = NOMES.map((n) => camps.find((c) => c.name === n)?.id).filter(Boolean);
if (ids.length !== NOMES.length) { console.log("campanha faltando", NOMES.filter((n) => !camps.find((c) => c.name === n))); process.exit(1); }
let pos = 1000, n = 0;
for (const [i, [arte, titulo, texto]] of P.entries()) {
  const quando = new Date(`${hoje}T${HORAS[i].padStart(5, "0")}:00-03:00`);
  const ref = `aviso_plantao_${arte}_${hoje}`;
  const caminho = `plantao/${arte}.jpg`;
  const image_url = `${BASE}/storage/v1/object/public/avisos/${caminho}`;
  if (DRY) { console.log("dry", ref, quando.toISOString(), ids.length, "campanhas"); n++; continue; }
  const up = await fetch(`${BASE}/storage/v1/object/avisos/${caminho}`, { method: "POST",
    headers: { apikey: K, Authorization: `Bearer ${K}`, "content-type": "image/jpeg", "x-upsert": "true" },
    body: fs.readFileSync(`${DIR}artes/${arte}.jpg`) });
  if (!up.ok) { console.log("ERRO upload", arte, (await up.text()).slice(0, 200)); continue; }
  const ja = await (await fetch(`${U}/offers?source_ref=eq.${ref}&select=id`, { headers: H })).json();
  if (ja.length) { console.log("ja existe", ref); continue; }
  const oferta = { source: "manual", source_ref: ref, platform: null, kind: "produto", status: "queued", url: LINK, affiliate_url: LINK,
    // WAHA recusa o card quando o texto não tem o link do preview (26/11: os avisos travaram a fila por isso)
    title: titulo, image_url, extra_text: `${texto}\n\n👉 ${LINK}`, perfil_id: PERFIL, source_channel: "aviso grupos",
    expires_at: new Date(quando.getTime() + 12 * 3600_000).toISOString(),
    promo_meta: { aviso: { descricao: "plantão da Black amanhã, 6h à meia-noite", campanha: "plantão Black" } } };
  const r = await fetch(`${U}/offers`, { method: "POST", headers: H, body: JSON.stringify(oferta) });
  const o = await r.json(); if (!r.ok) { console.log("ERRO", ref, JSON.stringify(o).slice(0, 200)); continue; }
  const q = await fetch(`${U}/publication_queue`, { method: "POST", headers: H, body: JSON.stringify({ offer_id: o[0].id, campaign_ids: ids, position: pos++, scheduled_at: quando.toISOString(), status: "pending" }) });
  if (q.ok) { n++; console.log("ok", ref, quando.toISOString()); } else console.log("ERRO fila", ref, (await q.text()).slice(0, 200));
}
console.log(DRY ? "dry" : "agendados", n);
