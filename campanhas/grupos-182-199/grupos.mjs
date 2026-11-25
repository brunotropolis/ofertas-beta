// 25/11 (repasse da Central de Chips / sessão METEÓRICO, aprovado pelo Bruno e pela Day): 17 grupos antigos do meteórico
// viram "As Ofertas Maternas #182 a #198" (17; o Clube #3 120363413568828035 fica fora, correção da Central) e entram na campanha OFERTAS MATERNAS (c3fa658f) a partir de qui 26/11 9h.
// Números fixos: alternando 2019 (waha-ofertas) e 9476 (waha-ofertas-2), que entram nos grupos hoje 21h e viram admin.
// Uso: node grupos.mjs criar   (insere desligados)   |   node grupos.mjs ligar   (liga; agendado no Windows 26/11 9h)
// Desfazer: node grupos.mjs desligar
import fs from "node:fs";
const E = Object.fromEntries(fs.readFileSync("D:/CLAUDE/.env.meta", "utf8").split(/\r?\n/).map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^"|"$/g, "")]));
const K = E.SUPABASE_SERVICE_ROLE_OFERTAS_BETA, U = "https://qkherjtsvakmpkxebuwy.supabase.co/rest/v1/";
const H = { apikey: K, Authorization: `Bearer ${K}`, "content-type": "application/json", Prefer: "return=representation" };
const CAMP = "c3fa658f-fb1d-4a65-a978-3576506e62a0";
const JIDS = ["120363410384012592", "120363431865130875", "120363430853276347", "120363431209217292", "120363427438054510", "120363413250591865", "120363410952527377", "120363429517981208", "120363429891899135", "120363428728871952", "120363410797586952", "120363411950024398", "120363411245167265", "120363415295164179", "120363411933765733", "120363410856840431", "120363415206073581"].map((j) => j + "@g.us");
const WAHA = ["https://waha-ofertas.xktssy.easypanel.host", "https://waha-ofertas-2.xktssy.easypanel.host"];
const modo = process.argv[2];
const log = (m) => { console.log(m); fs.appendFileSync(new URL("./grupos.log", import.meta.url), new Date().toISOString() + " " + m + "\n"); };
if (modo === "criar") {
  const ja = await (await fetch(`${U}campaign_groups?campaign_id=eq.${CAMP}&group_jid=in.(${JIDS.join(",")})&select=group_jid`, { headers: H })).json();
  const tem = new Set(ja.map((x) => x.group_jid));
  const novos = JIDS.map((j, i) => ({ campaign_id: CAMP, group_jid: j, group_name: `As Ofertas Maternas #${182 + i}`, group_type: "group", is_enabled: false, waha_url: WAHA[i % 2] })).filter((r) => !tem.has(r.group_jid));
  if (novos.length) { const r = await fetch(`${U}campaign_groups`, { method: "POST", headers: H, body: JSON.stringify(novos) }); log(`criar ${r.status} ${novos.length} grupos (desligados)`); if (!r.ok) log(await r.text()); }
  else log("criar: já existiam todos");
} else if (modo === "ligar" || modo === "desligar") {
  const r = await fetch(`${U}campaign_groups?campaign_id=eq.${CAMP}&group_jid=in.(${JIDS.join(",")})`, { method: "PATCH", headers: H, body: JSON.stringify({ is_enabled: modo === "ligar" }) });
  log(`${modo} ${r.status} ${(await r.json()).length} grupos`);
} else console.log("uso: node grupos.mjs criar|ligar|desligar");
