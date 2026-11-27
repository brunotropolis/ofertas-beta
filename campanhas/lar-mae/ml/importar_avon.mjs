// 26/11 (Bruno: "coloca avon tb"): produtos Avon da Minha Loja da Day (consultoria=manualdorecemnascido&marca=avon).
// A lista de ids sai das páginas Avon Friday, Ofertas Relâmpago e Kits Exclusivos (lidas no Chrome, a API da loja
// pede credencial da página); aqui cada produto é lido pela página pública (og:title, og:image, preço atual) e vai
// pro /api/ingest: beleza > grupo da Mãe, casa > Lar, bebê/infantil > Maternas.
// Uso: node importar_avon.mjs [--dry]
import fs from "node:fs";
const E = Object.fromEntries(fs.readFileSync("D:/CLAUDE/.env.meta", "utf8").split(/\r?\n/).map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]));
const SEC = E.CRON_SECRET_OFERTAS_BETA, APP = "https://app.buscadorgeek.com.br";
const DRY = process.argv.includes("--dry");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36";
const LISTA = JSON.parse(fs.readFileSync(new URL("./avon_ids.json", import.meta.url), "utf8")); // [[id, preco_de], ...]
const slug = (t) => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
const BEBE = /\bbaby\b|beb[eê]|babies|kids|infantil|crian[cç]a|petit|frozen|disney|stitch|mickey/i;
const CASA = /ca[cç]arola|x[ií]cara|pires|potes?|garrafa|panela|travessa|jogo de/i;
const tot = {};
for (const [id, de] of LISTA) {
  const ref = `AVNBRA-${id}`;
  let html = "";
  try { html = await (await fetch(`https://www.minhaloja.natura.com/p/produto/${ref}?consultoria=manualdorecemnascido&marca=avon`, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(20000) })).text(); }
  catch (e) { tot.erro_leitura = (tot.erro_leitura || 0) + 1; continue; }
  const og = (k) => (html.match(new RegExp(`<meta property="og:${k}" content="([^"]+)"`)) || [])[1] || null;
  const titulo = (og("title") || "").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, "\"") || null, imagem = og("image"), preco = parseFloat((html.match(/"price":([\d.]+)/) || [])[1] || "0");
  if (!titulo || !imagem || !preco) { tot.sem_dado = (tot.sem_dado || 0) + 1; continue; }
  const perfil = CASA.test(titulo) ? "ofertas-lar" : BEBE.test(titulo) ? "ofertas-maternas" : "ofertas-mae";
  const link = `https://www.minhaloja.natura.com/p/${slug(titulo)}/${ref}?consultoria=manualdorecemnascido&marca=avon`;
  const original = de && de > preco * 1.02 ? de : null;
  const body = { source: "auto", source_ref: `avon_${ref}`, platform: null, kind: "produto", url: link, affiliate_url: link, title: titulo.slice(0, 500), image_url: imagem,
    price_current: preco, price_original: original, discount_pct: original ? Math.round((1 - preco / original) * 100) : null, perfil, promo_meta: { loja: "avon" } };
  if (DRY) { console.log(perfil, titulo, preco, original); tot[perfil] = (tot[perfil] || 0) + 1; continue; }
  const r = await fetch(`${APP}/api/ingest`, { method: "POST", headers: { "content-type": "application/json", "x-ingest-secret": SEC }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  const k = `${perfil} ${!r.ok ? "erro " + r.status + " " + JSON.stringify(j).slice(0, 80) : j.deduped ? "dup" : j.skipped ? "pulado " + (j.reason || "") : "novo"}`;
  tot[k] = (tot[k] || 0) + 1;
}
console.log(JSON.stringify(tot, null, 1));
