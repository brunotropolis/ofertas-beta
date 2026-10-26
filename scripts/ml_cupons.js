// Cupons do dia do Mercado Livre → post "vários cupons + nosso link" nos grupos do Ofertas Maternas (26/Out).
// A página de Cupons do ML (mercadolivre.com.br/cupons) só abre em navegador de verdade (servidor leva captcha),
// então roda AQUI no PC, com a mesma receita do Fralda Barata (fraldas-comparador/ml_scraper.js): Chrome real
// dedicado + puppeteer.connect (webdriver=false) + cookie da conta materna do cofre.
// Lê os cupons de window._n.ctx.r.appProps.pageProps.filteredCouponsData.coupons (SSR), escolhe os GERAIS
// ("Em produtos selecionados", não "Em produtos de <loja>"), monta 1 oferta kind=cupom com coupon_meta.lista
// e manda pro /api/ingest. A escolha automática (auto-categorias escolherCupons) põe na Maternas e no grupo Cupons.
// Uso: node scripts/ml_cupons.js          → coleta e envia (task agendada 7h45 e 9h45)
//      node scripts/ml_cupons.js teste    → só mostra o que escolheria (não envia)
//      node scripts/ml_cupons.js visivel  → janela visível (debug)
const path = require("path");
const fs = require("fs");
const { spawn, execSync } = require("child_process");
const FRALDAS = "D:/CLAUDE/fraldas-comparador";
const puppeteer = require(path.join(FRALDAS, "node_modules/puppeteer-core"));
const { loadEnv } = require(path.join(FRALDAS, "lib_env"));
const env = loadEnv();

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PROFILE = "D:/CLAUDE/ofertas-beta/.ml-cupons-profile"; // perfil próprio (não briga com o do Fralda Barata)
const PORT = 9224;
const TESTE = process.argv.includes("teste");
const VISIVEL = process.argv.includes("visivel");
const ESTADO = path.join(__dirname, ".ml-cupons-estado.json"); // campanhas já postadas hoje (não repete às 9h45)
const VITRINE = "https://www.mercadolivre.com.br/social/manualdorecemnascido?matt_word=asofertasmaternas"; // o encurtador troca a etiqueta por campanha
const PAGINAS = 3; // 30 cupons por página
const POR_POST = 5;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hojeBrt = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);

// fora do tema das mães (e cupom que não vale a pena divulgar)
const FORA = /inform[aá]tica|\btvs?\b|ve[ií]culo|automotiv|\bpneu|ferrament|vonder|celular|smartphone|games?\b|\bpet\b|ra[cç][aã]o|\bmoto|cerveja|vinho|bebida alco|notebook|eletrodom[eé]stico/i;
const BEBE = /beb[eê]|infantil|kids|fralda|huggies|pampers|turma da m[oô]nica|crian[cç]a|brinquedo|mam[aã]e|gestante|kenvue|johnson/i;
const TEMA = /supermercado|mercado|beleza|casa|moda|farm[aá]cia|higiene|boticário|natura|cuidado/i;
const numero = (s) => { const m = String(s || "").match(/R\$\s*([\d.]+(?:,\d+)?)/); return m ? parseFloat(m[1].replace(/\./g, "").replace(",", ".")) : null; };

function pontua(c) {
  let p = 0;
  if (BEBE.test(c.titulo)) p += 5;
  if (/^\s*(\d+% OFF|R\$\s*\d+ OFF)\s*$/i.test(c.titulo)) p += 3; // cupom genérico "20% OFF" em produtos selecionados
  if (!c.min) p += 2;
  if ((c.pct ?? 0) >= 20) p += 1;
  if (TEMA.test(c.titulo)) p += 1;
  if (c.aviso) p += 1;
  if (c.codigo) p += 1;
  return p;
}

async function waitPort(port, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { const r = await fetch(`http://127.0.0.1:${port}/json/version`); if (r.ok) return; } catch (e) { /* ainda subindo */ }
    await sleep(500);
  }
  throw new Error("Chrome não abriu a porta de debug");
}

async function alerta(texto) {
  if (TESTE) return console.log("ALERTA (teste):", texto);
  try {
    const r = await fetch(`${env.EVOLUTION_URL}/message/sendText/gestor-alertas`, {
      method: "POST", headers: { apikey: env.EVOLUTION_GLOBAL_APIKEY, "content-type": "application/json" },
      body: JSON.stringify({ number: "5541984302127", text: texto }),
    });
    console.log("alerta Evolution HTTP", r.status);
  } catch (e) { console.log("alerta falhou", e.message); }
}

async function segredoIngest() {
  // o mesmo dos coletores maternas (fica no nó POST INGEST do coletor Shopee)
  const r = await fetch(`${env.N8N_BASE_URL}/api/v1/workflows/spdOQNLpjiLYiL4n`, { headers: { "X-N8N-API-KEY": env.N8N_API_KEY } });
  const w = await r.json();
  return w.nodes.find((n) => n.name === "POST INGEST").parameters.headerParameters.parameters[0].value;
}

async function main() {
  console.log(`==== ${new Date().toISOString()} cupons ML ${TESTE ? "(teste)" : ""}`);
  const args = [`--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, "--no-first-run", "--no-default-browser-check",
    "--window-size=1300,950", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding", "--disable-background-timer-throttling"];
  if (!VISIVEL) args.push("--window-position=-2400,-2400");
  args.push("about:blank");
  const child = spawn(CHROME, args, { detached: false, stdio: "ignore" });
  await waitPort(PORT, 25000);
  const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${PORT}`, defaultViewport: null, protocolTimeout: 120000 });
  const brutos = [];
  try {
    const page = (await browser.pages())[0] || await browser.newPage();
    await page.bringToFront();
    const cookies = env.ML_COOKIE_MATERNA.split(";").map((s) => s.trim()).filter(Boolean).map((pair) => {
      const i = pair.indexOf("="); return { name: pair.slice(0, i), value: pair.slice(i + 1), domain: ".mercadolivre.com.br", path: "/" };
    });
    await page.setCookie(...cookies);
    for (let pg = 1; pg <= PAGINAS; pg++) {
      if (pg > 1) await sleep(4000 + Math.random() * 4000);
      await page.goto(`https://www.mercadolivre.com.br/cupons/filter?all=true${pg > 1 ? `&page=${pg}` : ""}`, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
      if (/captcha|account-verification|login/.test(page.url())) { console.log(`  página ${pg}: MURO (${page.url().split("?")[0]})`); break; }
      const lista = await page.evaluate(() => {
        const d = window._n && window._n.ctx && window._n.ctx.r && window._n.ctx.r.appProps && window._n.ctx.r.appProps.pageProps && window._n.ctx.r.appProps.pageProps.filteredCouponsData;
        return d ? (d.coupons || []).map((c) => ({
          id: c.campaignId, titulo: c.title && c.title.text, onde: c.initialSubtitle && c.initialSubtitle.text,
          min: c.amount && c.amount.minAmount, cap: c.amount && c.amount.capAmount, codigo: c.code, acao: c.action && c.action.text,
          novoSeguidor: !!c.isNewFollowerCoupon, aviso: c.expirationDate && c.expirationDate.text,
        })) : null;
      }).catch(() => null);
      if (!lista) { console.log(`  página ${pg}: sem dados de cupom`); break; }
      console.log(`  página ${pg}: ${lista.length} cupons`);
      brutos.push(...lista);
    }
  } finally {
    try { browser.disconnect(); } catch (e) { /* ok */ }
    try { execSync(`taskkill /F /T /PID ${child.pid}`, { stdio: "ignore" }); } catch (e) { /* ok */ }
  }

  if (!brutos.length) {
    await alerta("⚠️ *Cupons do ML* — não consegui ler a página de Cupons do Mercado Livre hoje (captcha ou sessão da conta materna expirada). O post de cupons do ML não saiu. Me manda um cURL novo do ML logado pra eu renovar.");
    return;
  }

  // estado do dia: não repete cupom entre o post das 7h45 e o das 9h45
  let estado = { dia: hojeBrt(), usados: [] };
  try { const e = JSON.parse(fs.readFileSync(ESTADO, "utf8")); if (e.dia === estado.dia) estado = e; } catch (e) { /* 1º do dia */ }

  const vistos = new Set();
  const cands = [];
  for (const c of brutos) {
    if (!c.id || !c.titulo || vistos.has(c.id) || estado.usados.includes(c.id)) continue;
    vistos.add(c.id);
    if (c.novoSeguidor || !/selecionados/i.test(c.onde || "")) continue; // só cupom geral (não "em produtos da loja X")
    if (FORA.test(c.titulo)) continue;
    const cap = numero(c.cap);
    if (cap != null && cap < 20) continue; // "limite de R$ 15" não vale o post
    const min = numero(c.min);
    const codigo = /^[A-Z0-9]{4,20}$/.test(c.codigo || "") ? c.codigo : null; // "Aplicar" vem com código criptografado
    const pct = (c.titulo.match(/(\d+)%/) || [])[1];
    const detalhe = [min ? `compra mínima R$ ${min.toLocaleString("pt-BR")}` : "sem compra mínima", cap ? `desconto até R$ ${cap.toLocaleString("pt-BR")}` : null].filter(Boolean).join(" · ");
    const aviso = /hoje|esgotando|amanh/i.test(c.aviso || "") ? c.aviso : null;
    // trim: "*10% OFF *" com espaço antes do asterisco quebra o negrito no WhatsApp
    const titulo = (codigo ? c.titulo.replace(new RegExp(`\\s*com\\s+${codigo}`, "i"), "") : c.titulo).replace(/\s+/g, " ").trim();
    cands.push({ id: c.id, titulo, codigo, detalhe, aviso, min, pct: pct ? +pct : null });
  }
  cands.sort((a, b) => pontua(b) - pontua(a));
  // mistura: até 2 de código (MELISALVA, SEMPREMELI...) + os de "Aplicar" (1 toque na página de Cupons)
  const comCodigo = cands.filter((c) => c.codigo).slice(0, 2);
  const semCodigo = cands.filter((c) => !c.codigo);
  const escolhidos = [...semCodigo.slice(0, POR_POST - comCodigo.length), ...comCodigo];
  if (escolhidos.length < POR_POST) escolhidos.push(...cands.filter((c) => !escolhidos.includes(c)).slice(0, POR_POST - escolhidos.length));
  console.log(`Gerais aproveitáveis: ${cands.length} · escolhidos: ${escolhidos.length}`);
  for (const c of escolhidos) console.log(`  [${pontua(c)}] ${c.titulo}${c.codigo ? ` (código ${c.codigo})` : ""} | ${c.detalhe}${c.aviso ? ` | ${c.aviso}` : ""}`);
  if (escolhidos.length < 3) { console.log("Menos de 3 cupons bons — não posta agora."); return; }
  if (TESTE) return;

  const hora = new Date(Date.now() - 3 * 3600e3).toISOString().slice(11, 13);
  const body = {
    source: "auto", source_channel: "ml:cupons", source_ref: `mlcupons_${hojeBrt()}_${hora}h`, kind: "cupom", platform: "ml",
    perfil: "ofertas-maternas", url: VITRINE, affiliate_url: VITRINE,
    title: `Cupons Mercado Livre de hoje: ${escolhidos.map((c) => c.titulo).join(", ")}`.slice(0, 200),
    extra_text: escolhidos.map((c) => `${c.titulo}${c.codigo ? ` (${c.codigo})` : ""}: ${c.detalhe}`).join("\n").slice(0, 2000),
    coupon_code: escolhidos.find((c) => c.codigo)?.codigo ?? null,
    coupon_meta: { loja: "ml", codes: escolhidos.filter((c) => c.codigo).map((c) => c.codigo), lista: escolhidos.map(({ titulo, codigo, detalhe, aviso }) => ({ titulo, codigo, detalhe, aviso })), campanhas: escolhidos.map((c) => c.id) },
  };
  const r = await fetch("https://app.buscadorgeek.com.br/api/ingest", { method: "POST", headers: { "content-type": "application/json", "x-ingest-secret": await segredoIngest() }, body: JSON.stringify(body) });
  const t = await r.text();
  console.log("ingest", r.status, t.slice(0, 200));
  if (r.ok) { estado.usados.push(...escolhidos.map((c) => c.id)); fs.writeFileSync(ESTADO, JSON.stringify(estado)); }
  else await alerta(`⚠️ *Cupons do ML* — li os cupons mas o painel recusou o post (${r.status}).`);
}

main().catch(async (e) => { console.log("ERRO", e.message); await alerta(`⚠️ *Cupons do ML* — o coletor falhou: ${e.message}`); process.exitCode = 1; });
