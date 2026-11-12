// 12/Nov (Bruno): aviso diário dos grupos secundários na geral das Maternas. 1x/dia o grupo de Fraldas (10h40) e
// 1x/dia o de Cupons (15h40), revezando as 5 artes de cada (public/avisos/grupos/f1..f5, k1..k5).
// Uso: node campanhas/grupos/agendar.mjs <AAAA-MM-DD inicio> <dias> [--dry]
// Link: /api/entrar/ofertas-maternas?cat=fraldas|cupons (manda pro grupo da categoria; reserva = convite fixo).
// Desfazer: delete from publication_queue where offer_id in (select id from offers where source_ref like 'aviso_grupos_%' and status='queued');
//           delete from offers where source_ref like 'aviso_grupos_%' and status='queued';
import fs from "node:fs";
const ENV = Object.fromEntries(fs.readFileSync("D:/CLAUDE/.env.meta", "utf8").split(/\r?\n/)
  .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^"|"$/g, "")]));
const K = ENV.SUPABASE_SERVICE_ROLE_OFERTAS_BETA;
const U = "https://qkherjtsvakmpkxebuwy.supabase.co/rest/v1";
const H = { apikey: K, Authorization: `Bearer ${K}`, "content-type": "application/json", Prefer: "return=representation" };
const PERFIL = "8e8332fa-ebd8-41d5-948f-21bb6cd27a97", GERAL = "c3fa658f-fb1d-4a65-a978-3576506e62a0";
const [ini, dias = "30"] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const DRY = process.argv.includes("--dry");
const LINK = { f: "https://asofertasmaternas.com.br/l/fraldas", k: "https://asofertasmaternas.com.br/l/cupons" }; // 12/11: link curto (slug no KV do utm-redirector, destino = /api/entrar?cat=)
const HORA = { f: "10:40", k: "15:40" };
const T = {
  f: [
    ["Grupo de Fraldas", "👶 *TEM GRUPO SÓ DE FRALDA!*\n\nSe você compra fralda todo mês, entra no nosso *grupo de fraldas*: só oferta de fralda e lenço, das melhores marcas. É de graça 💛\n\n👉 Entra aqui:\n{LINK}"],
    ["Huggies e Pampers no grupo de fraldas", "🛒 *HUGGIES E PAMPERS MAIS BARATAS*\n\nOs melhores preços de fralda chegam primeiro no nosso *grupo de fraldas*. Quem entra não paga caro no pacotão 🤍\n\n👉 Entra aqui:\n{LINK}"],
    ["Acabou a fralda?", "⏰ *ACABOU A FRALDA? NÃO PAGA CARO*\n\nNo nosso *grupo de fraldas* a gente avisa quando o preço cai, do RN ao XXG. É de graça ✨\n\n👉 Entra aqui:\n{LINK}"],
    ["Mãe ajuda mãe: grupo de fraldas", "🤱 *MÃE AJUDA MÃE*\n\nEntra no nosso *grupo de fraldas* e chama quem também vive comprando fralda. Só oferta boa de fralda e lenço 💛\n\n👉 Link do grupo:\n{LINK}"],
    ["Pacotão em oferta", "📦 *PACOTÃO DE FRALDA EM OFERTA*\n\nDo RN ao XXG, das melhores marcas, todo dia no nosso *grupo de fraldas*. É de graça 🥰\n\n👉 Entra aqui:\n{LINK}"],
  ],
  k: [
    ["Grupo de Cupons", "🎟️ *TEM GRUPO SÓ DE CUPONS!*\n\nCupons da Shopee, Mercado Livre e Amazon assim que saem, no nosso *grupo de cupons*. É de graça 💛\n\n👉 Entra aqui:\n{LINK}"],
    ["Cupom acaba rápido", "⚡ *CUPOM ACABA RÁPIDO*\n\nNo nosso *grupo de cupons* você recebe o código na hora que ele sai e chega primeiro ✨\n\n👉 Entra aqui:\n{LINK}"],
    ["Antes de comprar, tem cupom?", "🛍️ *ANTES DE COMPRAR, TEM CUPOM?*\n\nConfere no nosso *grupo de cupons* e paga menos nas compras do bebê e da casa 🤍\n\n👉 Entra aqui:\n{LINK}"],
    ["Mãe esperta: grupo de cupons", "💡 *MÃE ESPERTA USA CUPOM*\n\nDesconto extra todo dia no nosso *grupo de cupons*. É de graça e não tem spam, só cupom 💛\n\n👉 Entra aqui:\n{LINK}"],
    ["Cupom + oferta", "💸 *CUPOM + OFERTA = PAGA BEM MENOS*\n\nJunta o cupom do nosso *grupo de cupons* com as ofertas daqui e economiza de verdade 🥰\n\n👉 Entra aqui:\n{LINK}"],
  ],
};
let pos = 1000, n = 0;
for (let d = 0; d < +dias; d++) {
  const dia = new Date(new Date(ini + "T12:00:00-03:00").getTime() + d * 86400_000).toISOString().slice(0, 10);
  for (const g of ["f", "k"]) {
    const quando = new Date(`${dia}T${HORA[g]}:00-03:00`);
    if (quando.getTime() < Date.now() + 5 * 60_000) continue;
    const v = d % 5, [titulo, texto] = T[g][v], link = LINK[g];
    const ref = `aviso_grupos_${g}_${dia}`;
    const oferta = { source: "manual", source_ref: ref, platform: null, kind: "produto", status: "queued", url: link, affiliate_url: link,
      title: titulo, image_url: `https://app.buscadorgeek.com.br/avisos/grupos/${g}${v + 1}.jpg?v=2`, extra_text: texto.replace("{LINK}", link),
      perfil_id: PERFIL, source_channel: "aviso grupos", expires_at: new Date(quando.getTime() + 24 * 3600_000).toISOString(),
      promo_meta: { aviso: { descricao: g === "f" ? "convite grupo de fraldas" : "convite grupo de cupons", campanha: "grupos secundários" } } };
    if (DRY) { console.log("dry", ref, quando.toISOString(), oferta.image_url.slice(-6)); n++; continue; }
    const ja = await (await fetch(`${U}/offers?source_ref=eq.${ref}&select=id`, { headers: H })).json();
    if (ja.length) continue;
    const r = await fetch(`${U}/offers`, { method: "POST", headers: H, body: JSON.stringify(oferta) });
    const o = await r.json(); if (!r.ok) { console.log("ERRO", ref, JSON.stringify(o).slice(0, 200)); continue; }
    const q = await fetch(`${U}/publication_queue`, { method: "POST", headers: H, body: JSON.stringify({ offer_id: o[0].id, campaign_ids: [GERAL], position: pos++, scheduled_at: quando.toISOString(), status: "pending" }) });
    if (q.ok) n++; else console.log("ERRO fila", ref, (await q.text()).slice(0, 200));
  }
}
console.log(DRY ? "dry" : "agendados", n);
