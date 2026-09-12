// Normalização de produto + categoria (cross-plataforma) para a aba Análise.
// Nomes crus (ML/Amazon/Shopee) → produto normalizado (bucket) + categoria.
// Categoria: usa a regra por keyword; se não bater, cai na categoria nativa (ML/Amazon trazem;
// Shopee não) e por fim "Outros". Taxonomia baseada na análise COMISSÃO 2026 — ajustável.

export interface Norm { product: string; category: string; }

// [regex no nome cru, produto normalizado, categoria]
const RULES: [RegExp, string, string][] = [
  // Agregado que a Amazon não detalha (produtos de baixo volume)
  [/outros produtos.*amazon|^others$/i, "Outros (Amazon — baixo volume)", "Outros"],
  // Fralda (por tamanho)
  [/fralda.*\b(rn|recem|rec[ée]m)\b|\brn\b.*fralda/i, "Fralda RN", "Fralda"],
  [/fralda.*\bxxg\b/i, "Fralda XXG", "Fralda"],
  [/fralda.*\bxg\b/i, "Fralda XG", "Fralda"],
  [/fralda.*\bg\b|fralda.*grande/i, "Fralda G", "Fralda"],
  [/fralda.*\bm\b|fralda.*m[ée]dia/i, "Fralda M", "Fralda"],
  [/fralda.*\bp\b|fralda.*pequena/i, "Fralda P", "Fralda"],
  [/fralda.*pano/i, "Fralda de pano", "Fralda"],
  [/fralda/i, "Fralda (outra)", "Fralda"],
  // Higiene
  [/len[çc]o.*umedecid|toalha.*umedecid|len[çc]o.*úmid/i, "Lenço umedecido", "Higiene"],
  [/algod[ãa]o/i, "Algodão", "Higiene"],
  [/\bsab[ãa]o\b|sabonete/i, "Sabão/Sabonete", "Higiene"],
  [/shampoo|condicionador/i, "Shampoo/Condicionador", "Higiene"],
  [/lixa.*el[ée]tr|corta.*unha|cortador.*unha|tesoura.*unha/i, "Cuidado unha", "Higiene"],
  [/haste.*flex|cotonete/i, "Haste flexível", "Higiene"],
  // Higiene/Pele
  [/bepantol|hipogl[óo]s|assadura|pomada/i, "Pomada assadura", "Higiene/Pele"],
  [/mustela|hidratante|weleda|creme corporal|[óo]leo|granado|nivea|loç[ãa]o/i, "Hidratante/Óleo", "Higiene/Pele"],
  [/talco|amido de milho/i, "Talco", "Higiene/Pele"],
  // Desenvolvimento
  [/livro/i, "Livros infantil", "Desenvolvimento"],
  [/brinquedo|chocalho|m[óo]bile|mordedor|tapete.*atividad|mesa.*atividad|encaixe|empilha|pel[úu]cia|educativ/i, "Brinquedo/Desenv.", "Desenvolvimento"],
  // Alimentação
  [/mamadeira|aquecedor.*mamad|esteriliz/i, "Mamadeira/Acessório", "Alimentação"],
  [/babador|\bbib\b/i, "Babador", "Alimentação"],
  [/papinha|\bpote|potinho|copo.*transi|copo.*canudo|talher|prato|colher.*aliment|kit.*aliment|porta.*leite/i, "Alimentação (utensílio)", "Alimentação"],
  [/cadeir[ãa]o|cadeira.*aliment/i, "Cadeira de alimentação", "Alimentação"],
  // Amamentação
  [/suti[ãa].*amament|suti[ãa].*gestant/i, "Sutiã amamentação", "Amamentação"],
  [/absorvente.*seio|concha.*amament|protetor.*mamilo|protetor.*seio|rosquinha.*amament/i, "Protetor de seio", "Amamentação"],
  [/bomba.*leite|extrator.*leite|coletor.*leite/i, "Bomba/Coletor leite", "Amamentação"],
  [/armazenar.*leite|saco.*leite|pote.*leite/i, "Armazenar leite", "Amamentação"],
  // Enxoval/Roupa
  [/\bbody\b|bodie|macac[ãa]o|conjunto|\broupa|mijã|pijama|saída.*maternid/i, "Roupa/Body/Macacão", "Enxoval/Roupa"],
  [/\bmeia|\bmei[ãa]o/i, "Meias", "Enxoval/Roupa"],
  [/cal[çc]ad|t[êe]nis|sapat|sandália|pantufa/i, "Calçado", "Enxoval/Roupa"],
  [/touca|gorro|luva/i, "Touca/Luva", "Enxoval/Roupa"],
  [/la[çc]o|faixa.*cabelo|tiara/i, "Laço/Faixa", "Enxoval/Roupa"],
  [/toalha.*banho|toalha.*capuz|roup[ãa]o/i, "Toalha de banho", "Enxoval/Roupa"],
  // Sono
  [/len[çc]ol/i, "Lençol", "Sono"],
  [/travesseiro|almofada|antirrefluxo|anti.?refluxo/i, "Travesseiro/Almofada", "Sono"],
  [/cobertor|manta|coberdrom|sherpa/i, "Cobertor/Manta", "Sono"],
  [/ninho|redutor.*ber[çc]|redutor.*bebê/i, "Ninho/Redutor", "Sono"],
  [/ru[íi]do branco|sound|m[áa]quina.*som/i, "Ruído branco", "Sono"],
  [/ber[çc]o|moisés|mini.?ber[çc]/i, "Berço/Moisés", "Sono"],
  // Segurança
  [/mosquiteiro|tela.*ber[çc]|mosquit/i, "Mosquiteiro", "Segurança"],
  [/protetor.*tomada/i, "Protetor de tomada", "Segurança"],
  [/trava.*(porta|gaveta|geladeira|arm[áa]rio)/i, "Trava segurança", "Segurança"],
  [/bab[áa].*eletr[ôo]nica|c[âa]mera.*bebê|monitor.*bebê/i, "Babá eletrônica", "Segurança"],
  [/protetor.*quina|protetor.*canto/i, "Protetor de quina", "Segurança"],
  // Saúde
  [/term[ôo]metro/i, "Termômetro", "Saúde"],
  [/aspirador.*nasal|aspirador.*nariz/i, "Aspirador nasal", "Saúde"],
  [/balan[çc]a.*bebê|balan[çc]a.*pedi/i, "Balança bebê", "Saúde"],
  [/soro.*fisio|umidificador|nebuliz/i, "Soro/Umidificador", "Saúde"],
  // Passeio/Transporte
  [/bebê.*conforto|beb[êe].?conforto/i, "Bebê conforto", "Passeio"],
  [/carrinho.*bebê|carrinho.*passeio/i, "Carrinho", "Passeio"],
  [/canguru|sling|wrap|ergon[ôo]mic/i, "Canguru/Sling", "Passeio"],
  [/cadeira.*carro|cadeirinha.*carro|assento.*carro|isofix/i, "Cadeira p/ carro", "Passeio"],
  [/banheira|ofur[ôo]|assento.*banho/i, "Banheira", "Higiene"],
  // Sol/Verão
  [/protetor solar|filtro solar/i, "Protetor solar", "Verão/Passeio"],
  [/[óo]culos.*sol|[óo]culos.*bebê/i, "Óculos", "Verão/Passeio"],
  [/repelente/i, "Repelente", "Verão/Passeio"],
  // Pós-parto
  [/cinta.*p[óo]s|cinta.*modelad|faja|modeladora.*p[óo]s/i, "Cinta pós-parto", "Pós-parto"],
  // Organização
  [/cesto|organizador|caixa.*organiz|trocador/i, "Organização/Trocador", "Enxoval"],
];

// Categorias-mãe (nossas). Toda categoria (keyword OU nativa ML/Amazon) é consolidada nestas.
const MOTHER = new Set([
  "Fralda", "Higiene", "Higiene/Pele", "Amamentação", "Alimentação", "Sono",
  "Desenvolvimento", "Enxoval/Roupa", "Passeio", "Segurança", "Saúde", "Verão/Passeio", "Pós-parto", "Outros",
]);
// categoria nativa (ML/Amazon) → nossa categoria-mãe
const CAT_MAP: [RegExp, string][] = [
  [/fralda/i, "Fralda"],
  [/amamenta/i, "Amamentação"],
  [/aliment|papinha|mamadeira/i, "Alimentação"],
  [/passeio|transport|carrinho|bebê.?conforto|cadeira.*(auto|carro)/i, "Passeio"],
  [/seguran/i, "Segurança"],
  [/quarto|sono|ber[çc]|dormir|c[óo]modo|enxoval.*ber/i, "Sono"],
  [/roupa|vestu[áa]rio|cal[çc]ad|camis|\bbody|moda|acess[óo]rio.*(roupa|moda)|sapat|meia/i, "Enxoval/Roupa"],
  [/brinq|desenvolv|livro|educa|pel[úu]cia|beb[êe].*quarto de bebê/i, "Desenvolvimento"],
  [/sa[úu]de|term[ôo]metro|nasal|inalad/i, "Saúde"],
  [/higiene|cuidado|resid[êe]ncia|farm|banho|beleza|perfum/i, "Higiene/Pele"],
];
function toMother(cat: string | null | undefined): string {
  if (!cat) return "Outros";
  if (MOTHER.has(cat)) return cat;
  for (const [rx, m] of CAT_MAP) if (rx.test(cat)) return m;
  return "Outros";
}

function cleanName(raw: string): string {
  // fallback de produto: primeiras palavras significativas, sem tamanhos/qtd
  return (raw || "")
    .replace(/\b\d+\s*(un|und|unidades?|pe[çc]as?|pares?|kg|g|ml|l|cm|m)\b/gi, "")
    .split(/[,\-|(]/)[0]
    .trim()
    .split(/\s+/)
    .slice(0, 4)
    .join(" ") || "(sem nome)";
}

export function normalize(nameRaw: string | null | undefined, nativeCategory?: string | null): Norm {
  const name = (nameRaw || "").toString();
  for (const [rx, product, category] of RULES) if (rx.test(name)) return { product, category };
  // sem regra de produto: categoria vem da nativa (ML/Amazon) consolidada na mãe; produto = nome cru enxuto
  return { product: cleanName(name), category: toMother(nativeCategory) };
}
