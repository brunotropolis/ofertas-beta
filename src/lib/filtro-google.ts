// 18/Nov (Bruno: "quero evitar as coisas muito discrepantes, tipo o produto é na média 150 reais e o marketplace
// manda que é de 500 por 150... mas manter um parâmetro pra não sair cortando as ofertas").
// Antes de postar, o Gemini pesquisa no Google o preço do produto nas lojas brasileiras e devolve o preço típico.
//  - "De" inflado (De muito acima do preço típico): o post SAI, mas sem o "De" e sem o "% OFF" falso.
//  - Preço "Por" muito acima do mercado: não posta (limite folgado, pra não cortar oferta boa).
//  - Sem resposta, poucas lojas ou erro: posta como está (o filtro nunca trava o post por falta de dado).
// Resultado guardado em promo_meta.google por 3 dias (campeão reposta sem pesquisar de novo).
import type { SupabaseClient } from "@supabase/supabase-js";

// ── PARÂMETROS (folgados de propósito; apertar aqui) ───────────────────────────────────────────────────
export const FILTRO_GOOGLE = {
  /** "De" acima de 1,8x o preço típico = "De" falso → tira o De e o % OFF do post (ex.: típico 150, "de 300 por 150") */
  DE_MAX: 1.8,
  /** "De" acima de 1,4x o MAIOR preço que já vimos do mesmo código de modelo (nosso banco, 60 dias) = De falso */
  DE_MAX_BANCO: 1.4,
  /** "Por" acima de 1,5x o preço típico E acima de 1,8x o menor preço achado = não posta */
  POR_MAX_TIPICO: 1.5,
  POR_MAX_MENOR: 1.8,
  /** mínimo de lojas achadas pra confiar na média */
  MIN_LOJAS: 3,
  /** só pesquisa quando o post promete desconto grande ou o produto é caro (economiza chamada) */
  PESQUISA_SE_DESCONTO: 30,
  PESQUISA_SE_PRECO: 150,
  CACHE_MS: 3 * 24 * 3600_000,
  TIMEOUT_MS: 30_000,
};

interface OfertaG {
  id: string;
  title: string | null;
  kind?: string | null;
  price_current: number | null;
  price_original: number | null;
  discount_pct: number | null;
  url?: string | null;
  ai_caption?: string | null;
  promo_meta?: Record<string, unknown> | null;
}
interface Pesquisa { tipico: number | null; menor: number | null; lojas: number; checked_at: string }

export type ResultadoGoogle =
  | { ok: true; acao: "nada" | "tirou_de" | "sem_dado"; motivo: string; pesquisa?: Pesquisa }
  | { ok: false; motivo: string; pesquisa: Pesquisa };

async function pesquisar(titulo: string): Promise<Pesquisa | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const prompt = `Pesquise no Google o preço atual, em reais, deste produto em lojas brasileiras (Amazon, Mercado Livre, Shopee, Magalu, Americanas, Casas Bahia, farmácias, lojas oficiais da marca):
"${titulo}"
Considere só o MESMO produto (mesma marca, modelo, tamanho e quantidade de unidades). Ignore anúncio usado, kit diferente e preço "de" riscado.
Responda SÓ um JSON numa linha, sem texto antes ou depois: {"tipico": <preço mais comum à venda hoje>, "menor": <menor preço achado>, "lojas": <quantas lojas diferentes com preço achou>}
Se não achar o produto com segurança, responda {"tipico": null, "menor": null, "lojas": 0}.`;
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], tools: [{ google_search: {} }], generationConfig: { temperature: 0 } }),
    signal: AbortSignal.timeout(FILTRO_GOOGLE.TIMEOUT_MS),
  });
  const j = await r.json();
  const txt: string = (j?.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("");
  const m = txt.match(/\{[^{}]*"tipico"[^{}]*\}/);
  if (!m) return null;
  const d = JSON.parse(m[0]);
  const n = (v: unknown) => (typeof v === "number" && v > 0 ? v : typeof v === "string" && +v > 0 ? +v : null);
  return { tipico: n(d.tipico), menor: n(d.menor), lojas: Number(d.lojas) || 0, checked_at: new Date().toISOString() };
}

export async function filtroGoogle(db: SupabaseClient, o: OfertaG): Promise<ResultadoGoogle> {
  const P = FILTRO_GOOGLE;
  const por = o.price_current, de = o.price_original;
  if (o.kind === "cupom" || !o.title || !por) return { ok: true, acao: "nada", motivo: "não se aplica" };
  const desconto = de && de > por ? Math.round((1 - por / de) * 100) : 0;
  if (desconto < P.PESQUISA_SE_DESCONTO && por < P.PESQUISA_SE_PRECO) return { ok: true, acao: "nada", motivo: "desconto pequeno e preço baixo, não pesquisa" };

  // 25/Nov (Bruno: Air Fryer Philco PAF15A "de R$ 999 por R$ 449" no Geek; o Gemini achou "típico R$ 1.022" e deixou
  // passar, mas no nosso banco o mesmo modelo estava a R$ 536 no ML, R$ 592 na Amazon, R$ 614 na Shopee).
  // Segunda conferência, sem Google: preço do MESMO código de modelo nas ofertas dos últimos 60 dias (qualquer loja).
  // "De" acima de 1,4x o maior preço que já vimos = De falso → sai sem De e sem % OFF.
  if (de && de > por) {
    const nosso = await precoNoBanco(db, o);
    if (nosso && de > nosso.max * P.DE_MAX_BANCO) return tirarDe(db, o, de, `"De" R$ ${de} inflado (modelo ${nosso.codigo} já visto até R$ ${nosso.max} em ${nosso.n} ofertas): post sai sem o De`);
  }

  const meta = (o.promo_meta ?? {}) as Record<string, unknown>;
  let g = meta.google as Pesquisa | undefined;
  if (!g || Date.now() - Date.parse(g.checked_at) > P.CACHE_MS) {
    try { g = (await pesquisar(o.title)) ?? undefined; } catch (e) { console.warn("[filtro-google]", o.id, e instanceof Error ? e.message : e); g = undefined; }
    if (g) await db.from("offers").update({ promo_meta: { ...meta, google: g } }).eq("id", o.id);
  }
  if (g && !g.tipico && g.menor) g = { ...g, tipico: g.menor }; // Gemini às vezes só acha o menor preço
  if (!g || !g.tipico || g.lojas < P.MIN_LOJAS) return { ok: true, acao: "sem_dado", motivo: "Google sem preço confiável, posta como está", pesquisa: g };

  if (por > g.tipico * P.POR_MAX_TIPICO && (!g.menor || por > g.menor * P.POR_MAX_MENOR)) {
    return { ok: false, motivo: `preço acima do mercado (R$ ${por} x típico R$ ${g.tipico}, menor R$ ${g.menor ?? "-"})`, pesquisa: g };
  }
  if (de && de > por && de > g.tipico * P.DE_MAX) {
    return { ...(await tirarDe(db, o, de, `"De" R$ ${de} inflado (típico R$ ${g.tipico}): post sai sem o De`)), pesquisa: g };
  }
  return { ok: true, acao: "nada", motivo: `confere com o mercado (típico R$ ${g.tipico})`, pesquisa: g };
}

async function tirarDe(db: SupabaseClient, o: OfertaG, de: number, motivo: string): Promise<ResultadoGoogle> {
  const patch: Record<string, unknown> = { price_original: null, discount_pct: null };
  if (o.ai_caption && /R\$\s*\d|%/.test(o.ai_caption)) patch.ai_caption = null; // frase da IA pode citar o De/% falso
  await db.from("offers").update(patch).eq("id", o.id);
  o.price_original = null;
  o.discount_pct = null;
  if (patch.ai_caption === null) o.ai_caption = null;
  return { ok: true, acao: "tirou_de", motivo };
}

/** código de modelo no título (PAF15A, B0DN3BL2MF, SM-A155...): letras E números, 5+ caracteres, sem ser medida (15L, 220V, 128GB) */
export function codigoModelo(titulo: string | null | undefined): string | null {
  const MEDIDA = /^\d+([.,]\d+)?(L|ML|V|W|KG|G|UN|UNID|CM|MM|M|GB|TB|MAH|HZ|P|X|PCS|PECAS|LITROS|POL)$/;
  for (const t of (titulo || "").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^A-Z0-9-]+/)) {
    const s = t.replace(/^-+|-+$/g, "");
    if (s.length >= 5 && /\d/.test(s) && /[A-Z]/.test(s) && !MEDIDA.test(s) && !/^\d+X\d+(X\d+)?(CM|MM|M)?$/.test(s)) return s; // 50X70CM = medida
  }
  return null;
}

/** id do produto na loja (ASIN da Amazon, MLB do ML, item da Shopee): mesmo id = mesmo produto, sem depender do título */
export function idProduto(url: string | null | undefined): string | null {
  const u = url || "";
  const m = u.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i) || u.match(/\b(MLB-?\d{6,})/i) || u.match(/[.\/](\d{6,}[.\/]\d{6,})(?:\?|$)/);
  return m ? m[1].replace("-", "").replace("/", ".").toUpperCase() : null; // Shopee: "i.loja.item" e "/product/loja/item" viram o mesmo
}

async function precoNoBanco(db: SupabaseClient, o: OfertaG): Promise<{ codigo: string; max: number; n: number } | null> {
  const desde = new Date(Date.now() - 60 * 86400_000).toISOString();
  // 25/Nov (Bruno: Airfryer Philips "Por R$ 309,90 / Custa R$ 549,90", Google mostra R$ 267 a 361): o título do
  // Telegram veio sem código de modelo, então a conferência pelo título não rodava. O id do produto na loja (ASIN)
  // resolve: mesmo id = mesmo produto. Só conta se a gente acompanha o produto há 7+ dias (visto só agora na
  // promoção não diz o preço normal: Kindle/iPhone com De verdadeiro seriam cortados).
  const id = idProduto(o.url);
  if (id) {
    const { data } = await db.from("offers").select("url, price_current, created_at")
      .ilike("url", `%${id.match(/\d{6,}$/)?.[0] ?? id}%`).not("price_current", "is", null).neq("id", o.id)
      .gte("created_at", desde).limit(50);
    const vistos = ((data ?? []) as { url: string; price_current: number; created_at: string }[])
      .filter((x) => idProduto(x.url) === id && Number(x.price_current) > 0);
    if (vistos.some((x) => Date.now() - Date.parse(x.created_at) > 7 * 86400_000)) {
      const precos = vistos.map((x) => Number(x.price_current));
      return { codigo: id, max: Math.max(...precos), n: precos.length };
    }
  }
  const codigo = codigoModelo(o.title);
  if (!codigo) return null;
  const { data } = await db.from("offers").select("id, title, price_current")
    .ilike("title", `%${codigo}%`).not("price_current", "is", null).neq("id", o.id)
    .gte("created_at", desde).limit(50);
  const precos = ((data ?? []) as { title: string; price_current: number }[])
    .filter((x) => codigoModelo(x.title) === codigo).map((x) => Number(x.price_current)).filter((v) => v > 0);
  if (precos.length < 2) return null; // 1 só pode ser outra variação/preço errado: precisa de 2+ pra confiar
  return { codigo, max: Math.max(...precos), n: precos.length };
}
