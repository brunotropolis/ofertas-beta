// 24/11 (Bruno: "migre essas configurações do Espiã para dentro do nosso sistema"): as lojas que a Espiã busca e o
// nosso painel não tinha, agora com as contas do Manual (cofre .env.meta), mandando pro /api/ingest dos perfis Lar e Mãe:
//   Awin  = catálogo das marcas aprovadas (Natura, Boticário, Océane, Granado, L'Occitane / Tok&Stok, Karsten, Teka, Arno)
//   Lomadee = API de produtos por palavra-chave do perfil, link lmdee.link/deep/manualdorecemnascido
//   Magalu = busca da vitrine manualdorn (o ingest troca pro link da vitrine)
// Roda no PC (Magalu bloqueia servidor). Agendado junto do coletor ML (run_lojas.bat, a cada 2 h).
// 26/11 (Bruno: "da magazine não dá para puxar mais ofertas?"): Magalu 8 palavras x 15 produtos por rodada (era 3 x 8).
// Uso: node coletor_lojas.mjs [lar|mae] [--dry]
import fs from "node:fs";
import zlib from "node:zlib";
const E = Object.fromEntries(fs.readFileSync("D:/CLAUDE/.env.meta", "utf8").split(/\r?\n/).map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^"|"$/g, "")]));
const SEC = E.CRON_SECRET_OFERTAS_BETA, APP = "https://app.buscadorgeek.com.br";
const DRY = process.argv.includes("--dry");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36";
const LOMADEE_CANAL = "manualdorecemnascido";
// só as marcas que trazem desconto no catálogo (24/11: Karsten, Arno, Granado, L'Occitane vieram sem nenhum)
// 26/11 (Bruno: "sobre beleza, temos outros sites agora no nosso sistema que podem buscar produtos de beleza não?"):
// Boticário, Karsten e Emma tinham desconto, mas o preço "de" vinha em outro campo (product_price_old / base_price)
// e o coletor só lia rrp_price. Com a leitura corrigida: Boticário 735 com 15%+, Karsten 319, Emma 49.
const MARCAS_AWIN = { lar: /tok ?& ?stok|karsten|^emma/i, mae: /^natura|oceane|botic/i };
/** preço "de" de cada loja da Awin: rrp_price (padrão), product_price_old ("59.85 BRL", Boticário), base_price ("R$ 319,90", Karsten) */
const precoDe = (l) => { for (const v of [l.rrp_price, l.product_price_old, l.base_price]) { const s = String(v ?? "").replace(/BRL|R\$/g, "").trim(); if (!s) continue; const n = /,\d{1,2}$/.test(s) ? parseFloat(s.replace(/\./g, "").replace(",", ".")) : parseFloat(s); if (n > 0) return Math.round(n * 100) / 100; } return null; };
// 26/11 (estudo produtos, Bruno: "pode aplicar as 5"): Magalu também nas Maternas (equipe postava 8-10% de Magalu+Natura;
// o robô 0%). Só a busca da vitrine, com palavras de enxoval/equipamento/rotina de bebê (marca boa primeiro).
const PALAVRAS_MATERNAS = ["cadeira de alimentação bebê", "carrinho de bebê", "babá eletrônica", "berço portátil", "banheira bebê", "bomba tira leite", "mamadeira avent", "kit higiene bebê", "body bebê", "fralda pampers", "fralda huggies", "lenço umedecido pampers", "leite ninho", "fórmula infantil", "bebê conforto", "cadeirinha carro bebê", "sabão bebê", "esterilizador mamadeira", "tapete de atividades bebê", "cercadinho bebê"];
const FORA = { maternas: /adulto|masculin|\bhomem\b|\bpet\b/i, lar: /beb[eê]|infantil|crian[cç]a|maquiag|perfume|batom|esmalte/i, mae: /beb[eê]|infantil|crian[cç]a|kids|masculin|barba|\bhomem\b|refil vazio/i };
const quais = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const grupos = quais.length ? quais : ["lar", "mae", "maternas"];
const sorteia = (l, n) => [...l].sort(() => Math.random() - 0.5).slice(0, n);
const num = (s) => { const n = parseFloat(String(s ?? "").replace(",", ".")); return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null; };
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));

function* csv(txt) {
  let linha = [], campo = "", aspas = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (aspas) { if (c === '"') { if (txt[i + 1] === '"') { campo += '"'; i++; } else aspas = false; } else campo += c; }
    else if (c === '"') aspas = true;
    else if (c === ",") { linha.push(campo); campo = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && txt[i + 1] === "\n") i++; linha.push(campo); campo = ""; if (linha.length > 1) yield linha; linha = []; }
    else campo += c;
  }
}
const tabela = (txt) => { const out = []; let cab = null; for (const l of csv(txt)) { if (!cab) { cab = l.map((k) => k.trim()); continue; } out.push(Object.fromEntries(cab.map((k, i) => [k, (l[i] ?? "").trim()]))); } return out; };

async function awin(g) {
  const lista = tabela(await (await fetch(`https://productdata.awin.com/datafeed/list/apikey/${E.AWIN_FEED_KEY}`)).text())
    .filter((l) => /active|joined/i.test(l["Membership Status"] || "") && !/not/i.test(l["Membership Status"] || "") && l["Primary Region"] === "BR" && MARCAS_AWIN[g].test(l["Advertiser Name"] || "") && +l["No of products"] < 60000);
  const out = [];
  for (const f of sorteia(lista, 2)) {
    try {
      const buf = Buffer.from(await (await fetch(f.URL, { signal: AbortSignal.timeout(120000) })).arrayBuffer());
      const linhas = tabela((buf[0] === 0x1f && buf[1] === 0x8b ? zlib.gunzipSync(buf) : buf).toString("utf8"));
      const bons = linhas.filter((l) => !(l.in_stock === "0" || /^(no|false)$/i.test(l.in_stock || "")) && num(l.search_price) && precoDe(l) >= num(l.search_price) * 1.15 && /^https?:/.test(l.aw_deep_link || "") && (l.merchant_image_url || l.aw_image_url));
      for (const l of sorteia(bons, 15)) out.push({ loja: "awin · " + f["Advertiser Name"].replace(/\s+BR$/i, ""), ref: `awin_${f["Advertiser ID"]}_${l.aw_product_id || l.merchant_product_id}`, link: l.aw_deep_link,
        url: l.merchant_deep_link || l.aw_deep_link, titulo: l.product_name, imagem: l.merchant_image_url || l.aw_image_url, preco: num(l.search_price), de: precoDe(l) });
      console.log(g, "awin", f["Advertiser Name"], linhas.length, "linhas,", bons.length, "com desconto");
    } catch (e) { console.log(g, "awin erro", f["Advertiser Name"], e.message); }
  }
  return out;
}

async function lomadee(g, palavras) {
  const out = [];
  for (const p of sorteia(palavras, 4)) {
    try {
      const r = await fetch(`https://api.lomadee.com.br/affiliate/products?search=${encodeURIComponent(p)}&limit=50&isAvailable=true`, { headers: { "x-api-key": E.LOMADEE_API_KEY }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) { console.log(g, "lomadee", p, r.status); await dorme(3000); continue; }
      const termos = p.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/\s+/).filter((x) => x.length > 2);
      for (const it of (await r.json()).data ?? []) {
        const preco = num(it.options?.[0]?.pricing?.[0]?.price), de = num(it.options?.[0]?.pricing?.[0]?.listPrice), nome = String(it.name || "").trim();
        const nn = nome.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (!preco || !de || de < preco * 1.1 || !/^https?:/.test(it.url || "") || !it.images?.[0]?.url || !termos.every((t) => nn.includes(t.replace(/s$/, "")))) continue;
        out.push({ loja: "lomadee", ref: `lomadee_${it.organizationId}_${it.id}`, link: `https://lmdee.link/deep/${LOMADEE_CANAL}?url=${encodeURIComponent(it.url)}`, url: it.url, titulo: nome, imagem: it.images[0].url, preco, de });
      }
    } catch (e) { console.log(g, "lomadee erro", p, e.message); }
    await dorme(1500);
  }
  return out.slice(0, 15);
}

async function magalu(g, palavras) {
  const out = [];
  for (const p of sorteia(palavras, 8)) {
    try {
      const r = await fetch(`https://www.magazinevoce.com.br/magazinemanualdorn/busca/${encodeURIComponent(p).replace(/%20/g, "+")}/`, { headers: { "user-agent": UA, "accept-language": "pt-BR,pt;q=0.9", accept: "text/html" }, signal: AbortSignal.timeout(25000) });
      if (!r.ok) { console.log(g, "magalu", p, r.status); continue; }
      const nd = (await r.text()).match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
      for (const it of (nd ? JSON.parse(nd[1])?.props?.pageProps?.data?.search?.products ?? [] : []).slice(0, 15)) {
        const preco = num(it.price?.bestPrice), de = num(it.price?.price), caminho = String(it.path || "").replace(/^\/magazine[^/]+/, "");
        if (!preco || it.available === false || !caminho.includes("/p/") || !it.image) continue;
        const url = "https://www.magazineluiza.com.br" + caminho;
        out.push({ loja: "magalu", plataforma: "magalu", ref: `magalu_${it.id}`, link: url, url, titulo: String(it.title || ""), imagem: String(it.image).replace("{w}x{h}", "800x800"), preco, de: de > preco ? de : null });
      }
    } catch (e) { console.log(g, "magalu erro", p, e.message); }
    await dorme(2500);
  }
  return out;
}

for (const g of grupos) {
  const perfil = `ofertas-${g}`;
  const palavras = g === "maternas" ? PALAVRAS_MATERNAS : (await (await fetch(`${APP}/api/keywords/collector?slug=${perfil}`, { headers: { "x-ingest-secret": SEC } })).json()).keywords || [];
  const fontes = g === "maternas" ? [...(await magalu(g, palavras))] : [...(await awin(g)), ...(await lomadee(g, palavras)), ...(await magalu(g, palavras))];
  const itens = fontes.filter((p) => p.titulo && !FORA[g].test(p.titulo));
  const tot = {};
  for (const p of itens) {
    const k = p.loja.split(" ·")[0];
    if (DRY) { tot[k] = (tot[k] || 0) + 1; continue; }
    const body = { source: "auto", source_ref: p.ref, platform: p.plataforma ?? null, kind: "produto", url: p.url, affiliate_url: p.link, title: p.titulo.slice(0, 500), image_url: p.imagem,
      price_current: p.preco, price_original: p.de && p.de > p.preco ? p.de : null, discount_pct: p.de > p.preco ? Math.round((1 - p.preco / p.de) * 100) : null, perfil, promo_meta: { loja: p.loja } };
    const r = await fetch(`${APP}/api/ingest`, { method: "POST", headers: { "content-type": "application/json", "x-ingest-secret": SEC }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    const res = !r.ok ? "erro" : j.deduped ? "dup" : j.skipped ? "pulado" : "novo";
    tot[`${k} ${res}`] = (tot[`${k} ${res}`] || 0) + 1;
  }
  console.log(new Date().toISOString(), perfil, JSON.stringify(tot));
}
