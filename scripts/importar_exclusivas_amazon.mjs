// Importa a planilha semanal/quinzenal de OFERTAS EXCLUSIVAS da Amazon (a que chega por e-mail) pro painel.
// 09/Nov (Bruno): postar rápido, com chamada agressiva, SÓ dentro do prazo de cada oferta.
//
// Uso:
//   node scripts/importar_exclusivas_amazon.mjs <arquivo> [--dry] [--geek=300] [--maternas=150]
//   <arquivo> = .csv (exportado da planilha) ou o .txt/.json que a leitura do Google Drive devolve.
//
// Colunas esperadas (planilha da Amazon): Data inicial (Ano/Mês/Dia), Hora início, Data final, Hora fim, ASIN,
// Categoria, Título, Preço de Capa, Promoção, Desconto, Link. Horas tratadas como horário de Brasília.
//
// O que faz: separa por perfil (Buscador Geek = tecnologia/games/brinquedos/casa/livros de cultura pop;
// Ofertas Maternas = bebê), pega os maiores descontos, confere foto/estoque na Creators API e cadastra pelo
// /api/ingest como rascunho com promo_meta.exclusiva { inicio, fim, preco_promo, fonte }. Quem posta é o
// auto-enqueue (fura a fila quando a janela abre; teto 15/dia no Geek e 10/dia nas Maternas).
import fs from "node:fs";

const ENV = Object.fromEntries(fs.readFileSync("D:/CLAUDE/.env.meta", "utf8").split(/\r?\n/)
  .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^"|"$/g, "")]));
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? Number(a.split("=")[1]) : d; };
const DRY = process.argv.includes("--dry");
const ARQ = process.argv[2];
if (!ARQ) { console.error("uso: node scripts/importar_exclusivas_amazon.mjs <arquivo> [--dry]"); process.exit(1); }

// ── 1. Lê as linhas ────────────────────────────────────────────────────────────────────────────────────
let texto = fs.readFileSync(ARQ, "utf8");
let nomeArquivo = ARQ.split(/[\\/]/).pop();
try { const j = JSON.parse(texto); if (j.fileContent) { texto = j.fileContent; nomeArquivo = j.title || nomeArquivo; } } catch { /* csv puro */ }
function csvLinha(s) {
  const out = []; let cur = "", q = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) { if (ch === '"' && s[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
    else if (ch === '"') q = true; else if (ch === ",") { out.push(cur); cur = ""; } else cur += ch;
  }
  out.push(cur); return out;
}
// a leitura do Drive junta as linhas com espaço; o .csv usa quebra de linha. Os dois casos: corta antes de cada "AAAA/MM/DD,HH:MM,AAAA/"
const corpo = texto.slice(texto.indexOf("Link") + 4).trim();
const pedacos = corpo.split(/\s+(?=\d{4}\/\d{2}\/\d{2},\d{1,2}:\d{2},\d{4}\/)/);
const num = (v) => { const n = Number(String(v || "").replace(/[^\d.,]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".")); return Number.isFinite(n) ? n : null; };
const quando = (d, h) => { const [Y, M, D] = d.split("/").map(Number); const [hh, mm] = (h || "00:00").split(":").map(Number); return new Date(Date.UTC(Y, M - 1, D, hh + 3, mm)).toISOString(); }; // BRT → UTC
const linhas = pedacos.map(csvLinha).filter((r) => r.length >= 11 && /^[A-Z0-9]{10}$/.test(r[4])).map((r) => ({
  inicio: quando(r[0], r[1]), fim: quando(r[2], r[3]), asin: r[4], categoria: r[5].trim(), titulo: r[6].trim(),
  capa: num(r[7]), promo: num(r[8]), desconto: num(r[9]) ?? 0,
}));
console.log(`${nomeArquivo}: ${linhas.length} ofertas lidas`);

// ── 2. Separa por perfil ───────────────────────────────────────────────────────────────────────────────
const BEBE = /\bbeb[eê]s?\b|infantil|fralda|mamadeira|chupeta|rec[eé]m[- ]nascido|gestante|maternidade|amament|len[çc]o umedecido|carrinho de beb|ber[çc]o|banheira|baby\b|kids\b|crian[çc]a/i;
const GEEK_CAT = /eletr[ôo]nic|gamer|computador|inform[áa]tica|celular|c[âa]mera|brinquedo|^casa$|cozinha|ferramenta|eletrodom|autom[óo]tivo|m[úu]sica|papelaria/i;
const POP = /mang[áa]|\bhq\b|quadrinho|graphic novel|marvel|\bdc\b|batman|superman|homem[- ]aranha|spider|star wars|harry potter|tolkien|senhor dos an[ée]is|hobbit|game of thrones|stephen king|anime|naruto|one piece|dragon ball|pok[ée]mon|zelda|minecraft|lego|geek|nerd|fic[çc][ãa]o cient|duna\b|sandman|watchmen|turma da m[ôo]nica/i;
const ehGeek = (o) => !BEBE.test(o.titulo) && (GEEK_CAT.test(o.categoria) || (/livro/i.test(o.categoria) && POP.test(o.titulo)));
const ehMaternas = (o) => !/livro/i.test(o.categoria) && (/beb[eê]/i.test(o.categoria) || BEBE.test(o.titulo));
const agora = Date.now();
const valida = (o) => new Date(o.fim).getTime() > agora + 2 * 3600_000 && o.promo && o.capa && o.promo < o.capa;
const top = (f, min, n) => linhas.filter((o) => valida(o) && f(o) && o.desconto >= min).sort((a, b) => b.desconto - a.desconto).slice(0, n);
const grupos = { "buscador-geek": top(ehGeek, 20, arg("geek", 300)), "ofertas-maternas": top(ehMaternas, 10, arg("maternas", 150)) };
for (const [p, l] of Object.entries(grupos)) console.log(`${p}: ${l.length} selecionadas (desconto ${l.at(-1)?.desconto ?? 0}%–${l[0]?.desconto ?? 0}%)`);
if (process.argv.includes("--amostra")) { for (const [p, l] of Object.entries(grupos)) { console.log("== " + p); l.filter((_, i) => i % Math.ceil(l.length / 25) === 0).forEach((o) => console.log(o.desconto + "% | " + o.categoria + " | " + o.titulo.slice(0, 70) + " | " + o.inicio.slice(5, 10) + "→" + o.fim.slice(5, 10))); } process.exit(0); }

// ── 3. Foto, estoque e título pela Creators API ────────────────────────────────────────────────────────
const tok = await (await fetch("https://api.amazon.com/auth/o2/token", { method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ grant_type: "client_credentials", client_id: ENV.AMAZON_ACCESS_KEY, client_secret: ENV.AMAZON_SECRET_KEY, scope: "creatorsapi::default" }) })).json();
const asins = [...new Set(Object.values(grupos).flat().map((o) => o.asin))];
const info = {};
for (let i = 0; i < asins.length; i += 10) {
  const r = await fetch("https://creatorsapi.amazon/catalog/v1/getItems", { method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer " + tok.access_token, "x-marketplace": "www.amazon.com.br" },
    body: JSON.stringify({ itemIds: asins.slice(i, i + 10), partnerTag: ENV.AMAZON_PARTNER_TAG || "manualdorec0c-20", marketplace: "www.amazon.com.br",
      resources: ["itemInfo.title", "images.primary.large", "offersV2.listings.availability", "offersV2.listings.price"] }) });
  const j = await r.json().catch(() => ({}));
  for (const it of j?.itemsResult?.items ?? []) info[it.asin] = it;
  await new Promise((res) => setTimeout(res, 1100)); // ~1 req/s
}
const tituloCurto = (t) => { let s = t.split(/\s[|–]\s/)[0].trim(); if (s.length > 110) s = s.slice(0, 110).replace(/[\s,;:-]+\S*$/, "") + "…"; return s; };

// ── 4. Cadastra pelo /api/ingest ───────────────────────────────────────────────────────────────────────
const shopeeWf = await (await fetch(ENV.N8N_BASE_URL + "/api/v1/workflows/spdOQNLpjiLYiL4n", { headers: { "X-N8N-API-KEY": ENV.N8N_API_KEY } })).json();
const SECRET = shopeeWf.nodes.find((n) => n.name === "POST INGEST").parameters.headerParameters.parameters[0].value;
const fonte = `planilha amazon ${nomeArquivo.replace(/\.(xlsx|csv|txt|json)$/i, "")}`.slice(0, 80);
const resumo = { criadas: 0, repetidas: 0, sem_foto: 0, sem_estoque: 0, puladas: 0, erros: 0 };
for (const [perfil, lista] of Object.entries(grupos)) {
  for (const o of lista) {
    const it = info[o.asin];
    const img = it?.images?.primary?.large?.url;
    const l = it?.offersV2?.listings?.[0];
    if (!img) { resumo.sem_foto++; continue; }
    if (!l || l.availability?.type === "OUT_OF_STOCK") { resumo.sem_estoque++; continue; }
    const corpoIngest = {
      source: "manual", source_ref: `exclusiva_amazon_${o.asin}_${o.inicio.slice(0, 10)}_${perfil === "buscador-geek" ? "g" : "m"}`,
      platform: "amazon", url: `https://www.amazon.com.br/dp/${o.asin}`, affiliate_url: `https://www.amazon.com.br/dp/${o.asin}?tag=manualdorec0c-20`,
      title: tituloCurto(it?.itemInfo?.title?.displayValue || o.titulo), price_current: o.promo, price_original: o.capa,
      discount_pct: Math.round(o.desconto), image_url: img, perfil, kind: "produto", source_channel: "amazon exclusivas",
      promo_meta: { exclusiva: { inicio: o.inicio, fim: o.fim, preco_promo: o.promo, fonte }, categoria_amazon: o.categoria },
    };
    if (DRY) { resumo.criadas++; continue; }
    const r = await fetch("https://app.buscadorgeek.com.br/api/ingest", { method: "POST", headers: { "x-ingest-secret": SECRET, "content-type": "application/json" }, body: JSON.stringify(corpoIngest) });
    const j = await r.json().catch(() => ({}));
    if (j.deduped) resumo.repetidas++; else if (j.skipped) resumo.puladas++; else if (r.ok) resumo.criadas++; else { resumo.erros++; if (resumo.erros < 4) console.log("erro", r.status, JSON.stringify(j).slice(0, 200)); }
  }
}
console.log(DRY ? "(simulação, nada gravado)" : "", resumo);
