// Converte as regras do código (regex) em listas de palavras por campanha e confere a concordância no estoque real.
// Uso: npx tsx --tsconfig tsconfig.json scripts/_converter_regras.mts [--gravar]
import fs from "node:fs";
import { CASA, BELEZA, MARCA_BOA, EQUIP, ALIMENTA, catDe } from "../src/lib/regras-perfil.ts";
import { categoriaDe, type RegrasCampanha, norm } from "../src/lib/regras-campanha.ts";

// expande uma regex simples em palavras: (a|b) vira as duas, x? some, [aá] vira a, \b some, .{0,n} e .? viram espaço
function expandir(src: string): string[] {
  const alts: string[] = [];
  let nivel = 0, cur = "";
  for (const ch of src) { if (ch === "(") nivel++; if (ch === ")") nivel--; if (ch === "|" && nivel === 0) { alts.push(cur); cur = ""; } else cur += ch; }
  alts.push(cur);
  const out: string[] = [];
  for (let a of alts) {
    if (/\(\?[!=<]/.test(a)) a = a.replace(/\(\?[!=<][^)]*\)/g, "");
    a = a.replace(/\\b/g, "").replace(/\[([^\]])[^\]]*\]/g, "$1").replace(/\.\{\d+,\d+\}|\.\?|\.\*|\.\+/g, " ").replace(/\\\./g, ".").replace(/\\s\+?/g, " ").replace(/\\d\{1,2\}|\\d\+?/g, "");
    a = a.replace(/(\w)\?/g, "$1"); // letra opcional: fica (o começo de palavra cobre o resto)
    // grupos (x|y) e (x)? : expande combinações
    let lista = [a];
    for (let i = 0; i < 6; i++) {
      const prox: string[] = [];
      let mudou = false;
      for (const s of lista) {
        const m = s.match(/\(([^()]*)\)(\?)?/);
        if (!m) { prox.push(s); continue; }
        mudou = true;
        const ops = m[1].split("|");
        if (m[2]) ops.push("");
        for (const op of ops) prox.push(s.replace(m[0], op));
      }
      lista = prox;
      if (!mudou) break;
    }
    for (const s of lista) {
      const t = s.replace(/[?^$*+{}\\]/g, "").replace(/\s+/g, " ").trim();
      if (t.length >= 2 && !/[()[\]|]/.test(t)) out.push(t);
    }
  }
  return [...new Set(out.map((x) => norm(x).trim()).filter((x) => x.length >= 2))];
}

const NOMES_LAR: Record<string, string> = { eletro_grande: "Eletrodoméstico grande", eletroportatil: "Eletroportátil", limpeza: "Limpeza e lavanderia", cama_banho: "Cama, mesa e banho", decoracao: "Decoração", organizacao: "Organização e utilidades", cozinha: "Cozinha" };
const NOMES_MAE: Record<string, string> = { bem_estar: "Bem-estar (suplemento, café)", aparelho: "Aparelhos (secador, escova...)", maquiagem: "Maquiagem e unhas", cabelo: "Cabelo", pele: "Pele e skincare", corpo_perfume: "Perfume e corpo" };
const COTA_LAR: Record<string, number> = { cozinha: 30, limpeza: 25, cama_banho: 15, eletroportatil: 15, organizacao: 10, eletro_grande: 4, decoracao: 0 };
const COTA_MAE: Record<string, number> = { cabelo: 25, pele: 20, corpo_perfume: 20, bem_estar: 15, maquiagem: 12, aparelho: 8 };
const src = (r: RegExp) => r.source;
// marcas atuais do auto-enqueue (casa e beleza) e do coletor
const ae = fs.readFileSync("src/lib/auto-enqueue.ts", "utf8");
const regexDe = (nome: string) => { const m = ae.match(new RegExp(`const ${nome} = /(.*)/i;`)); return m ? m[1] : ""; };

const lar: RegrasCampanha = {
  so_categorias: true, marcas: expandir(regexDe("MARCA_CASA")),
  categorias: Object.keys(NOMES_LAR).map((k) => ({ nome: NOMES_LAR[k], palavras: expandir(src(CASA[k])), meta: COTA_LAR[k] ?? 0, teto: null, marca_primeiro: true,
    desconto_min: k === "eletro_grande" ? 25 : null, preco_min: null, preco_max: null })),
  teto_shopee: null, sem_marca_abaixo_de: null, shopee_generico_abaixo_de: null,
};
const mae: RegrasCampanha = {
  so_categorias: true, marcas: expandir(regexDe("MARCA_BELEZA")),
  categorias: Object.keys(NOMES_MAE).map((k) => ({ nome: NOMES_MAE[k], palavras: expandir(src(BELEZA[k])), meta: COTA_MAE[k] ?? 0, teto: null, marca_primeiro: true, preco_min: null, preco_max: null })),
  teto_shopee: null, sem_marca_abaixo_de: 20, shopee_generico_abaixo_de: null,
};
const maternas: RegrasCampanha = {
  so_categorias: false, marcas: expandir(src(MARCA_BOA)),
  categorias: [
    { nome: "Enxoval e equipamento de marca boa", palavras: expandir(src(EQUIP)), meta: 20, teto: null, preco_min: 30, preco_max: 800, marca_primeiro: true, variar: true },
    { nome: "Natura (loja da Day)", palavras: [], loja: "natura.com", meta: 4, teto: null },
    { nome: "Leite, fórmula e papinha", palavras: expandir(src(ALIMENTA)), meta: 2, teto: null },
    { nome: "Lenço e algodão", palavras: expandir("len[çc]os? umedecid|toalhas? umedecid"), meta: 0, teto: 5 },
    { nome: "Aparelho de saúde (termômetro, aspirador nasal)", palavras: expandir(regexDe("SAUDE_APAR")), meta: 0, teto: 3 },
  ],
  teto_shopee: 10, sem_marca_abaixo_de: null, shopee_generico_abaixo_de: 20,
};

// palavras que a conversão perdeu (regex com plural/variação)
const extra = (r: RegrasCampanha, nome: string, ps: string[]) => { const c = r.categorias.find((x) => x.nome === nome)!; c.palavras = [...new Set([...c.palavras, ...ps.map((x) => norm(x).trim())])]; };
extra(lar, "Cozinha", ["copo", "taca", "jogo de copos"]); extra(lar, "Limpeza e lavanderia", ["saco para lixo", "sacos para lixo", "fibra de limpeza", "scotch brite", "esponja"]);
extra(lar, "Eletroportátil", ["passadeira a vapor", "extratora"]); extra(mae, "Perfume e corpo", ["hidratante", "luna", "loccitane", "tododia"]); extra(mae, "Maquiagem e unhas", ["cortador de unha", "cortaunhas", "alicate"]);
extra(maternas, "Enxoval e equipamento de marca boa", ["bodies"]);
// concordância no estoque real
const D = "C:/Users/bruno/AppData/Local/Temp/claude/b70d0e96dfc39538/bf528d48-c65d-46db-a590-f794696b57f2/scratchpad/";
for (const [nome, regras, pool, tab, NOMES] of [["LAR", lar, "pool_9b2a012e.json", CASA, NOMES_LAR], ["MÃE", mae, "pool_aa6b7dcb.json", BELEZA, NOMES_MAE]] as const) {
  const a: { title: string }[] = JSON.parse(fs.readFileSync(D + pool, "utf8"));
  let igual = 0, so_velha = 0, so_nova = 0; const dif: string[] = [];
  for (const o of a) {
    const v = catDe(tab as Record<string, RegExp>, o.title); const n = categoriaDe(regras, o);
    const vn = v ? (NOMES as Record<string, string>)[v] : null;
    if (vn === (n?.nome ?? null)) igual++; else { if (v && !n) so_velha++; else if (!v && n) so_nova++; if (dif.length < 12) dif.push(`${vn ?? "-"} > ${n?.nome ?? "-"} | ${o.title.slice(0, 50)}`); }
  }
  console.log(`\n${nome}: igual ${igual}/${a.length} | só a antiga classifica ${so_velha} | só a nova ${so_nova}`);
  console.log(dif.join("\n"));
  console.log("palavras por categoria:", regras.categorias.map((c) => `${c.nome}: ${c.palavras.length}`).join(" · "), "| marcas", regras.marcas.length);
}
console.log("\nMaternas:", maternas.categorias.map((c) => `${c.nome}: ${c.palavras.length}`).join(" · "), "| marcas", maternas.marcas.length);
fs.writeFileSync(D + "regras_seed.json", JSON.stringify({ lar, mae, maternas }, null, 1));

if (process.argv.includes("--gravar")) {
  const E = Object.fromEntries(fs.readFileSync("D:/CLAUDE/.env.meta", "utf8").split(/\r?\n/).map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m![1], m![2].replace(/^["']|["']$/g, "")]));
  const K = E.SUPABASE_SERVICE_ROLE_OFERTAS_BETA;
  for (const [id, r] of [["c3fa658f-fb1d-4a65-a978-3576506e62a0", maternas], ["6ce489b0-dcfe-4726-a4a8-83eb6ba7ca21", lar], ["ef8ac9bc-12eb-4a29-bc52-1514eff658ba", mae]] as const) {
    const res = await fetch(`https://qkherjtsvakmpkxebuwy.supabase.co/rest/v1/campaigns?id=eq.${id}`, { method: "PATCH", headers: { apikey: K, Authorization: `Bearer ${K}`, "content-type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify({ regras: r }) });
    console.log("gravou", id.slice(0, 8), res.status);
  }
}
