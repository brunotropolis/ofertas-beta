// Upsert das métricas de conta (janelas 7/30/90) na tabela public.affiliate_metrics.
// Uso: node scripts/push_affiliate_metrics.mjs <arquivo.json>
//   O JSON é um array de { source, days, clicks, buyers, requests, orders, gmv, commission,
//   comm_marketplace, comm_seller, comm_brand, synced_at }. Lê service_role do .env.local.
import fs from "node:fs";
import path from "node:path";

const file = process.argv[2];
if (!file) { console.error("uso: node scripts/push_affiliate_metrics.mjs <arquivo.json>"); process.exit(1); }

const env = {};
for (const line of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const URL = env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error("faltam vars no .env.local"); process.exit(1); }

const rows = JSON.parse(fs.readFileSync(file, "utf8"));
const r = await fetch(`${URL}/rest/v1/affiliate_metrics?on_conflict=source,days`, {
  method: "POST",
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
  body: JSON.stringify(rows),
});
if (!r.ok) { console.error(`HTTP ${r.status} ${await r.text()}`); process.exit(1); }
console.log(`OK: ${rows.length} métricas gravadas (${rows.map(x => `${x.source}/${x.days}d`).join(", ")}).`);
