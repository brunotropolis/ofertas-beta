import crypto from "crypto";

// ─────────────────────────────────────────────────────────────────────────────
// Shopee Affiliate — relatório de conversões (vendas + comissão)
// API GraphQL oficial: conversionReport. Auth SHA256(appId+ts+body+appSecret).
// Credenciais globais da conta de afiliado (env, não por-campanha).
// ─────────────────────────────────────────────────────────────────────────────

const ENDPOINT = "https://open-api.affiliate.shopee.com.br/graphql";
const MAX_PAGES = 30; // teto de segurança (30 * 100 = 3000 conversões)
const PAGE = 100;

export interface SaleItem {
  name: string;
  price: number;
  qty: number;
  commission: number;
  image: string | null;
  category: string | null;
}
export interface Conversion {
  purchaseTime: number; // epoch s
  status: string;
  commission: number;
  utm: string | null;
  device: string | null;
  items: SaleItem[];
}

function sign(appId: string, ts: number, body: string, secret: string) {
  return crypto.createHash("sha256").update(`${appId}${ts}${body}${secret}`).digest("hex");
}

function toNum(v: unknown): number {
  const n = parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

function cleanUtm(u: string | null | undefined): string | null {
  if (!u) return null;
  // Shopee manda "----" ou "-OFM---" quando não há sub_ids reais
  const stripped = u.replace(/-/g, "").trim();
  return stripped.length ? u : null;
}

async function callShopee(appId: string, secret: string, query: string) {
  const body = JSON.stringify({ query });
  const ts = Math.floor(Date.now() / 1000);
  const signature = sign(appId, ts, body, secret);
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `SHA256 Credential=${appId}, Timestamp=${ts}, Signature=${signature}`,
    },
    body,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.errors) {
    const msg = json.errors?.[0]?.message || `HTTP ${res.status}`;
    throw new Error(`Shopee: ${msg}`);
  }
  return json.data;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapNode(n: any): Conversion {
  const items: SaleItem[] = [];
  for (const o of n.orders ?? []) {
    for (const it of o.items ?? []) {
      items.push({
        name: it.itemName ?? "(sem nome)",
        price: toNum(it.itemPrice),
        qty: Number(it.qty ?? 0),
        commission: toNum(it.itemTotalCommission),
        image: it.imageUrl ?? null,
        category: it.categoryLv1Name ?? null,
      });
    }
  }
  return {
    purchaseTime: Number(n.purchaseTime ?? 0),
    status: n.conversionStatus ?? "UNKNOWN",
    commission: toNum(n.totalCommission),
    utm: cleanUtm(n.utmContent),
    device: n.device ?? null,
    items,
  };
}

/** Busca todas as conversões da janela (paginado via scrollId, com teto). */
export async function fetchConversions(
  appId: string,
  secret: string,
  startEpoch: number,
  endEpoch: number
): Promise<Conversion[]> {
  const out: Conversion[] = [];
  let scrollId = "";
  for (let page = 0; page < MAX_PAGES; page++) {
    const q = `query{ conversionReport(purchaseTimeStart:${startEpoch}, purchaseTimeEnd:${endEpoch}, limit:${PAGE}, scrollId:${JSON.stringify(
      scrollId
    )}){ nodes{ purchaseTime conversionStatus totalCommission utmContent device orders{ items{ itemName itemPrice qty itemTotalCommission categoryLv1Name imageUrl } } } pageInfo{ hasNextPage scrollId } } }`;
    const data = await callShopee(appId, secret, q);
    const cr = data?.conversionReport ?? {};
    for (const n of cr.nodes ?? []) out.push(mapNode(n));
    const info = cr.pageInfo ?? {};
    if (!info.hasNextPage || !info.scrollId) break;
    scrollId = info.scrollId;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Agregação p/ o dashboard
// ─────────────────────────────────────────────────────────────────────────────

export interface SalesAggregate {
  kpis: {
    commission: number;
    conversions: number;
    items: number;
    gmv: number;
    ticket: number; // gmv / pedidos
    byStatusCount: Record<string, number>;
    byStatusCommission: Record<string, number>;
  };
  byProduct: { name: string; image: string | null; qty: number; commission: number; gmv: number }[];
  byDay: { day: string; commission: number; conversions: number }[];
  byUtm: { utm: string; commission: number; conversions: number }[];
  byDevice: { device: string; commission: number; conversions: number }[];
}

function brtDay(epochSec: number): string {
  // dia no fuso BRT (UTC-3)
  const d = new Date((epochSec - 3 * 3600) * 1000);
  return d.toISOString().slice(0, 10);
}

export function aggregate(conversions: Conversion[]): SalesAggregate {
  const byStatusCount: Record<string, number> = {};
  const byStatusCommission: Record<string, number> = {};
  const dayMap = new Map<string, { commission: number; conversions: number }>();
  const utmMap = new Map<string, { commission: number; conversions: number }>();
  const devMap = new Map<string, { commission: number; conversions: number }>();
  const prodMap = new Map<string, { name: string; image: string | null; qty: number; commission: number; gmv: number }>();

  let commission = 0;
  let items = 0;
  let gmv = 0;

  for (const c of conversions) {
    commission += c.commission;
    byStatusCount[c.status] = (byStatusCount[c.status] ?? 0) + 1;
    byStatusCommission[c.status] = (byStatusCommission[c.status] ?? 0) + c.commission;

    const day = brtDay(c.purchaseTime);
    const dm = dayMap.get(day) ?? { commission: 0, conversions: 0 };
    dm.commission += c.commission; dm.conversions += 1; dayMap.set(day, dm);

    const utm = c.utm ?? "(sem UTM)";
    const um = utmMap.get(utm) ?? { commission: 0, conversions: 0 };
    um.commission += c.commission; um.conversions += 1; utmMap.set(utm, um);

    const dev = c.device ?? "?";
    const dv = devMap.get(dev) ?? { commission: 0, conversions: 0 };
    dv.commission += c.commission; dv.conversions += 1; devMap.set(dev, dv);

    for (const it of c.items) {
      items += it.qty;
      gmv += it.price * it.qty;
      const key = it.name;
      const pm = prodMap.get(key) ?? { name: it.name, image: it.image, qty: 0, commission: 0, gmv: 0 };
      pm.qty += it.qty;
      pm.commission += it.commission;
      pm.gmv += it.price * it.qty;
      if (!pm.image && it.image) pm.image = it.image;
      prodMap.set(key, pm);
    }
  }

  const byProduct = [...prodMap.values()].sort((a, b) => b.commission - a.commission).slice(0, 25);
  const byDay = [...dayMap.entries()].map(([day, v]) => ({ day, ...v })).sort((a, b) => a.day.localeCompare(b.day));
  const byUtm = [...utmMap.entries()].map(([utm, v]) => ({ utm, ...v })).sort((a, b) => b.commission - a.commission);
  const byDevice = [...devMap.entries()].map(([device, v]) => ({ device, ...v })).sort((a, b) => b.commission - a.commission);

  return {
    kpis: {
      commission,
      conversions: conversions.length,
      items,
      gmv,
      ticket: conversions.length ? gmv / conversions.length : 0,
      byStatusCount,
      byStatusCommission,
    },
    byProduct,
    byDay,
    byUtm,
    byDevice,
  };
}
