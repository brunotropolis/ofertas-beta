// Upsert de linhas de afiliado (ML/Amazon) na tabela public.affiliate_sales.
// Lê a service_role do .env.local (nunca hardcode). Usado pelo coletor /vendas-sync.
//
// Uso:  node scripts/push_affiliate_sales.mjs <arquivo.json> <source: ml|amazon>
//   O JSON é um array de linhas no formato ImportRow (sem o campo `source`).
//
// Requer Node 18+ (fetch nativo).

import fs from "node:fs";
import path from "node:path";

const [, , file, source] = process.argv;
if (!file || (source !== "ml" && source !== "amazon")) {
  console.error("uso: node scripts/push_affiliate_sales.mjs <arquivo.json> <ml|amazon>");
  process.exit(1);
}

// carrega .env.local
const env = {};
for (const line of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error("faltam NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no .env.local"); process.exit(1); }

const rows = JSON.parse(fs.readFileSync(file, "utf8"));
const now = new Date().toISOString();
const norm = rows.map((r) => ({
  source,
  external_id: String(r.external_id),
  sold_at: r.sold_at ?? null,
  period_start: r.period_start ?? null,
  period_end: r.period_end ?? null,
  product_name: r.product_name ?? null,
  product_image: r.product_image ?? null,
  category: r.category ?? null,
  store: r.store ?? null,
  gross_value: r.gross_value ?? 0,
  units: r.units ?? 0,
  clicks: r.clicks ?? null,
  commission: r.commission ?? 0,
  commission_pct: r.commission_pct ?? null,
  status: r.status ?? null,
  sale_type: r.sale_type ?? null,
  utm: r.utm ?? null,
  device: r.device ?? null,
  raw: r.raw ?? null,
  synced_at: now,
}));

const endpoint = `${URL}/rest/v1/affiliate_sales?on_conflict=source,external_id`;
const CHUNK = 500;
let ok = 0;
for (let i = 0; i < norm.length; i += CHUNK) {
  const batch = norm.slice(i, i + CHUNK);
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(batch),
  });
  if (!res.ok) {
    console.error(`lote ${i}-${i + batch.length}: HTTP ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  ok += batch.length;
  console.log(`upsert ${ok}/${norm.length}`);
}
console.log(`OK: ${ok} linhas de ${source} gravadas em affiliate_sales.`);
