/**
 * Cache curto em memória do processo (19/Out) — pra rotas pesadas que não mudam a cada segundo
 * (vendas consultam a Shopee ao vivo e somam milhares de linhas; saúde dos números faz ~30 consultas).
 * Some no redeploy; cada rota decide o tempo. `?fresh=1` na URL pula o cache.
 */
const store = new Map<string, { exp: number; val: unknown }>();

export function cacheGet<T>(key: string): T | null {
  const hit = store.get(key);
  if (!hit) return null;
  if (hit.exp < Date.now()) { store.delete(key); return null; }
  return hit.val as T;
}

export function cacheSet(key: string, val: unknown, ttlMs: number) {
  if (store.size > 500) store.clear();
  store.set(key, { exp: Date.now() + ttlMs, val });
}

/** Responde do cache se tiver; senão roda `gerar` e guarda as respostas 200. */
export async function comCache(request: Request, prefixo: string, ttlMs: number, gerar: () => Promise<Response>): Promise<Response> {
  const url = new URL(request.url);
  const fresh = url.searchParams.get("fresh") === "1";
  url.searchParams.delete("fresh");
  const key = `${prefixo}${url.search}`;
  if (!fresh) {
    const hit = cacheGet<unknown>(key);
    if (hit) return Response.json(hit, { headers: { "x-cache": "hit" } });
  }
  const res = await gerar();
  if (res.ok) cacheSet(key, await res.clone().json(), ttlMs);
  return res;
}
