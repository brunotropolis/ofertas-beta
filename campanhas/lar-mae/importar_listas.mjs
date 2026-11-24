// 24/11: põe as listas da Espiã (listas/lar.json, listas/mae.json: Magalu, Natura, Awin, Lomadee, Shopee, Amazon com o link
// de afiliado do Manual já gerado) como rascunho nos perfis ofertas-lar / ofertas-mae via /api/ingest (source=auto).
// Uso: node campanhas/lar-mae/importar_listas.mjs [--dry]
import fs from "node:fs";
import crypto from "node:crypto";
const E = Object.fromEntries(fs.readFileSync("D:/CLAUDE/.env.meta", "utf8").split(/\r?\n/).map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^"|"$/g, "")]));
const SEC = E.CRON_SECRET_OFERTAS_BETA, DRY = process.argv.includes("--dry");
const DIR = new URL(".", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const PLAT = { amazon: "amazon", shopee: "shopee", magalu: "magalu" };
for (const k of ["lar", "mae"]) {
  const lista = JSON.parse(fs.readFileSync(`${DIR}listas/${k}.json`, "utf8"));
  const tot = {};
  for (const p of lista) {
    const loja = String(p.loja || "").toLowerCase();
    const ref = "lista_" + crypto.createHash("md5").update(p.url_produto || p.link_afiliado).digest("hex").slice(0, 16);
    const body = { source: "auto", source_ref: ref, platform: PLAT[loja] ?? null, kind: "produto", url: p.url_produto || p.link_afiliado, affiliate_url: p.link_afiliado,
      title: String(p.titulo).slice(0, 500), image_url: p.imagem, price_current: p.preco ?? null, price_original: p.preco_de && p.preco_de > p.preco ? p.preco_de : null,
      discount_pct: p.desconto ?? null, perfil: `ofertas-${k}`, promo_meta: { lista: "espia", loja } };
    if (DRY) { tot[loja] = (tot[loja] || 0) + 1; continue; }
    const r = await fetch("https://app.buscadorgeek.com.br/api/ingest", { method: "POST", headers: { "content-type": "application/json", "x-ingest-secret": SEC }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    const res = !r.ok ? "erro:" + (j.error || r.status) : j.deduped ? "dup" : j.skipped ? "pulado:" + j.skipped : "ok";
    const ch = loja + " " + res; tot[ch] = (tot[ch] || 0) + 1;
  }
  console.log(k, JSON.stringify(tot));
}
