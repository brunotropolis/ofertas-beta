// 24/11 (Bruno: "o mercado livre tem que funcionar nesses grupos, assim como no ofertas maternas"):
// coletor ML pelo Chrome REAL dedicado do PC (porta 9225, mesmo do atualizador de links). Desde 24/11 ~11h o ML
// manda captcha pro acesso direto (n8n e curl), então os coletores "ML Auto" do n8n voltam vazios.
// A cada rodada: por perfil, sorteia 2 subcategorias, lê /ofertas?category=, gera meli.la em lote e manda pro /api/ingest.
// Uso: node coletor_ml.cjs [maternas|lar|mae ...]   (sem argumento = os 3)
// Agendado no Windows: tarefa "OfertasML-Coletor" (run.bat), a cada 30 min das 8h às 19h30.
const fs = require('fs');
const { abrirChrome, sleep } = require('D:/CLAUDE/motor-conteudo/atualizador-links/lib.cjs');
const E = Object.fromEntries(fs.readFileSync('D:/CLAUDE/.env.meta', 'utf8').split(/\r?\n/).map(l => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map(m => [m[1], m[2].replace(/^"|"$/g, '')]));
const SEC = E.CRON_SECRET_OFERTAS_BETA;
const CATS = {
  'ofertas-maternas': ['MLB420375', 'MLB420409', 'MLB420334', 'MLB1392', 'MLB420361', 'MLB5358', 'MLB5360', 'MLB420293', 'MLB1396', 'MLB420295', 'MLB420353', 'MLB420332'],
  'ofertas-lar': ['MLB1613', 'MLB438928', 'MLB1618', 'MLB264051', 'MLB436414', 'MLB436246', 'MLB438284'],
  'ofertas-mae': ['MLB199407', 'MLB1263', 'MLB1248', 'MLB29884', 'MLB6284', 'MLB278194', 'MLB455174', 'MLB439347'],
};
// tirar do grupo o que não é do tema (a subcategoria do ML mistura)
const FORA = {
  'ofertas-lar': /beb[eê]|infantil|crian[cç]a|maquiag|perfume|batom|esmalte/i,
  'ofertas-mae': /beb[eê]|infantil|crian[cç]a|kids|masculin|barba|barbear|\bhomem\b|pet\b|esparadrapo|fio dental|absorvente|incontin[eê]ncia|escova de dentes|pastas? de dente/i,
  'ofertas-maternas': /^$/,
};
// 26/11 (estudo produtos, Bruno: "pode aplicar as 5"): além das ofertas por categoria, 1 busca por rodada de
// enxoval/equipamento de marca conhecida pras Maternas (o que a equipe postava e o robô parou). Só marca boa, R$ 60 a 1.500.
const BUSCAS_ML = ['cadeira de alimentacao burigotto', 'cadeira de alimentacao maxi baby', 'cadeira de alimentacao galzerano', 'carrinho de bebe burigotto', 'carrinho de bebe cosco', 'carrinho de bebe galzerano', 'travel system safety 1st', 'baba eletronica motorola', 'baba eletronica maxi baby', 'berco portatil burigotto', 'berco portatil galzerano', 'banheira bebe burigotto', 'bomba tira leite medela', 'bomba tira leite philips avent', 'mamadeira philips avent', 'kit mamadeira lillo', 'bebe conforto cosco', 'cadeirinha carro burigotto', 'cadeira de descanso fisher price', 'cadeira de balanco bebe mastela', 'kit body bebe carters'];
const MARCA_BOA = /burigotto|galzerano|cosco|kiddo|maxi ?baby|voyage|safety 1st|chicco|fisher.?price|clingo|motorola|philips|avent|infanti\b|tutti baby|multikids|mastela|dican|\bkuka\b|lillo|\bnuk\b|\bmam\b|tommee|dr\.? ?brown|medela|lansinoh|carter|pimpolho|hering|\bbuba\b|munchkin|skip ?hop|\bjoie\b|graco|maxi-?cosi|abc design|litet|intelbras|bright starts|baby einstein/i;
const args = process.argv.slice(2).map(a => `ofertas-${a}`).filter(a => CATS[a]);
const perfis = args.length ? args : Object.keys(CATS);
const sorteia = (l, n) => [...l].sort(() => Math.random() - 0.5).slice(0, n);

async function lerOfertas(page, cat) {
  await page.goto(/^https?:/.test(cat) ? cat : 'https://www.mercadolivre.com.br/ofertas?category=' + cat, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  await sleep(3500);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2)); await sleep(1200);
  return page.evaluate(() => {
    const preco = el => { if (!el) return null; const f = el.querySelector('.andes-money-amount__fraction')?.textContent; if (!f) return null; const c = el.querySelector('.andes-money-amount__cents')?.textContent || '00'; return parseFloat(f.replace(/\./g, '') + '.' + c); };
    return [...document.querySelectorAll('div.poly-card')].map(card => {
      const a = card.querySelector('a.poly-component__title') || [...card.querySelectorAll('a[href*="MLB"]')].find(x => !/click1/.test(x.href));
      const href = a?.href || ''; const m = href.match(/MLB-?(\d{6,})/i);
      const img = card.querySelector('img'); const src = img?.getAttribute('data-src') || img?.src || '';
      const atual = card.querySelector('.poly-price__current'); const antes = card.querySelector('s.andes-money-amount--previous');
      const desc = (card.querySelector('.andes-money-amount__discount')?.textContent || '').match(/(\d+)%/);
      const txt = card.innerText;
      return { mlb: m ? 'MLB' + m[1] : null, url: href.split('?')[0].split('#')[0], titulo: (a?.textContent || '').trim(), imagem: /^https:\/\/http2\.mlstatic/.test(src) ? src.split('?')[0].replace(/\.webp$/i, '.jpg') : null,
        preco: preco(atual), de: preco(antes), desconto: desc ? +desc[1] : null, full: /FULL/.test(txt), internacional: /compra internacional|envio internacional/i.test(txt), frete: /Frete grátis|Chegará grátis/i.test(txt), nota: parseFloat((txt.match(/\b([1-5],\d)\b/) || [])[1]?.replace(',', '.')) || null };
    }).filter(p => p.mlb && p.titulo && p.imagem && p.preco && !p.internacional); // 26/11: compra internacional do ML nunca (Bruno)
  });
}

async function gerarLinks(page, urls) {
  await page.goto('https://www.mercadolivre.com.br/afiliados/linkbuilder', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  await sleep(3000);
  return page.evaluate(async (urls, tag) => {
    const csrf = (document.cookie.match(/_csrf=([^;]+)/) || [])[1] || '';
    const out = {};
    for (let i = 0; i < urls.length; i += 20) {
      try {
        const x = await fetch('https://www.mercadolivre.com.br/affiliate-program/api/v2/affiliates/createLink', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json', accept: 'application/json', 'x-csrf-token': csrf, 'x-requested-with': 'XMLHttpRequest' }, body: JSON.stringify({ urls: urls.slice(i, i + 20), tag }) });
        const j = await x.json();
        for (const u of j.urls || []) if (u.short_url) out[u.origin_url || u.url || u.long_url] = u.short_url;
        (j.urls || []).forEach((u, k) => { if (u.short_url && !Object.values(out).includes(u.short_url)) out[urls[i + k]] = u.short_url; });
      } catch (e) {}
    }
    return out;
  }, urls, E.ML_TAG_MATERNA);
}

(async () => {
  const { page, fechar } = await abrirChrome(false);
  try {
    for (const perfil of perfis) {
      const prods = [];
      for (const cat of sorteia(CATS[perfil], 2)) {
        const l = await lerOfertas(page, cat);
        prods.push(...l.filter(p => !FORA[perfil].test(p.titulo)));
        console.log(perfil, cat, l.length, 'cards');
      }
      if (perfil === 'ofertas-maternas') {
        const kw = sorteia(BUSCAS_ML, 1)[0];
        const l = (await lerOfertas(page, 'https://lista.mercadolivre.com.br/' + kw.replace(/ /g, '-'))).filter(p => MARCA_BOA.test(p.titulo) && p.preco >= 60 && p.preco <= 1500).slice(0, 12);
        l.forEach(p => { p.equipamento = true; });
        prods.push(...l);
        console.log(perfil, 'busca', kw, l.length, 'de marca boa');
      }
      const unicos = [...new Map(prods.map(p => [p.mlb, p])).values()];
      if (!unicos.length) { console.log(perfil, 'nada (captcha?)'); continue; }
      const links = await gerarLinks(page, unicos.map(p => p.url));
      const tot = { novo: 0, dup: 0, sem_link: 0, outro: 0 };
      for (const p of unicos) {
        const af = links[p.url]; if (!af) { tot.sem_link++; continue; }
        const promo = {}; if (p.full) promo.full = true; if (p.frete) promo.frete_gratis = true; if (p.nota >= 4) promo.rating = p.nota; if (p.equipamento) promo.equipamento = true;
        const body = { source: 'auto', source_ref: 'ml_' + p.mlb, platform: 'ml', kind: 'produto', url: af, affiliate_url: af, title: p.titulo.slice(0, 500), image_url: p.imagem,
          price_current: p.preco, price_original: p.de && p.de > p.preco ? p.de : null, discount_pct: p.desconto ?? (p.de > p.preco ? Math.round((1 - p.preco / p.de) * 100) : null), promo_meta: Object.keys(promo).length ? promo : null, perfil };
        const r = await fetch('https://app.buscadorgeek.com.br/api/ingest', { method: 'POST', headers: { 'content-type': 'application/json', 'x-ingest-secret': SEC }, body: JSON.stringify(body) });
        const j = await r.json().catch(() => ({}));
        if (r.ok && j.deduped) tot.dup++; else if (r.ok && !j.skipped) tot.novo++; else tot.outro++;
      }
      console.log(new Date().toISOString(), perfil, unicos.length, 'produtos', JSON.stringify(tot));
    }
  } finally { await fechar(); }
})().catch(e => { console.error('ERRO', e.message); process.exit(1); });
