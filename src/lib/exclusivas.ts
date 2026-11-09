// Ofertas EXCLUSIVAS da Amazon (planilha semanal/quinzenal que chega por e-mail + links avulsos com prazo).
// Mesma regra do scripts/importar_exclusivas_amazon.mjs: separa por perfil, pega os maiores descontos,
// confere foto/estoque na Creators API e grava como rascunho com promo_meta.exclusiva {inicio, fim, preco_promo, fonte}.
// Quem posta é o auto-enqueue (furarComExclusiva): só dentro da janela, furando a fila, teto 10/dia Maternas e 15/dia Geek.
import * as XLSX from "xlsx";

export interface LinhaExclusiva {
  inicio: string; fim: string; asin: string; categoria: string; titulo: string;
  capa: number | null; promo: number | null; desconto: number;
}

const num = (v: unknown) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = Number(String(v ?? "").replace(/[^\d.,]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
  return Number.isFinite(n) && String(v ?? "").trim() !== "" ? n : null;
};
const pad = (n: number) => String(n).padStart(2, "0");

/** Data da planilha ("2026/11/08", "08/11/2026", Date ou número serial do Excel) → [ano, mês, dia] */
function data(v: unknown): [number, number, number] | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return [v.getFullYear(), v.getMonth() + 1, v.getDate()];
  if (typeof v === "number") { const d = XLSX.SSF.parse_date_code(v); return d ? [d.y, d.m, d.d] : null; }
  const s = String(v ?? "").trim();
  let m = s.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/); if (m) return [+m[1], +m[2], +m[3]];
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/); if (m) return [+m[3], +m[2], +m[1]];
  return null;
}
/** Hora ("10:00", 0.4166 do Excel, Date) → [h, min] */
function horaDe(v: unknown): [number, number] {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return [v.getHours(), v.getMinutes()];
  if (typeof v === "number" && v < 1) { const t = Math.round(v * 1440); return [Math.floor(t / 60), t % 60]; }
  const m = String(v ?? "").match(/(\d{1,2}):(\d{2})/);
  return m ? [+m[1], +m[2]] : [0, 0];
}
/** Data+hora de Brasília → ISO UTC */
function quando(d: [number, number, number], h: [number, number]) {
  return new Date(Date.UTC(d[0], d[1] - 1, d[2], h[0] + 3, h[1])).toISOString();
}

/** Lê .xlsx/.csv da planilha da Amazon. Colunas: Data inicial, Hora início, Data final, Hora fim, ASIN, Categoria,
 *  Título, Preço de Capa, Promoção, Desconto (procura pelo cabeçalho; se não achar, usa a ordem padrão). */
export function lerPlanilha(buf: Buffer): LinhaExclusiva[] {
  const wb = XLSX.read(buf, { type: "buffer", cellDates: true, raw: false, codepage: 65001 });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: "" });
  const iCab = rows.findIndex((r) => r.some((c) => /asin/i.test(String(c))));
  const cab = (iCab >= 0 ? rows[iCab] : []).map((c) => String(c).toLowerCase().trim());
  const col = (re: RegExp, padrao: number) => { const i = cab.findIndex((c) => re.test(c)); return i >= 0 ? i : padrao; };
  const C = {
    di: col(/data.*in[ií]c/, 0), hi: col(/hora.*in[ií]c/, 1), df: col(/data.*(fin|fim)/, 2), hf: col(/hora.*(fin|fim)/, 3),
    asin: col(/^asin/, 4), cat: col(/^categ/, 5), tit: col(/^(t[ií]tulo|produto|nome)/, 6), capa: col(/capa|^pre[çc]o original|^de/, 7),
    promo: col(/^(promo|pre[çc]o promo|por)/, 8), desc: col(/^desconto/, 9),
  };
  const out: LinhaExclusiva[] = [];
  for (const r of rows.slice(iCab + 1)) {
    const asin = String(r[C.asin] ?? "").trim().toUpperCase();
    if (!/^[A-Z0-9]{10}$/.test(asin)) continue;
    const di = data(r[C.di]); const df = data(r[C.df]);
    if (!di || !df) continue;
    const capa = num(r[C.capa]); const promo = num(r[C.promo]);
    let desconto = num(r[C.desc]) ?? 0;
    if (desconto > 0 && desconto < 1) desconto = Math.round(desconto * 100);
    if (!desconto && capa && promo && promo < capa) desconto = Math.round((1 - promo / capa) * 100);
    out.push({
      inicio: quando(di, horaDe(r[C.hi])), fim: quando(df, r[C.hf] === "" ? [23, 59] : horaDe(r[C.hf])), asin,
      categoria: String(r[C.cat] ?? "").trim(), titulo: String(r[C.tit] ?? "").trim(), capa, promo, desconto,
    });
  }
  return out;
}

const BEBE = /\bbeb[eê]s?\b|infantil|fralda|mamadeira|chupeta|rec[eé]m[- ]nascido|gestante|maternidade|amament|len[çc]o umedecido|carrinho de beb|ber[çc]o|banheira|baby\b|kids\b|crian[çc]a/i;
const GEEK_CAT = /eletr[ôo]nic|gamer|computador|inform[áa]tica|celular|c[âa]mera|brinquedo|^casa$|cozinha|ferramenta|eletrodom|autom[óo]tivo|m[úu]sica/i;
const POP = /mang[áa]|\bhq\b|quadrinho|graphic novel|marvel|\bdc\b|batman|superman|homem[- ]aranha|spider|star wars|harry potter|tolkien|senhor dos an[ée]is|hobbit|game of thrones|stephen king|anime|naruto|one piece|dragon ball|pok[ée]mon|zelda|minecraft|lego|geek|nerd|fic[çc][ãa]o cient|duna\b|sandman|watchmen|turma da m[ôo]nica/i;
export const ehGeek = (o: LinhaExclusiva) => !BEBE.test(o.titulo) && (GEEK_CAT.test(o.categoria) || (/livro/i.test(o.categoria) && POP.test(o.titulo)));
export const ehMaternas = (o: LinhaExclusiva) => !/livro/i.test(o.categoria) && (/beb[eê]/i.test(o.categoria) || BEBE.test(o.titulo));

export function tituloCurto(t: string) {
  let s = t.split(/\s[|–]\s/)[0].trim();
  if (s.length > 110) s = s.slice(0, 110).replace(/[\s,;:-]+\S*$/, "") + "…";
  return s;
}

interface ItemAmazon { asin: string; titulo: string; imagem: string | null; preco: number | null; esgotado: boolean }
/** Foto, título, preço e estoque de até N ASINs pela Creators API (10 por chamada, ~1/s). */
export async function amazonItens(asins: string[]): Promise<Record<string, ItemAmazon>> {
  const id = process.env.AMAZON_ACCESS_KEY, secret = process.env.AMAZON_SECRET_KEY;
  const tag = process.env.AMAZON_PARTNER_TAG || "manualdorec0c-20";
  if (!id || !secret) throw new Error("credenciais da Amazon (Creators API) não configuradas no painel");
  const t = await fetch("https://api.amazon.com/auth/o2/token", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ grant_type: "client_credentials", client_id: id, client_secret: secret, scope: "creatorsapi::default" }),
    signal: AbortSignal.timeout(10000),
  });
  const token = (await t.json())?.access_token;
  if (!token) throw new Error("a Amazon não devolveu o token da Creators API");
  const out: Record<string, ItemAmazon> = {};
  for (let i = 0; i < asins.length; i += 10) {
    const r = await fetch("https://creatorsapi.amazon/catalog/v1/getItems", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + token, "x-marketplace": "www.amazon.com.br" },
      body: JSON.stringify({ itemIds: asins.slice(i, i + 10), partnerTag: tag, marketplace: "www.amazon.com.br",
        resources: ["itemInfo.title", "images.primary.large", "offersV2.listings.availability", "offersV2.listings.price"] }),
      signal: AbortSignal.timeout(15000),
    }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const it of (j?.itemsResult?.items ?? []) as any[]) {
      const l = it.offersV2?.listings?.[0];
      out[it.asin] = {
        asin: it.asin, titulo: it.itemInfo?.title?.displayValue || "", imagem: it.images?.primary?.large?.url || null,
        preco: l?.price?.money?.amount ?? null, esgotado: !l || l.availability?.type === "OUT_OF_STOCK",
      };
    }
    if (i + 10 < asins.length) await new Promise((res) => setTimeout(res, 1100));
  }
  return out;
}

/** Monta a linha de offers de uma exclusiva. */
export function ofertaExclusiva(p: {
  asin: string; perfilId: string; perfilSlug: string; titulo: string; imagem: string; promo: number | null; capa: number | null;
  desconto: number | null; inicio: string; fim: string; fonte: string; categoria?: string; userId?: string;
}) {
  const marca = p.perfilSlug === "buscador-geek" ? "g" : "m";
  return {
    source: "manual", source_ref: `exclusiva_amazon_${p.asin}_${p.inicio.slice(0, 10)}_${marca}`, platform: "amazon",
    url: `https://www.amazon.com.br/dp/${p.asin}`, affiliate_url: `https://www.amazon.com.br/dp/${p.asin}?tag=manualdorec0c-20`,
    title: tituloCurto(p.titulo), price_current: p.promo, price_original: p.capa, discount_pct: p.desconto != null ? Math.round(p.desconto) : null,
    image_url: p.imagem, perfil_id: p.perfilId, kind: "produto", status: "draft", source_channel: "amazon exclusivas",
    promo_meta: { exclusiva: { inicio: p.inicio, fim: p.fim, preco_promo: p.promo, fonte: p.fonte }, ...(p.categoria ? { categoria_amazon: p.categoria } : {}) },
    created_by: p.userId ?? null,
  };
}

export const pad2 = pad;
