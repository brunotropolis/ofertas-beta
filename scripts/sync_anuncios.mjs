// Coletor de ANÚNCIOS — lê os posts de oferta de um grupo WhatsApp (WHAPI) → tabela public.anuncios.
// Cada post (link_preview) = 1 anúncio: produto (texto em *negrito*) + plataforma (domínio do link) + data.
// Guarda CRU (product_raw); a normalização acontece no app (mesma taxonomia das vendas).
//
// Uso: node scripts/sync_anuncios.mjs [dias]   (default 90)
// Lê WHAPI de D:/CLAUDE/.env.meta e Supabase (service_role) de .env.local.

import fs from "node:fs";
import path from "node:path";

function loadEnv(file) {
  const env = {};
  try { for (const l of fs.readFileSync(file, "utf8").split(/\r?\n/)) { const m = l.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, ""); } } catch {}
  return env;
}
const local = loadEnv(path.join(process.cwd(), ".env.local"));
const meta = loadEnv("D:/CLAUDE/.env.meta");
const SUPA = local.NEXT_PUBLIC_SUPABASE_URL, KEY = local.SUPABASE_SERVICE_ROLE_KEY;
const WHAPI = meta.WHAPI_BASE_URL || "https://gate.whapi.cloud", WTOK = meta.WHAPI_TOKEN;
const GROUP_ID = process.argv[3] || "120363345689119695@g.us"; // As Ofertas Maternas#1
const GROUP_NAME = process.argv[4] || "As Ofertas Maternas#1";
const days = parseInt(process.argv[2] || "90", 10);
const cutoff = Math.floor(Date.now() / 1000) - days * 86400;

const platform = (u) => { u = (u || "").toLowerCase(); if (/shopee/.test(u)) return "shopee"; if (/amzn|amazon/.test(u)) return "amazon"; if (/mercadoliv|mercadolibre|meli\.la|\/sec\/|mlb/.test(u)) return "ml"; if (/magazine|magalu/.test(u)) return "magazine"; return "outro"; };
const product = (b) => { if (!b) return ""; const m = b.match(/\*([^*]{4,})\*/); if (m) return m[1].trim(); const ls = b.split("\n").map(x => x.trim()).filter(Boolean); return (ls[1] || ls[0] || "").slice(0, 120); };

const rows = [];
let offset = 0;
for (let page = 0; page < 60; page++) {
  const res = await fetch(`${WHAPI}/messages/list/${GROUP_ID}?count=100&offset=${offset}`, { headers: { Authorization: "Bearer " + WTOK } });
  if (!res.ok) { console.error("WHAPI HTTP", res.status, (await res.text()).slice(0, 200)); break; }
  const j = await res.json();
  const ms = j.messages || [];
  if (!ms.length) break;
  let oldest = Infinity;
  for (const m of ms) {
    oldest = Math.min(oldest, m.timestamp || 0);
    if ((m.timestamp || 0) < cutoff) continue;
    if (m.type !== "link_preview") continue;
    const lp = m.link_preview || {};
    const url = lp.url || "";
    const prod = product(lp.body);
    if (!prod) continue;
    rows.push({
      msg_id: m.id,
      group_id: GROUP_ID,
      group_name: GROUP_NAME,
      posted_at: new Date((m.timestamp || 0) * 1000).toISOString(),
      platform: platform(url),
      product_raw: prod,
      url,
      raw: null,
      synced_at: new Date().toISOString(),
    });
  }
  offset += ms.length;
  if (oldest < cutoff || ms.length < 100) break;
}

// upsert em lotes (dedup por msg_id)
const endpoint = `${SUPA}/rest/v1/anuncios?on_conflict=msg_id`;
let ok = 0;
for (let i = 0; i < rows.length; i += 500) {
  const batch = rows.slice(i, i + 500);
  const r = await fetch(endpoint, { method: "POST", headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(batch) });
  if (!r.ok) { console.error(`lote ${i}: HTTP ${r.status} ${await r.text()}`); process.exit(1); }
  ok += batch.length;
}
const pc = {}; for (const r of rows) pc[r.platform] = (pc[r.platform] || 0) + 1;
console.log(`OK: ${ok} anúncios (${days}d) do "${GROUP_NAME}". Plataformas: ${JSON.stringify(pc)}`);
