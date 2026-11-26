/**
 * Regras de produto por campanha (26/Nov, Bruno: "quero a segunda opção, mas quero por campanha"): ficam em
 * campaigns.regras (jsonb), editáveis na aba Regras da campanha no painel. O auto-enqueue lê daqui.
 *
 * Palavras: comparadas sem acento e sem maiúscula, no começo de uma palavra do título ("toalha" pega "toalhas",
 * "panela" pega "panelas"; "pote" não pega "capote"). Duas palavras juntas valem como trecho ("jogo de cama").
 *
 * O que NÃO está aqui (fica fixo no código, por segurança): bebê fora do Lar/Mãe, masculino fora do Mãe,
 * brinquedo fora do Brunotropolis, lista de bloqueio, venda internacional, "De" falso.
 */

export interface CategoriaRegra {
  nome: string;
  palavras: string[];
  /** % dos posts do dia que a categoria deve ter (cota). 0 = sem cota. */
  meta: number;
  /** % máximo dos posts do dia (teto). null = sem teto. */
  teto?: number | null;
  preco_min?: number | null;
  preco_max?: number | null;
  /** desconto mínimo em % pra entrar na cota */
  desconto_min?: number | null;
  /** escolhe produto de marca boa antes do genérico */
  marca_primeiro?: boolean;
  /** só entra na cota se tiver marca boa */
  so_marca?: boolean;
  /** loja do link (ex.: "natura"): a categoria vale pra ofertas dessa loja, além das palavras */
  loja?: string | null;
  /** no máx. 2 do mesmo tipo (1ª palavra que casou) por dia */
  variar?: boolean;
}

export interface RegrasCampanha {
  /** só posta produto que bate em alguma categoria (cupom não conta) */
  so_categorias?: boolean;
  marcas: string[];
  categorias: CategoriaRegra[];
  /** % máximo de Shopee nos posts do dia */
  teto_shopee?: number | null;
  /** produto sem marca boa abaixo deste preço fica de fora (qualquer loja) */
  sem_marca_abaixo_de?: number | null;
  /** Shopee sem marca abaixo deste preço só com nota ≥4,8 e 1.000+ vendidos */
  shopee_generico_abaixo_de?: number | null;
  /** 26/Nov: palavras que tiram o produto da campanha (ex.: Enxoval = "fralda descartavel", "adulto") */
  nunca?: string[];
  /** lojas permitidas (amazon, ml, shopee, magalu, natura). Vazio = todas */
  lojas?: string[];
  /** só posta produto de marca boa */
  so_marcas?: boolean;
  /** Fraldas: só produto em promoção (menor preço do mês, desconto ≥15% ou bem abaixo da mediana) */
  so_promocao?: boolean;
}

/** loja da oferta pelo campo platform ou pelo link */
export function lojaDe(o: { platform?: string | null; url?: string | null; affiliate_url?: string | null; marketplace?: string | null }): string {
  const p = (o.platform || o.marketplace || "").toLowerCase();
  if (p) return p;
  const l = `${o.url ?? ""} ${o.affiliate_url ?? ""}`.toLowerCase();
  if (/natura/.test(l)) return "natura";
  if (/amazon|amzn/.test(l)) return "amazon";
  if (/mercadoliv|meli.la/.test(l)) return "ml";
  if (/shopee/.test(l)) return "shopee";
  if (/magalu|magazine/.test(l)) return "magalu";
  return "outra";
}

/** motivo pra campanha não aceitar a oferta pelas regras gerais (nunca, lojas, só marcas), ou null */
export function foraDasRegras(r: RegrasCampanha | null, o: { title?: string | null; platform?: string | null; url?: string | null; affiliate_url?: string | null; marketplace?: string | null }): string | null {
  if (!r) return null;
  const nunca = palavraQueCasou(r.nunca ?? [], o.title);
  if (nunca) return `palavra proibida: ${nunca}`;
  if (r.lojas?.length && !r.lojas.map((x) => x.toLowerCase()).includes(lojaDe(o))) return `loja fora da lista (${lojaDe(o)})`;
  if (r.so_marcas && !temMarca(r, o.title)) return "sem marca boa";
  return null;
}

export const norm = (s: string | null | undefined) => ` ${(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9%+&]+/g, " ").trim()} `;

const cacheRe = new Map<string, RegExp>();
function reDe(palavras: string[]): RegExp | null {
  const lista = palavras.map((p) => norm(p).trim()).filter(Boolean);
  if (!lista.length) return null;
  const chave = lista.join("|");
  let re = cacheRe.get(chave);
  if (!re) {
    // palavra curta (até 4 letras: mac, mam, nan, omo, vela) só vale inteira, com ou sem plural, pra "mac" não pegar
    // "maçã" nem "mam" pegar "mamadeira"; as maiores valem no começo da palavra ("toalha" pega "toalhas")
    re = new RegExp(` (${lista.map((p) => { const e = p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); const ws = e.split(" "); const meio = ws.map((w, i) => (i < ws.length - 1 ? `${w.replace(/s$/, "")}s?` : w)).join(" "); return p.length <= 4 ? `${meio}s?(?= )` : meio; }).join("|")})`); // plural no meio do trecho: "lenco umedecid" pega "lencos umedecidos"
    cacheRe.set(chave, re);
  }
  return re;
}

/** primeira palavra da lista que aparece no título (ou null) */
export function palavraQueCasou(palavras: string[], titulo: string | null | undefined): string | null {
  const re = reDe(palavras);
  if (!re) return null;
  const m = norm(titulo).match(re);
  return m ? m[1] : null;
}

export const temMarca = (r: RegrasCampanha, titulo: string | null | undefined) => !!palavraQueCasou(r.marcas ?? [], titulo);

interface OfertaR { title?: string | null; url?: string | null; affiliate_url?: string | null }
/** categoria da oferta (a primeira que casar, na ordem da lista) */
export function categoriaDe(r: RegrasCampanha, o: OfertaR): CategoriaRegra | null {
  const link = `${o.url ?? ""} ${o.affiliate_url ?? ""}`.toLowerCase();
  for (const c of r.categorias ?? []) {
    if (c.loja && link.includes(c.loja.toLowerCase())) return c;
    if (palavraQueCasou(c.palavras ?? [], o.title)) return c;
  }
  return null;
}

/** lê e limpa o JSON salvo (aceita % como 0-100) */
export function lerRegras(v: unknown): RegrasCampanha | null {
  if (!v || typeof v !== "object") return null;
  const r = v as RegrasCampanha;
  if (!Array.isArray(r.categorias)) return null;
  return {
    so_categorias: !!r.so_categorias,
    marcas: Array.isArray(r.marcas) ? r.marcas.map(String).filter(Boolean) : [],
    categorias: r.categorias.filter((c) => c && c.nome).map((c) => ({
      nome: String(c.nome), palavras: Array.isArray(c.palavras) ? c.palavras.map(String).filter(Boolean) : [],
      meta: Number(c.meta) || 0, teto: c.teto == null || c.teto === ("" as unknown) ? null : Number(c.teto),
      preco_min: c.preco_min == null || c.preco_min === ("" as unknown) ? null : Number(c.preco_min),
      preco_max: c.preco_max == null || c.preco_max === ("" as unknown) ? null : Number(c.preco_max),
      desconto_min: c.desconto_min == null || c.desconto_min === ("" as unknown) ? null : Number(c.desconto_min),
      marca_primeiro: !!c.marca_primeiro, so_marca: !!c.so_marca, loja: c.loja ? String(c.loja) : null, variar: !!c.variar,
    })),
    teto_shopee: r.teto_shopee == null || r.teto_shopee === ("" as unknown) ? null : Number(r.teto_shopee),
    sem_marca_abaixo_de: r.sem_marca_abaixo_de == null || r.sem_marca_abaixo_de === ("" as unknown) ? null : Number(r.sem_marca_abaixo_de),
    shopee_generico_abaixo_de: r.shopee_generico_abaixo_de == null || r.shopee_generico_abaixo_de === ("" as unknown) ? null : Number(r.shopee_generico_abaixo_de),
    nunca: Array.isArray(r.nunca) ? r.nunca.map(String).filter(Boolean) : [],
    lojas: Array.isArray(r.lojas) ? r.lojas.map((x) => String(x).toLowerCase().trim()).filter(Boolean) : [],
    so_marcas: !!r.so_marcas, so_promocao: !!r.so_promocao,
  };
}
