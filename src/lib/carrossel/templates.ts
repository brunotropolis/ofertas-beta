// Fábrica de Afiliados — templates de carrossel (4:5, 1080x1350).
// Cada template = layout das etiquetas (HTML por cima, nunca texto dentro da imagem)
// + direção da cena que a IA vai gerar (entra quando ligar o renderizador no servidor).
// Mapeados de 7 posts de referência do Bruno (26/Out/2026).

export type TemplateId =
  | "garimpo-dourado"
  | "cantinho-pinterest"
  | "vitrine-editorial"
  | "na-mao-codigo"
  | "colecao-tematica";

export interface CarrosselTemplate {
  id: TemplateId;
  nome: string;
  resumo: string;
  inspiracao: string; // perfis de referência
  capaPadrao: string;
  cena: string; // direção de arte da cena (prompt base pro gerador)
  etiqueta: string; // como o produto é rotulado
  ctaFinal: boolean; // tem lâmina final "comenta X"
  produtosSugeridos: [number, number];
}

export const TEMPLATES: CarrosselTemplate[] = [
  {
    id: "garimpo-dourado",
    nome: "Garimpo Dourado",
    resumo: "Ambiente planejado com luz de fim de tarde. Produto dentro da cena e etiqueta fininha com preço.",
    inspiracao: "@eusamaracrr",
    capaPadrao: "garimpos para o quarto do bebê",
    cena: "quarto/ambiente planejado bege e madeira clara, luz dourada de fim de tarde entrando pela janela, sombras de folhas, plantas, fotorrealista, câmera na altura dos olhos, o produto da referência posicionado naturalmente na cena",
    etiqueta: "nome curto + preço em destaque, com linha fina e bolinha apontando pro produto",
    ctaFinal: false,
    produtosSugeridos: [8, 20],
  },
  {
    id: "cantinho-pinterest",
    nome: "Cantinho Pinterest",
    resumo: "Cara de foto de celular em casa real e colorida. Etiqueta branca minúscula, bem discreta.",
    inspiracao: "@cazzinha.co",
    capaPadrao: "achados nada óbvios pro quarto do bebê",
    cena: "casa real estilo Pinterest, cores vivas (rosa, terracota, verde), objetos de decoração com personalidade, luz natural de janela, aparência de foto tirada no celular, o produto da referência em uso no ambiente",
    etiqueta: "nome + preço pequenos em branco, com sombra, presos num tracinho vertical",
    ctaFinal: false,
    produtosSugeridos: [8, 12],
  },
  {
    id: "vitrine-editorial",
    nome: "Vitrine Editorial",
    resumo: "Close do produto com sombra de janela. Nome grande em negrito e a loja e o preço embaixo.",
    inspiracao: "@cazzacuradoriaa",
    capaPadrao: "minha lista preferida pro enxoval",
    cena: "close do produto da referência sobre madeira ou tecido, luz de sol entrando de lado com sombras de persiana, tons quentes e terrosos, fundo desfocado, fotografia de catálogo",
    etiqueta: "nome em letra grande e grossa, minúscula + linha \"loja | R$ preço\"",
    ctaFinal: false,
    produtosSugeridos: [6, 9],
  },
  {
    id: "na-mao-codigo",
    nome: "Na Mão + Código",
    resumo: "Mão segurando o produto, sempre no mesmo cenário. Título manuscrito e um código pra pedir o link.",
    inspiracao: "@vih_cats · @achadinhosdadarla_",
    capaPadrao: "coisas de mãe que achei na shopee",
    cena: "mão feminina com unhas feitas segurando o produto da referência em primeiro plano, MESMO cenário de fundo em todas as lâminas (quarto rosa com quadros na parede e luzinha), fundo levemente desfocado",
    etiqueta: "título manuscrito grande no topo + pílula \"id ABC-DEF-GHI\" + brilhinhos",
    ctaFinal: false,
    produtosSugeridos: [6, 10],
  },
  {
    id: "colecao-tematica",
    nome: "Coleção Temática",
    resumo: "Cena de data comemorativa (Natal, Dia das Mães, chá de bebê). Título em arco e lâmina final pedindo a palavra.",
    inspiracao: "@promoseachadinhoss.br",
    capaPadrao: "chá de bebê com a shopee",
    cena: "cena temática da data (decoração, mesa posta, cores da ocasião), luz quente e aconchegante, o produto da referência como protagonista em primeiro plano",
    etiqueta: "nome curto em arco, pequeno, sobre o produto; última lâmina \"Gostou? comente PALAVRA\"",
    ctaFinal: true,
    produtosSugeridos: [8, 12],
  },
];

export function getTemplate(id: TemplateId) {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];
}

// ─── Orçamento ────────────────────────────────────────────────────────────────
// Preços do ranking do ia-lab (OpenRouter, 17/Out/2026).
export const CUSTO = {
  imagemFinal: 0.045, // Seedream 5 Pro, por cena (GPT-Image 2 ~0,05 no fallback de marca)
  imagemRascunho: 0.03, // Qwen Image 3
  legenda: 0.0001, // Gemini 3.1 Flash Lite
  taxaRecarga: 0.055, // OpenRouter cobra 5,5% na recarga
  margemRefazer: 0.2, // ~1 em 5 cenas sai ruim e é gerada de novo
  cambio: 5.5, // R$ por US$ (referência)
};

export function orcamento(templateId: TemplateId, nProdutos: number, opts?: { rascunho?: boolean }) {
  const t = getTemplate(templateId);
  // capa = 1 cena; CTA final reaproveita a cena da capa (grátis)
  const cenas = nProdutos + 1;
  const precoCena = opts?.rascunho ? CUSTO.imagemRascunho : CUSTO.imagemFinal;
  const usd = (cenas * precoCena * (1 + CUSTO.margemRefazer) + CUSTO.legenda) * (1 + CUSTO.taxaRecarga);
  return {
    cenas,
    laminas: cenas + (t.ctaFinal ? 1 : 0),
    usd,
    brl: usd * CUSTO.cambio,
  };
}

export const fmtUSD = (v: number) => `US$ ${v.toFixed(2).replace(".", ",")}`;
export const fmtBRL = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`;
