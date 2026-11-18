// Lojas que a extensão "Buscador Geek" sabe mandar o login (18/Nov/2026). Fonte única: a rota valida por aqui e a
// extensão recebe esta lista em GET /api/extensao/eu (não precisa publicar versão nova da extensão pra loja nova).
//
// LOJA NOVA (ex.: Magalu, Natura):
//   1. acrescentar aqui (id curto, domínio, cookies que mudam quando o login renova, cookies que provam que está logado);
//   2. o domínio precisa estar no `optional_host_permissions` do manifest da extensão (já tem magazineluiza,
//      magazinevoce, natura, shopee, aliexpress). Se for um domínio fora dessa lista, aí sim sobe versão nova na loja;
//   3. quem lê a sessão (gerador de link) busca em GET /api/extensao/sessao?perfil=&loja=<id> como ML/Amazon.
// A pessoa vê a loja nova no popup e clica "Permitir" uma vez (o Chrome pede a permissão do site).
export type LojaSessao = {
  id: string;
  nome: string;
  site: string; // de onde a extensão lê os cookies
  dominio: string;
  chaves: string[]; // cookies de login: quando mudam, a extensão manda de novo
  obrigatorio: string[]; // pelo menos um precisa existir (senão "não está logado")
};

export const LOJAS_SESSAO: LojaSessao[] = [
  {
    id: "ml",
    nome: "Mercado Livre",
    site: "https://www.mercadolivre.com.br/",
    dominio: "mercadolivre.com.br",
    chaves: ["ssid", "nsa_rotok", "orguseridp"],
    obrigatorio: ["ssid"],
  },
  {
    id: "amazon",
    nome: "Amazon (associados)",
    site: "https://www.amazon.com.br/",
    dominio: "amazon.com.br",
    chaves: ["at-acbbr", "sess-at-acbbr", "session-token", "x-acbbr"],
    obrigatorio: ["at-acbbr", "session-token"],
  },
];

export const lojaSessao = (id: string) => LOJAS_SESSAO.find((l) => l.id === id) ?? null;

/** sessão mínima: pelo menos um dos cookies obrigatórios presente e tamanho razoável */
export function sessaoValida(loja: LojaSessao, cookie: string) {
  if (!cookie || cookie.length > 20000) return false;
  const nomes = new Set(cookie.split(/;\s*/).map((p) => p.split("=")[0].trim()));
  return loja.obrigatorio.some((k) => nomes.has(k));
}
