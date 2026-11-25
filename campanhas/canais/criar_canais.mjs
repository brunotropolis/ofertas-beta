// 25/11 (Bruno: "Manual do recém-nascido produtos de bebês; Achados da Day beleza, bem estar e decoração;
// Manual dos adultos casa, escritório, eletrônicos, nada gamer ou sério demais, casal descolado"):
// 3 campanhas categoria 'canal' (regra em src/lib/auto-categorias.ts escolherCanal, pelo niche), 8 posts/dia, 1 a cada 75 min, 9h às 20h.
// Uso: node campanhas/canais/criar_canais.mjs   (não duplica se já existir pelo nome)
// Desfazer: update campaigns set is_active=false, auto_enqueue=false where categoria='canal';
import fs from "node:fs";
const E = Object.fromEntries(fs.readFileSync("D:/CLAUDE/.env.meta", "utf8").split(/\r?\n/).map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^"|"$/g, "")]));
const K = E.SUPABASE_SERVICE_ROLE_OFERTAS_BETA, U = "https://qkherjtsvakmpkxebuwy.supabase.co/rest/v1";
const H = { apikey: K, Authorization: `Bearer ${K}`, "content-type": "application/json", Prefer: "return=representation" };
const W = { ofertas: "https://waha-ofertas.xktssy.easypanel.host", bruno: "https://waha-brunotropolis.xktssy.easypanel.host" };
const FIM = "\nRegras: natural, sem travessões, NUNCA use 🍼. Retorne APENAS as 2 linhas.\nPRODUTO: {TITULO}\nPREÇO: {PRECO}";
const CANAIS = [
  { name: "CANAL MANUAL DO RECÉM-NASCIDO", niche: "canal-bebe", perfil_id: "8e8332fa-ebd8-41d5-948f-21bb6cd27a97",
    jid: "120363421912823239@newsletter", gname: "Canal Manual do Recém-Nascido 🥰", waha: W.ofertas,
    ai_prompt: "Você é redator do canal de WhatsApp Manual do Recém-Nascido, com achados de produtos para bebês (tom acolhedor, de mãe para mãe, animado e humano).\nGere EXATAMENTE 2 linhas para o produto abaixo:\n1. Uma chamada curta entre emojis (ex: \"🧸 ACHADINHO DO BEBÊ 🧸\", \"🌟 OFERTA DO DIA 🌟\", \"💥 PREÇO BAIXOU 💥\", \"🚨 CORRE QUE ACABA 🚨\"). Varie.\n2. Uma frase curta com o benefício real pro bebê ou pra rotina da mãe (segurança, conforto, praticidade, desenvolvimento), terminando com UM emoji (👶 💛 🤍 🤱 ✨ 💤 🥰)." + FIM },
  { name: "CANAL ACHADOS DA DAY", niche: "canal-achados", perfil_id: "aa6b7dcb-11c6-4e8f-bcab-5965ec51462d",
    jid: "120363424146492806@newsletter", gname: "Canal Achados da Day 😍", waha: W.bruno,
    ai_prompt: "Você é redator do canal de WhatsApp Achados da Day: beleza, bem-estar e decoração pra casa, com o olhar de quem garimpa coisa boa e bonita (tom leve, carinhoso, de amiga que indica).\nGere EXATAMENTE 2 linhas para o produto abaixo:\n1. Uma chamada curta entre emojis (ex: \"😍 ACHADO DA DAY 😍\", \"✨ MIMO PRA VOCÊ ✨\", \"🏡 CASA MAIS LINDA 🏡\", \"💥 PREÇO BAIXOU 💥\"). Varie.\n2. Uma frase curta com o benefício real (se cuidar, se sentir bem, deixar a casa aconchegante), terminando com UM emoji (😍 ✨ 💛 🤍 🌿 🏡 💅)." + FIM },
  { name: "CANAL MANUAL DOS ADULTOS", niche: "canal-adultos", perfil_id: "9b2a012e-4d44-41b3-8f1c-896c55c57d18",
    jid: "120363424738190994@newsletter", gname: "Canal Manual dos Adultos 🫶", waha: W.ofertas,
    ai_prompt: "Você é redator do canal de WhatsApp Manual dos Adultos: achados pra casa, home office e eletrônicos pra um casal descolado que gosta de praticidade e de coisa legal (tom bem-humorado, leve, sem ser técnico).\nGere EXATAMENTE 2 linhas para o produto abaixo:\n1. Uma chamada curta entre emojis (ex: \"🫶 VIDA ADULTA MAIS FÁCIL 🫶\", \"🏠 UPGRADE NA CASA 🏠\", \"💻 HOME OFFICE EM DIA 💻\", \"💥 PREÇO BAIXOU 💥\"). Varie.\n2. Uma frase curta e espirituosa com o benefício real no dia a dia do casal (menos trabalho, mais conforto, mais tempo juntos), terminando com UM emoji (🫶 😎 ✨ 🏠 ☕ 🎧)." + FIM },
];
for (const c of CANAIS) {
  const ja = await (await fetch(`${U}/campaigns?name=eq.${encodeURIComponent(c.name)}&select=id`, { headers: H })).json();
  let id = ja[0]?.id;
  if (!id) {
    const r = await fetch(`${U}/campaigns`, { method: "POST", headers: H, body: JSON.stringify({ name: c.name, niche: c.niche, ai_prompt: c.ai_prompt, perfil_id: c.perfil_id, categoria: "canal",
      timer_minutes: 75, is_active: true, auto_enqueue: true, auto_daily_cap: 8, auto_window_start: 9, auto_window_end: 20, auto_buffer: 1 }) });
    const j = await r.json(); if (!r.ok) { console.log("ERRO", c.name, JSON.stringify(j)); continue; }
    id = j[0].id;
  }
  const g = await (await fetch(`${U}/campaign_groups?campaign_id=eq.${id}&group_jid=eq.${c.jid}&select=id`, { headers: H })).json();
  if (!g.length) {
    const r = await fetch(`${U}/campaign_groups`, { method: "POST", headers: H, body: JSON.stringify({ campaign_id: id, group_jid: c.jid, group_name: c.gname, group_type: "channel", is_enabled: true, waha_url: c.waha }) });
    if (!r.ok) console.log("ERRO grupo", c.name, await r.text());
  }
  console.log("ok", c.name, id);
}
