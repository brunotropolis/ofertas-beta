const fs = require("fs");
const D = __dirname + "/";
const E = Object.fromEntries(fs.readFileSync("D:/CLAUDE/.env.meta", "utf8").split(/\r?\n/).map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]));
const K = E.SUPABASE_SERVICE_ROLE_OFERTAS_BETA, U = "https://qkherjtsvakmpkxebuwy.supabase.co/rest/v1/", H = { apikey: K, Authorization: "Bearer " + K };
const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const posts = fs.readFileSync("D:/CLAUDE/ofertas-beta/scripts/tio-patinhas/historico/posts-grupo5-2026.jsonl", "utf8").trim().split("\n").map(JSON.parse);
const PER = {
  "Abril (equipe)": (d) => d >= "2026-04-01" && d <= "2026-04-30",
  "Julho (equipe)": (d) => d >= "2026-07-01" && d <= "2026-07-31",
  "Agosto (equipe)": (d) => d >= "2026-08-01" && d <= "2026-08-31",
  "Hoje (robô, 12 a 25/11)": (d) => d >= "2026-11-12" && d <= "2026-11-25",
};

// tipos de produto (o que o Bruno citou + o resto do enxoval)
const TIPOS = [
  ["Babá eletrônica / câmera", /baba eletr|baba camera|monitor de beb|baby monitor|camera.*beb/],
  ["Cadeirão de alimentação", /cadeir(a|ao|inha) de (alimenta|refei)|cadeirao|cadeira alta|booster de refei|assento elevat.*refei/],
  ["Cadeirinha / bebê conforto (carro)", /cadeira (de |para )(carro|auto)|cadeirinha (de |para )?(carro|auto)|bebe conforto|isofix|assento (de )?elevat|booster(?!.*refei)/],
  ["Carrinho / travel system", /carrinho de beb|carrinho(?!.*(controle|eletric|brinq|gira|pista))|travel system/],
  ["Berço / moisés / cercadinho", /berco|moises|cercad|chiqueir|mini cama|cama compartilhada/],
  ["Banheira / banho", /banheira|ofuro|assento de banho|toalha de banho|toalha com capuz|roupao/],
  ["Amamentação (bomba, almofada)", /bomba|tira ?leite|extrator|almofada de amament|amamenta|sutia de amament|absorvente para seio/],
  ["Mamadeira / copo / prato", /mamadeira|copo (de )?transi|copo treina|prato|pote|talher|babador|papinha|mordedor|chupeta/],
  ["Esterilizador / aquecedor / processador", /esteriliz|aquecedor|processador|mixer|liquidificador|papinha.*maquina|maquina.*papinha/],
  ["Saúde (termômetro, aspirador nasal, umidificador)", /termometr|aspirador nasal|sugador|nebuliz|inalador|umidificador|purificador|soro/],
  ["Brinquedo / atividade", /brinquedo|mobile|tapete de atividade|chocalho|pelucia|boneca|blocos|montessori|livro de pano|centro de atividade|andador|jumper|cadeira de descanso|balanc|cadeira vibrat|bouncer/],
  ["Livro infantil", /livro|biblioteca|historia|colecao/],
  ["Roupa / calçado / enxoval têxtil", /body|bodies|macacao|mijao|pijama|conjunto|meia|sapat|tenis|manta|cueiro|saida maternidade|kit enxoval|lencol|cobertor|swaddle|saco de dormir/],
  ["Mochila / bolsa maternidade", /mochila|bolsa maternidade|bolsa de maternidade|frasqueira/],
  ["Alimentação (leite, fórmula, papinha)", /leite em p|formula infantil|nestonutri|ninho|aptamil|nan |milnutri|papinha|mucilon|cereal infantil|composto lacteo/],
  ["Móveis (cômoda, trocador, poltrona)", /comoda|trocador|poltrona|guarda.?roupa|organizador|prateleira|estante|mesinha/],
  ["Segurança da casa (trava, tomada, portão)", /trava|protetor de tomada|portao|protetor de quina|cinto|grade de cama|tela de protec/],
  ["Mamãe (gestante, pós-parto)", /gestante|pos.?parto|calcinha|cinta|maternidade(?!.*bolsa)|sutia|barriga/],
  ["Fralda", /fralda(?! de pano)/],
  ["Lenço / algodão", /lenco|lencinho|algodao|toalhinha umedecida/],
  ["Assadura / pele", /assadura|pomada|bepantol|hipoglos|desitin|weleda|creme (preventivo|barreira)|calendula/],
  ["Banho e higiene (sabonete, shampoo)", /sabonete|shampoo|condicionador|colonia|hidratante|oleo|talco|cotonete|escova|creme dental|kit higiene/],
  ["Casa e limpeza", /sabao|amaciante|detergente|lava roupa|desinfetante|papel higien|air ?fryer|fritadeira|panela/],
];
const tipo = (t) => { const s = norm(t); for (const [k, r] of TIPOS) if (r.test(s)) return k; return "Outros"; };

// marcas
const MARCAS = {
  premium: ["chicco", "safety 1st", "maxi-cosi", "maxi cosi", "joie", "graco", "burigotto", "galzerano", "infanti", "cosco", "litet", "kiddo", "abc design", "britax", "fisher-price", "fisher price", "philips avent", "avent", "mam ", "medela", "lansinoh", "motorola", "intelbras", "multikids baby", "comtac", "tommee tippee", "dr. brown", "dr brown", "nuk", "lillo", "kuka", "mustela", "weleda", "granado", "carter", "hering kids", "pimpolho", "tip top", "elian", "skip hop", "munchkin", "baby einstein", "chicco", "tramontina", "oster", "philips walita", "ninho", "nestle", "aptamil", "tutti baby", "voksi", "maxi baby", "dican", "buba", "clingo", "girotondo", "papi"],
  massa: ["pampers", "huggies", "turma da monica", "mamypoko", "pom pom", "personal", "babysec", "cremer", "bellacotton", "johnson", "bepantol", "hipoglos", "desitin", "natura", "boticario", "dove", "nivea", "ype", "omo", "comfort", "downy", "ola", "baby soft", "plim"],
};
const ALL = [...MARCAS.premium.map((m) => [m, "premium"]), ...MARCAS.massa.map((m) => [m, "massa"])];
const esc = (x) => x.trim().replace(/[.*+?^${}()|[\]\\]/g, (c) => "\\" + c);
const ALLRE = ALL.map(([m, g]) => [new RegExp("(^|[^a-z])" + esc(m) + "([^a-z]|$)"), m.trim(), g]);
const marca = (t) => { const s = norm(t); for (const [r, m, g] of ALLRE) if (r.test(s)) return { m, g }; return null; };

const faixa = (p) => (p == null ? null : p < 30 ? "até R$ 30" : p < 60 ? "R$ 30–60" : p < 100 ? "R$ 60–100" : p < 300 ? "R$ 100–300" : "R$ 300+");
const FAIXAS = ["até R$ 30", "R$ 30–60", "R$ 60–100", "R$ 100–300", "R$ 300+"];
const nkey = (t) => norm(t).replace(/[^a-z0-9 ]/g, "").split(/\s+/).slice(0, 7).join(" ");

const res = {};
for (const [nome, f] of Object.entries(PER)) {
  const ps = posts.filter((p) => f(p.dia));
  const LIXO = /compra m[ií]nima|desconto at[eé]|sem compra m|a gente vai trazer|grupo novo|retire na loja|^preci+nho|baratinho+|^para ajudar|^pode virar/i;
  const prod = ps.filter((p) => p.categoria !== "Cupons e avisos" && p.produto && !LIXO.test(p.produto) && p.produto.length >= 12);
  const dias = new Set(ps.map((p) => p.dia));
  const util = [...dias].filter((d) => { const w = new Date(d + "T12:00:00Z").getUTCDay(); return w > 0 && w < 6; });
  const fds = [...dias].filter((d) => !util.includes(d));
  const porDia = (lista) => lista.length ? Math.round(ps.filter((p) => lista.includes(p.dia)).length / lista.length) : 0;
  const t = {}; prod.forEach((p) => { const k = tipo(p.produto); t[k] = (t[k] || 0) + 1; });
  const precos = prod.map((p) => p.preco).filter((v) => v > 0).sort((a, b) => a - b);
  const fx = {}; FAIXAS.forEach((k) => (fx[k] = 0)); prod.forEach((p) => { const k = faixa(p.preco); if (k) fx[k]++; });
  const mk = {}, grp = { premium: 0, massa: 0, sem: 0 };
  prod.forEach((p) => { const b = marca(p.produto); if (b) { mk[b.m] = (mk[b.m] || 0) + 1; grp[b.g]++; } else grp.sem++; });
  const lojas = {}; prod.forEach((p) => (lojas[p.loja] = (lojas[p.loja] || 0) + 1));
  const unicos = new Set(prod.map((p) => nkey(p.produto))).size;
  // exemplos dos tipos "grandes" (equipamento)
  const ex = {};
  for (const k of ["Babá eletrônica / câmera", "Cadeirão de alimentação", "Cadeirinha / bebê conforto (carro)", "Carrinho / travel system", "Berço / moisés / cercadinho", "Amamentação (bomba, almofada)", "Esterilizador / aquecedor / processador", "Brinquedo / atividade", "Roupa / calçado / enxoval têxtil"]) {
    const l = prod.filter((p) => tipo(p.produto) === k); const u = [...new Map(l.map((p) => [nkey(p.produto), p])).values()];
    ex[k] = u.sort((a, b) => (b.preco || 0) - (a.preco || 0)).slice(0, 4).map((p) => `${p.produto.slice(0, 70)} (R$ ${p.preco ?? "?"})`);
  }
  const pct = (n, b = prod.length) => Math.round((1000 * n) / (b || 1)) / 10;
  res[nome] = {
    posts: ps.length, produtos: prod.length, dias: dias.size, por_dia_util: porDia(util), por_dia_fds: porDia(fds),
    cupons_pct: pct(ps.length - prod.length, ps.length), unicos_pct: pct(unicos),
    tipos: Object.fromEntries(Object.entries(t).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, pct(v)])),
    preco_mediano: precos[Math.floor(precos.length / 2)], preco_medio: Math.round(precos.reduce((a, b) => a + b, 0) / (precos.length || 1)),
    faixas: Object.fromEntries(Object.entries(fx).map(([k, v]) => [k, pct(v)])),
    marca_premium_pct: pct(grp.premium), marca_massa_pct: pct(grp.massa), sem_marca_pct: pct(grp.sem),
    top_marcas: Object.entries(mk).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, v]) => [k, pct(v)]),
    lojas: Object.fromEntries(Object.entries(lojas).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, pct(v)])),
    exemplos: ex,
  };
}

// vendas (comissão) por tipo nos mesmos meses
(async () => {
  const MES = { "Abril (equipe)": ["2026-04-01", "2026-05-01"], "Julho (equipe)": ["2026-07-01", "2026-08-01"], "Agosto (equipe)": ["2026-08-01", "2026-09-01"], "Hoje (robô, 12 a 25/11)": ["2026-11-12", "2026-11-26"] };
  for (const [nome, [a, b]] of Object.entries(MES)) {
    let rows = [];
    for (let o = 0; ; o += 1000) {
      const q = await fetch(U + `affiliate_sales?select=source,product_name,category,commission,units,gross_value,status,sold_at,period_start&or=(and(sold_at.gte.${a},sold_at.lt.${b}),and(period_start.gte.${a.slice(0, 8)}01,period_start.lt.${b}))&offset=${o}&limit=1000`, { headers: H }).then((r) => r.json());
      if (!Array.isArray(q)) { console.log(q); break; }
      rows = rows.concat(q); if (q.length < 1000) break;
    }
    rows = rows.filter((r) => r.status !== "CANCELLED" && (r.commission || 0) > 0);
    const isNov = nome.startsWith("Hoje");
    if (isNov) rows = rows.filter((r) => r.source !== "amazon"); // Amazon do mês não separa a quinzena
    const total = rows.reduce((s, r) => s + Number(r.commission), 0);
    const t = {}; const tk = []; rows.forEach((r) => { const k = /^[A-Z0-9]{10}$/.test(r.product_name || "") ? "(Amazon oculto)" : tipo(r.product_name); t[k] = (t[k] || 0) + Number(r.commission); if (r.gross_value && r.units) tk.push(r.gross_value / r.units); });
    tk.sort((x, y) => x - y);
    res[nome].vendas = { comissao: Math.round(total), lojas: isNov ? "ML + Shopee (Amazon do mês não separa a quinzena)" : "Amazon + ML + Shopee", ticket_mediano_vendido: Math.round(tk[Math.floor(tk.length / 2)] || 0), por_tipo: Object.fromEntries(Object.entries(t).sort((x, y) => y[1] - x[1]).map(([k, v]) => [k, Math.round((1000 * v) / total) / 10])) };
  }
  fs.writeFileSync(D + "estudo.json", JSON.stringify(res, null, 1));
  for (const [k, v] of Object.entries(res)) {
    console.log("\n####", k, "| posts", v.posts, "dia útil", v.por_dia_util, "fds", v.por_dia_fds, "| cupom", v.cupons_pct + "%", "| únicos", v.unicos_pct + "%", "| preço med", v.preco_mediano, "médio", v.preco_medio);
    console.log("faixas", JSON.stringify(v.faixas)); console.log("marca premium", v.marca_premium_pct, "massa", v.marca_massa_pct, "sem", v.sem_marca_pct); console.log("top marcas", JSON.stringify(v.top_marcas));
    console.log("lojas", JSON.stringify(v.lojas)); console.log("tipos", JSON.stringify(v.tipos)); console.log("vendas", JSON.stringify(v.vendas));
  }
})();
