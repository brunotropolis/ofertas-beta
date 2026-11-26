/**
 * Lista de produtos que o robô NÃO posta + bloqueio de venda internacional (26/Nov, Bruno: "não quero mais nenhuma venda
 * internacional... consegue fazer no sistema uma blacklist para que possa adicionar caso encontre outros itens?").
 *
 * - Lista: tabela public.produtos_bloqueados (aba Bloqueados do painel). Termo = pedaço do título, sem acento e sem
 *   maiúscula; exceção opcional ("protetor de grade" exceto "tela respirável"); perfil vazio = vale pra todos.
 * - Internacional: Amazon pelo vendedor (Amazon Global, lido pelo Amazon Refresh e gravado em promo_meta.internacional);
 *   ML e Shopee pelo texto do anúncio/post (a API da Shopee e a página do ML não dizem de onde sai pro servidor).
 *   AliExpress, Temu e Shein nunca.
 * Usado no auto-enqueue (grupos, campeões, exclusivas), nos canais/enxoval e no dispatcher (última barreira antes de enviar).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export interface Bloqueio { termo: string; excecao: string | null; perfil_id: string | null; motivo: string | null }

const norm = (s: string | null | undefined) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");

let cache: { em: number; lista: Bloqueio[] } | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function carregarBloqueios(db: SupabaseClient<any>): Promise<Bloqueio[]> {
  if (cache && Date.now() - cache.em < 60_000) return cache.lista;
  const { data, error } = await db.from("produtos_bloqueados").select("termo, excecao, perfil_id, motivo").eq("ativo", true).limit(2000);
  if (error) { console.warn("[bloqueados]", error.message); return cache?.lista ?? []; }
  cache = { em: Date.now(), lista: (data ?? []) as Bloqueio[] };
  return cache.lista;
}

/** devolve o termo que bloqueou, ou null */
export function bloqueadoPorLista(lista: Bloqueio[], perfilId: string | null | undefined, titulo: string | null | undefined): string | null {
  const t = norm(titulo);
  if (!t) return null;
  for (const b of lista) {
    if (b.perfil_id && b.perfil_id !== perfilId) continue;
    const termo = norm(b.termo).trim();
    if (!termo || !t.includes(termo)) continue;
    const exc = (b.excecao || "").split("|").map((x) => norm(x).trim()).filter(Boolean);
    if (exc.some((e) => t.includes(e))) continue;
    return b.termo;
  }
  return null;
}

const INTERNACIONAL_TXT = /compra internacional|envio internacional|entrega internacional|frete internacional|vendido do exterior|enviado do exterior|envio do exterior|do exterior para o brasil|importa[cç][aã]o direta|cross ?border|amazon global|internacional\s*[🌎🌍✈]|aliexpress|\btemu\b|\bshein\b/i;
const LOJA_INTERNACIONAL = /aliexpress|s\.click\.aliexpress|temu\.com|shein\.com/i;

interface OfertaB {
  title?: string | null; extra_text?: string | null; platform?: string | null; url?: string | null; affiliate_url?: string | null;
  promo_meta?: Record<string, unknown> | null;
}
/** true quando a oferta é de venda internacional */
export function ehInternacional(o: OfertaB): boolean {
  const pm = (o.promo_meta ?? {}) as Record<string, unknown>;
  if (pm.internacional === true) return true;
  if (o.platform === "aliexpress" || LOJA_INTERNACIONAL.test(`${o.url ?? ""} ${o.affiliate_url ?? ""}`)) return true;
  return INTERNACIONAL_TXT.test(`${o.title ?? ""}\n${o.extra_text ?? ""}`);
}

/** motivo pra não postar (lista ou internacional), ou null */
export function motivoBloqueio(lista: Bloqueio[], perfilId: string | null | undefined, o: OfertaB): string | null {
  if (ehInternacional(o)) return "venda internacional";
  const t = bloqueadoPorLista(lista, perfilId, o.title);
  return t ? `lista de bloqueio: ${t}` : null;
}
