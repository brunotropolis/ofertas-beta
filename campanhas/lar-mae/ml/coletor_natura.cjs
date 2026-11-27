// 25/11 (Bruno: "abre o navegador do manual, lá tá logada a conta da natura da loja da Day"): ofertas da loja de
// consultora da Day na Natura (minhaloja.natura.com, consultoria "manualdorecemnascido"), como a equipe postava até 16/10.
// A loja é pública: o link com ?consultoria=manualdorecemnascido já conta a venda pra Day (não precisa login).
// A busca da loja exige token do navegador, então lê os cartões da página pelo Chrome real do PC (porta 9225, igual ao coletor ML).
//   linha Mamãe e Bebê / infantil > grupo Ofertas Maternas (era o que a equipe postava lá)
//   beleza e autocuidado > grupo Ofertas Maternas para Mãe (sem masculino)
// Uso: node coletor_natura.cjs [--dry]   · roda junto do coletor de lojas (run_lojas.bat, a cada 2 h)
const fs = require('fs');
const { abrirChrome, sleep } = require('D:/CLAUDE/motor-conteudo/atualizador-links/lib.cjs');
const E = Object.fromEntries(fs.readFileSync('D:/CLAUDE/.env.meta', 'utf8').split(/\r?\n/).map(l => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map(m => [m[1], m[2].replace(/^"|"$/g, '')]));
const SEC = E.CRON_SECRET_OFERTAS_BETA, DRY = process.argv.includes('--dry');
const BASE = 'https://www.minhaloja.natura.com';
// 26/11 (Bruno: "coloca avon tb"): mesma loja da Day, marca=avon (páginas de oferta da Avon)
const MARCAS = [
  { marca: 'natura', paginas: ['/c/promocoes', '/c/infantil', '/c/corpo-e-banho', '/c/cabelos', '/c/perfumaria'] },
  { marca: 'avon', paginas: ['/c/avon-friday', '/c/promocoes-ofertas-relampago', '/c/kits-exclusivos-avon', '/c/desconto-progressivo'] },
];
const CASA = /ca[cç]arola|x[ií]cara|pires|potes?|panela|travessa|jogo de/i;
const BEBE = /mam[aã]e e beb[eê]|papai e beb[eê]|beb[eê]|infantil|crian[cç]a|naturé|kids/i;
const FORA_MAE = /masculin|homem|\bhomens\b|barba|kaiak (aventura|urbe)|essencial (exclusivo|oud) masc/i;

async function lerPagina(page, caminho, CONS) {
  await page.goto(`${BASE}${caminho}?${CONS}`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  await sleep(5000);
  for (let i = 0; i < 4; i++) { await page.evaluate(() => window.scrollBy(0, 2500)); await sleep(1500); }
  return page.evaluate(() => {
    const num = (s) => { const n = parseFloat(String(s).replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) ? n : null; };
    const vistos = new Set();
    return [...document.querySelectorAll('a[href*="/p/"]')].filter((a) => /R\$/.test(a.innerText)).map((a) => {
      let el = a; for (let i = 0; i < 3 && el.parentElement; i++) el = el.parentElement;
      const img = el.querySelector('img'); const href = (a.getAttribute('href') || '').split('?')[0];
      const precos = (a.innerText.match(/R\$\s*[\d.]+,\d{2}/g) || []).map((p) => num(p.replace(/R\$\s*/, '')));
      const desc = (a.innerText.match(/-(\d+)%/) || [])[1];
      return { href, sku: (href.match(/(?:NAT|AVN)BRA-\d+/) || [])[0], titulo: (img?.alt || '').trim(), imagem: (img?.src || '').split('?')[0], de: precos.length > 1 ? Math.max(...precos) : null, por: precos.length ? Math.min(...precos) : null, desconto: desc ? +desc : null };
    }).filter((p) => p.sku && p.titulo && p.por && p.imagem && !vistos.has(p.sku) && vistos.add(p.sku));
  });
}

(async () => {
  const { page, fechar } = await abrirChrome(false);
  const tot = {};
  try {
    for (const { marca, paginas } of MARCAS) {
    const CONS = `consultoria=manualdorecemnascido&marca=${marca}`;
    const todos = new Map();
    for (const c of paginas) { const l = await lerPagina(page, c, CONS); console.log(marca, c, l.length, 'produtos'); for (const p of l) if (!todos.has(p.sku)) todos.set(p.sku, p); }
    for (const p of todos.values()) {
      if (!p.de || p.de < p.por * 1.15) { tot.sem_desconto = (tot.sem_desconto || 0) + 1; continue; } // só promoção de verdade (15%+)
      const perfil = CASA.test(p.titulo) ? 'ofertas-lar' : BEBE.test(p.titulo) ? 'ofertas-maternas' : FORA_MAE.test(p.titulo) ? null : 'ofertas-mae';
      if (!perfil) { tot.fora = (tot.fora || 0) + 1; continue; }
      const link = `${BASE}${p.href}?${CONS}`;
      if (DRY) { tot[perfil] = (tot[perfil] || 0) + 1; if ((tot[perfil] || 0) <= 4) console.log(' ', perfil, p.desconto + '%', 'R$' + p.por, p.titulo.slice(0, 60)); continue; }
      const body = { source: 'auto', source_ref: `${marca}_${p.sku}_${new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10)}`, platform: null, kind: 'produto', url: link, affiliate_url: link,
        title: p.titulo.slice(0, 500), image_url: p.imagem, price_current: p.por, price_original: p.de, discount_pct: p.desconto ?? Math.round((1 - p.por / p.de) * 100), perfil, promo_meta: { loja: `${marca} (loja da Day)` } };
      const r = await fetch('https://app.buscadorgeek.com.br/api/ingest', { method: 'POST', headers: { 'content-type': 'application/json', 'x-ingest-secret': SEC }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      const k = `${marca} ${perfil} ${!r.ok ? 'erro' : j.deduped ? 'dup' : j.skipped ? 'pulado' : 'novo'}`; tot[k] = (tot[k] || 0) + 1;
    }
    }
  } finally { await fechar(); }
  console.log(new Date().toISOString(), 'natura', JSON.stringify(tot));
})().catch((e) => { console.error('ERRO', e.message); process.exit(1); });
