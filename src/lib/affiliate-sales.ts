import type { SalesAggregate } from "./shopee-sales";

// ─────────────────────────────────────────────────────────────────────────────
// affiliate_sales — leitura/agregação das fontes gravadas no Supabase (ML, Amazon).
// Mesmo formato de saída (SalesAggregate) da Shopee, pra o dashboard tratar igual.
// ─────────────────────────────────────────────────────────────────────────────

export interface AffiliateSaleRow {
  source: string;
  external_id: string;
  sold_at: string | null;
  period_start: string | null;
  period_end: string | null;
  product_name: string | null;
  product_image: string | null;
  category: string | null;
  store: string | null;
  gross_value: number | string;
  units: number;
  clicks: number | null;
  commission: number | string;
  commission_pct: number | string | null;
  status: string | null;
  sale_type: string | null;
  utm: string | null;
  device: string | null;
}

// Formato aceito pelo POST /api/vendas/import (o coletor manda isso).
export interface ImportRow {
  external_id: string;
  sold_at?: string | null;
  period_start?: string | null;
  period_end?: string | null;
  product_name?: string | null;
  product_image?: string | null;
  category?: string | null;
  store?: string | null;
  gross_value?: number;
  units?: number;
  clicks?: number | null;
  commission?: number;
  commission_pct?: number | null;
  status?: string | null;
  sale_type?: string | null;
  utm?: string | null;
  device?: string | null;
  raw?: unknown;
}

function toNum(v: unknown): number {
  const n = parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

function brtDay(iso: string): string {
  // ISO → dia no fuso BRT (UTC-3)
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso.slice(0, 10);
  return new Date(t - 3 * 3600 * 1000).toISOString().slice(0, 10);
}

/**
 * Agrega linhas do banco em SalesAggregate.
 * mode "sale"  → cada linha é uma venda (ML): conversões = nº de linhas.
 * mode "daily" → cada linha é um dia (Amazon): conversões ≈ itens; sem produto/status por venda.
 */
export function aggregateRows(rows: AffiliateSaleRow[], mode: "sale" | "daily"): SalesAggregate {
  const byStatusCount: Record<string, number> = {};
  const byStatusCommission: Record<string, number> = {};
  const dayMap = new Map<string, { commission: number; conversions: number }>();
  const utmMap = new Map<string, { commission: number; conversions: number }>();
  const devMap = new Map<string, { commission: number; conversions: number }>();
  const prodMap = new Map<string, { name: string; image: string | null; qty: number; commission: number; gmv: number }>();
  const catMap = new Map<string, { category: string; qty: number; commission: number; gmv: number }>();

  let commission = 0;
  let items = 0;
  let gmv = 0;
  let conversions = 0;

  for (const r of rows) {
    const comm = toNum(r.commission);
    const gross = toNum(r.gross_value);
    const units = Number(r.units ?? 0);
    const rowConv = mode === "sale" ? 1 : units; // Amazon não expõe nº de pedidos → usa itens

    commission += comm;
    gmv += gross;
    items += units;
    conversions += rowConv;

    if (r.status) {
      byStatusCount[r.status] = (byStatusCount[r.status] ?? 0) + 1;
      byStatusCommission[r.status] = (byStatusCommission[r.status] ?? 0) + comm;
    }

    if (r.sold_at) {
      const day = brtDay(r.sold_at);
      const dm = dayMap.get(day) ?? { commission: 0, conversions: 0 };
      dm.commission += comm; dm.conversions += rowConv; dayMap.set(day, dm);
    }

    if (r.utm) {
      const um = utmMap.get(r.utm) ?? { commission: 0, conversions: 0 };
      um.commission += comm; um.conversions += rowConv; utmMap.set(r.utm, um);
    }
    if (r.device) {
      const dv = devMap.get(r.device) ?? { commission: 0, conversions: 0 };
      dv.commission += comm; dv.conversions += rowConv; devMap.set(r.device, dv);
    }

    if (r.product_name) {
      const key = r.product_name;
      const pm = prodMap.get(key) ?? { name: r.product_name, image: r.product_image, qty: 0, commission: 0, gmv: 0 };
      pm.qty += units;
      pm.commission += comm;
      pm.gmv += gross;
      if (!pm.image && r.product_image) pm.image = r.product_image;
      prodMap.set(key, pm);
    }

    if (r.category) {
      const cm = catMap.get(r.category) ?? { category: r.category, qty: 0, commission: 0, gmv: 0 };
      cm.qty += units;
      cm.commission += comm;
      cm.gmv += gross;
      catMap.set(r.category, cm);
    }
  }

  const byProduct = [...prodMap.values()].sort((a, b) => b.commission - a.commission).slice(0, 25);
  const byCategory = [...catMap.values()].sort((a, b) => b.commission - a.commission).slice(0, 25);
  const byDay = [...dayMap.entries()].map(([day, v]) => ({ day, ...v })).sort((a, b) => a.day.localeCompare(b.day));
  const byUtm = [...utmMap.entries()].map(([utm, v]) => ({ utm, ...v })).sort((a, b) => b.commission - a.commission);
  const byDevice = [...devMap.entries()].map(([device, v]) => ({ device, ...v })).sort((a, b) => b.commission - a.commission);

  return {
    kpis: {
      commission,
      conversions,
      items,
      gmv,
      ticket: conversions ? gmv / conversions : 0,
      byStatusCount,
      byStatusCommission,
    },
    byProduct,
    byCategory,
    byDay,
    byUtm,
    byDevice,
  };
}
