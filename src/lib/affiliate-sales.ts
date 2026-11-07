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
 * Recorta linhas da Amazon pra janela [startSec, endSec] (epoch s).
 * Linha por-dia (sold_at) entra inteira se o dia (BRT) cai na janela.
 * Linha por-bucket (period_start/end, grão que a Amazon exporta) entra
 * PRO-RATA pela fração de dias do bucket dentro da janela — aproximação
 * necessária porque a Amazon não expõe o dado por-dia/por-venda.
 */
export function windowAmazonRows(rows: AffiliateSaleRow[], startSec: number, endSec: number): AffiliateSaleRow[] {
  const dayMs = 86400000;
  const toDayBRT = (sec: number) => new Date(sec * 1000 - 3 * 3600 * 1000).toISOString().slice(0, 10);
  const startDay = toDayBRT(startSec);
  const endDay = toDayBRT(endSec);
  const out: AffiliateSaleRow[] = [];
  for (const r of rows) {
    if (r.sold_at) {
      const d = brtDay(r.sold_at);
      if (d >= startDay && d <= endDay) out.push(r);
      continue;
    }
    if (!r.period_start || !r.period_end) continue;
    const os = r.period_start > startDay ? r.period_start : startDay;
    const oe = r.period_end < endDay ? r.period_end : endDay;
    if (os > oe) continue;
    const bucketDays = Math.round((Date.parse(r.period_end) - Date.parse(r.period_start)) / dayMs) + 1;
    const overlapDays = Math.round((Date.parse(oe) - Date.parse(os)) / dayMs) + 1;
    const f = bucketDays > 0 ? overlapDays / bucketDays : 0;
    if (f >= 0.999) { out.push(r); continue; }
    out.push({
      ...r,
      gross_value: toNum(r.gross_value) * f,
      commission: toNum(r.commission) * f,
      units: Math.round(Number(r.units ?? 0) * f),
      clicks: r.clicks == null ? r.clicks : Math.round(Number(r.clicks) * f),
    });
  }
  return out;
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
  const prodMap = new Map<string, { name: string; image: string | null; qty: number; commission: number; gmv: number; clicks: number }>();
  const catMap = new Map<string, { category: string; qty: number; commission: number; gmv: number }>();
  const storeMap = new Map<string, { store: string; qty: number; commission: number; gmv: number }>();

  let commission = 0;
  let items = 0;
  let gmv = 0;
  let conversions = 0;
  let clicks = 0;
  let commissionConfirmed = 0;

  for (const r of rows) {
    const comm = toNum(r.commission);
    // status sempre aparece no quadro; cancelada/rejeitada não soma em mais nada (07/Nov)
    if (r.status) {
      byStatusCount[r.status] = (byStatusCount[r.status] ?? 0) + 1;
      byStatusCommission[r.status] = (byStatusCommission[r.status] ?? 0) + comm;
    }
    if (isCancelada(r.status)) continue;
    // sem status (Amazon: ganhos = itens enviados) conta como confirmada
    if (!r.status || isConfirmada(r.status)) commissionConfirmed += comm;
    const gross = toNum(r.gross_value);
    const units = Number(r.units ?? 0);
    const rowConv = mode === "sale" ? 1 : units; // Amazon não expõe nº de pedidos → usa itens

    commission += comm;
    gmv += gross;
    items += units;
    conversions += rowConv;
    clicks += Number(r.clicks ?? 0) || 0;

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
      const pm = prodMap.get(key) ?? { name: r.product_name, image: r.product_image, qty: 0, commission: 0, gmv: 0, clicks: 0 };
      pm.qty += units;
      pm.commission += comm;
      pm.gmv += gross;
      pm.clicks += Number(r.clicks ?? 0) || 0;
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

    // vendedor/loja — só o ML traz (Amazon usa o store como tracking ID, não é vendedor)
    if (r.store && r.source === "ml") {
      const sm = storeMap.get(r.store) ?? { store: r.store, qty: 0, commission: 0, gmv: 0 };
      sm.qty += units;
      sm.commission += comm;
      sm.gmv += gross;
      storeMap.set(r.store, sm);
    }
  }

  const byProduct = [...prodMap.values()].sort((a, b) => b.commission - a.commission).slice(0, 25);
  const byCategory = [...catMap.values()].sort((a, b) => b.commission - a.commission).slice(0, 25);
  const byStore = [...storeMap.values()].sort((a, b) => b.commission - a.commission).slice(0, 25);
  const byDay = [...dayMap.entries()].map(([day, v]) => ({ day, ...v })).sort((a, b) => a.day.localeCompare(b.day));
  const byUtm = [...utmMap.entries()].map(([utm, v]) => ({ utm, ...v })).sort((a, b) => b.commission - a.commission);
  const byDevice = [...devMap.entries()].map(([device, v]) => ({ device, ...v })).sort((a, b) => b.commission - a.commission);

  return {
    kpis: {
      commission,
      commissionConfirmed,
      conversions,
      items,
      gmv,
      ticket: conversions ? gmv / conversions : 0,
      clicks,
      byStatusCount,
      byStatusCommission,
    },
    byProduct,
    byCategory,
    byStore,
    byDay,
    byUtm,
    byDevice,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Janela em dias BRT (07/Nov): "últimos N dias" = hoje + N-1 dias anteriores,
// começando à meia-noite BRT. Mesma régua pras 3 lojas (antes: Shopee N×24h,
// ML perdia o 1º dia e a Amazon ganhava o 1º dia inteiro).
// ─────────────────────────────────────────────────────────────────────────────
export function inicioJanelaBRT(days: number, nowSec = Math.floor(Date.now() / 1000)): number {
  const hojeBRT = new Date((nowSec - 3 * 3600) * 1000).toISOString().slice(0, 10);
  const meiaNoite = Math.floor(Date.parse(hojeBRT + "T00:00:00-03:00") / 1000);
  return meiaNoite - (Math.max(1, days) - 1) * 86400;
}

/** Venda cancelada/rejeitada não entra em comissão, itens nem valor vendido (só no quadro de status). */
export const isCancelada = (status: string | null | undefined) => /^CANCEL/i.test(status ?? "");
/** Comissão já confirmada pela loja (o resto é "a confirmar"). */
export const isConfirmada = (status: string | null | undefined) => /^(CONFIRMED|COMPLETED)$/i.test(status ?? "");

// ─────────────────────────────────────────────────────────────────────────────
// Amazon pelo DIÁRIO (07/Nov). O mês guardado em affiliate_sales é 1 bloco por
// produto; recortar a janela "por igual" (pro-rata) erra quando o mês é desigual
// (30d em 07/11: R$ 6.008 no dash × R$ 5.347 real). A série por dia da loja
// principal está em afiliado_etiquetas_diario (fonte amazon, tag 0c-20, desde
// 03/05; a soma do mês bate com o bloco). Total/cliques/itens/dia saem do diário;
// a lista de produtos continua do mês, reescalada pra fechar com o total do diário.
// ─────────────────────────────────────────────────────────────────────────────
export const AMAZON_LOJA_DIARIA = "manualdorec0c-20";
export interface AmazonDiaRow { dia: string; cliques: number; vendas: number; comissao: number | string }
export interface AmazonDiario { commission: number; clicks: number; items: number; byDay: { day: string; commission: number; conversions: number }[]; ultimoDia: string | null }

/**
 * dias = série diária da loja 0c-20 dentro da janela; primeiroDiaSerie = 1º dia que existe na série.
 * Se a série não cobre o começo da janela, devolve null (fica o pro-rata antigo).
 */
export function amazonPeloDiario(
  windowRows: AffiliateSaleRow[], dias: AmazonDiaRow[], primeiroDiaSerie: string | null, startSec: number,
): { rows: AffiliateSaleRow[]; diario: AmazonDiario } | null {
  const startDay = new Date((startSec - 3 * 3600) * 1000).toISOString().slice(0, 10);
  if (!primeiroDiaSerie || primeiroDiaSerie > startDay) return null;
  const commission = dias.reduce((s, d) => s + toNum(d.comissao), 0);
  const clicks = dias.reduce((s, d) => s + (Number(d.cliques) || 0), 0);
  const items = dias.reduce((s, d) => s + (Number(d.vendas) || 0), 0);
  const principal = windowRows.filter((r) => r.store === AMAZON_LOJA_DIARIA);
  const outras = windowRows.filter((r) => r.store !== AMAZON_LOJA_DIARIA);
  const base = principal.reduce((s, r) => s + toNum(r.commission), 0);
  const f = base > 0 ? commission / base : 0;
  const escaladas = principal.map((r) => ({
    ...r,
    commission: toNum(r.commission) * f,
    gross_value: toNum(r.gross_value) * f,
    units: Math.round(Number(r.units ?? 0) * f),
    clicks: r.clicks == null ? r.clicks : Math.round(Number(r.clicks) * f),
  }));
  const byDay = dias.map((d) => ({ day: d.dia, commission: toNum(d.comissao), conversions: Number(d.vendas) || 0 }))
    .sort((a, b) => a.day.localeCompare(b.day));
  return {
    rows: [...escaladas, ...outras],
    diario: { commission, clicks, items, byDay, ultimoDia: byDay.length ? byDay[byDay.length - 1].day : null },
  };
}
