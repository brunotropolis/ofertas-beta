// Parser do relatório "Linked-Product" (CSV) do Amazon Associados → affiliate_sales (source=amazon).
// O CSV vem zipado do painel ("Fazer download de relatórios" → Comissões: Produto relacionado, formato CSV).
// Descompacte antes e passe o .csv. Colunas (inglês):
//   Date, Category, Product Title, Asin, Clicks, ..., Items Ordered, ..., Ordered Revenue, ..., Total Earnings
// Grão: por-produto (por período do relatório). Se o CSV tiver a coluna Date variando (relatório multi-dia
// vem por produto×dia), guardamos sold_at por linha — senão sold_at=null e vale period_start/period_end.
//
// Uso: node scripts/parse_amazon_report.mjs <arquivo.csv> <period_start YYYY-MM-DD> <period_end YYYY-MM-DD> [storeId]
//   storeId = tracking ID do Associados (ex.: manualdorec0c-20, manualdorec04-20). Default manualdorec0c-20.
//   Cada storeId acumula separado (vendas são atribuídas a UMA tracking ID; somar as IDs = total correto).
// Lê a service_role do .env.local; faz upsert direto no Supabase.

import fs from "node:fs";
import path from "node:path";

const [, , file, pStart, pEnd, storeArg] = process.argv;
const storeId = storeArg || "manualdorec0c-20";
if (!file || !pStart || !pEnd) {
  console.error("uso: node scripts/parse_amazon_report.mjs <arquivo.csv> <period_start> <period_end> [storeId]");
  process.exit(1);
}

const env = {};
for (const line of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const URL = env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error("faltam vars no .env.local"); process.exit(1); }

// CSV parse simples com aspas
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else {
      if (c === '"') q = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (c === "\r") { /* skip */ }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.length > 1);
}

const num = (v) => { const n = parseFloat(String(v ?? "").replace(/[^0-9.,-]/g, "").replace(",", ".")); return Number.isFinite(n) ? n : 0; };

const raw = fs.readFileSync(file, "utf8");
const rows = parseCsv(raw);
const header = rows.shift().map(h => h.trim().toLowerCase());
const col = (name) => header.indexOf(name.toLowerCase());
const iDate = col("Date"), iCat = col("Category"), iTitle = col("Product Title"), iAsin = col("Asin"),
  iClicks = col("Clicks"), iItems = col("Items Ordered"), iRev = col("Ordered Revenue"), iEarn = col("Total Earnings");

// múltiplos dias? (Date variando entre linhas)
const dates = new Set(rows.map(r => (r[iDate] || "").trim()).filter(Boolean));
const perDay = dates.size > 1;

const out = rows.map((r) => {
  const asin = (r[iAsin] || "").trim() || "na";
  const title = (r[iTitle] || "").trim();
  const name = title === "others" ? "Outros produtos (Amazon)" : title || asin;
  const cat = (r[iCat] || "").trim();
  const category = !cat || cat === "others" ? "Outras" : cat;
  const day = (r[iDate] || "").trim();
  return {
    external_id: perDay ? `${storeId}:${asin}:${day}` : `${storeId}:${asin}:${pStart}:${pEnd}`,
    sold_at: perDay && /^\d{4}-\d{2}-\d{2}$/.test(day) ? `${day}T12:00:00.000-03:00` : null,
    period_start: pStart,
    period_end: pEnd,
    product_name: name,
    category,
    store: storeId,
    clicks: Math.round(num(r[iClicks])),
    units: Math.round(num(r[iItems])),
    gross_value: num(r[iRev]),
    commission: num(r[iEarn]),
    raw: { asin, date: day, store: storeId },
  };
});

const now = new Date().toISOString();
const payload = out.map(r => ({ source: "amazon", ...r, synced_at: now,
  product_image: null, commission_pct: null, status: null, sale_type: null, utm: null, device: null }));

// Acumula por período E por tracking ID: apaga SÓ o bucket deste storeId+período (re-sync idempotente;
// buckets não-sobrepostos coexistem e somam). storeIds diferentes (0c-20, 04-20) acumulam.
const del = await fetch(`${URL}/rest/v1/affiliate_sales?source=eq.amazon&store=eq.${encodeURIComponent(storeId)}&period_start=eq.${pStart}&period_end=eq.${pEnd}`, {
  method: "DELETE",
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Prefer: "return=minimal" },
});
if (!del.ok) { console.error(`delete amazon período: HTTP ${del.status} ${await del.text()}`); process.exit(1); }

const endpoint = `${URL}/rest/v1/affiliate_sales?on_conflict=source,external_id`;
let ok = 0;
for (let i = 0; i < payload.length; i += 500) {
  const batch = payload.slice(i, i + 500);
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(batch),
  });
  if (!res.ok) { console.error(`lote ${i}: HTTP ${res.status} ${await res.text()}`); process.exit(1); }
  ok += batch.length;
}
console.log(`OK: ${ok} linhas amazon [${storeId}] (perDay=${perDay}, período ${pStart}..${pEnd}). Comissão total: R$ ${out.reduce((a, b) => a + b.commission, 0).toFixed(2)}`);
