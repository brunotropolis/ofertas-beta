// Tio Patinhas — coletor de números do Ofertas Maternas (skill /tio-patinhas).
// Junta vendas (ML, Shopee, Amazon), posts, cliques e grupos e calcula SEMPRE do mesmo jeito,
// pra a análise não depender de conta feita de cabeça. Só LÊ o banco (service role do cofre).
// Uso: node scripts/tio-patinhas/coletar.mjs [--semanas 8] [--meses 6]
// Saída: relatório em texto no terminal + JSON completo em scripts/tio-patinhas/.saida/ultimo.json (fora do git).
//
// Regras fixas (não mudar sem registrar no DIARIO-ofertas-beta.md):
// - Semana = quinta a quarta (BRT). A semana corrente aparece como "parcial".
// - "Conta inteira" = tudo da conta de afiliado (bio, sites, Day, grupos). "Grupos" = só o que dá pra provar
//   que veio dos nossos links: ML etiquetas asofertasmaternas/mrnof*, Shopee utm "<grupo>-<campanha>" ou
//   referrer WhatsApp, Amazon IDs mrnof*-20 (só no relatório mensal). Nunca somar os dois.
// - Cancelado não conta. ML pendente conta (vira confirmado ou cancelado depois).
// - Amazon por semana = série diária da loja manualdorec0c-20 (a 04-20 da Dayane só existe por mês, ~R$100–400).
// - Shopee só tem histórico desde ~31/07 (a API apaga depois de 3 meses; guardamos desde 29/10).
import fs from "fs";
import path from "path";

const env = Object.fromEntries(
  fs.readFileSync("D:/CLAUDE/.env.meta", "utf8").split(/\r?\n/).filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^'(.*)'$/, "$1").replace(/^"(.*)"$/, "$1")]; })
);
const U = env.SUPABASE_URL_OFERTAS_BETA, K = env.SUPABASE_SERVICE_ROLE_OFERTAS_BETA;
const H = { apikey: K, Authorization: `Bearer ${K}` };
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? Number(process.argv[i + 1]) : d; };
const SEMANAS = arg("--semanas", 8), MESES = arg("--meses", 6);
const PERFIL = "8e8332fa-ebd8-41d5-948f-21bb6cd27a97"; // OFERTAS MATERNAS
const REGUA_MANUAL_SEMANA = 3870; // média semanal (ML+Shopee+Amazon) da operação manual até 14/10 (diário 29/10)

// ── leitura paginada (PostgREST corta em 1000) ──────────────────────────────
async function all(p) {
  let out = [];
  for (let o = 0; ; o += 1000) {
    const r = await fetch(`${U}/rest/v1/${p}${p.includes("?") ? "&" : "?"}limit=1000&offset=${o}`, { headers: H });
    const j = await r.json();
    if (!Array.isArray(j)) throw new Error(`${p}: ${JSON.stringify(j).slice(0, 200)}`);
    out = out.concat(j);
    if (j.length < 1000) return out;
  }
}
const rpc = async (fn, body) => (await fetch(`${U}/rest/v1/rpc/${fn}`, { method: "POST", headers: { ...H, "Content-Type": "application/json" }, body: JSON.stringify(body) })).json();

// ── datas BRT ───────────────────────────────────────────────────────────────
const diaBRT = (iso) => new Date(new Date(iso).getTime() - 3 * 3600e3).toISOString().slice(0, 10);
const hoje = diaBRT(new Date().toISOString());
const somaDias = (d, n) => { const x = new Date(d + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const quinta = (d) => { const x = new Date(d + "T12:00:00Z"); return somaDias(d, -((x.getUTCDay() - 4 + 7) % 7)); };
const inicio = (() => { const x = new Date(hoje + "T12:00:00Z"); x.setUTCMonth(x.getUTCMonth() - MESES + 1, 1); return x.toISOString().slice(0, 10); })();
const brl = (v) => "R$ " + Math.round(v).toLocaleString("pt-BR");
const pct = (a, b) => (b ? Math.round((100 * a) / b) + "%" : "-");
const cancel = (s) => /CANCEL/i.test(s || "");
const nomeChave = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim().slice(0, 48);

// ── coleta ──────────────────────────────────────────────────────────────────
const [ml, shp, amzMes, diario, camps, grupos, cliques] = await Promise.all([
  all(`affiliate_sales?select=sold_at,product_name,category,store,gross_value,units,commission,status,sale_type&source=eq.ml&sold_at=gte.${inicio}`),
  all(`affiliate_sales?select=sold_at,product_name,category,gross_value,units,commission,status,sale_type,utm,synced_at&source=eq.shopee&sold_at=gte.${inicio}`),
  all(`affiliate_sales?select=period_start,period_end,product_name,category,store,gross_value,units,clicks,commission&source=eq.amazon&period_start=gte.${inicio}`),
  all(`afiliado_etiquetas_diario?select=fonte,tag,dia,cliques,vendas,comissao&dia=gte.${inicio}`),
  all(`campaigns?select=id,name,categoria&perfil_id=eq.${PERFIL}`),
  all(`grupos_resumo_diario?select=dia,grupos,vagas,pessoas_unicas,entraram,sairam&perfil_id=eq.${PERFIL}&order=dia`),
  all(`link_cliques?select=grupo,slug,clicked_at&bot=eq.false&clicked_at=gte.${somaDias(hoje, -7 * SEMANAS)}`),
]);
const posts = await rpc("inicio_resumo", { p_campaigns: camps.map((c) => c.id), p_since: inicio + "T03:00:00Z" });
const ultimaSync = Object.fromEntries(await Promise.all(["ml", "shopee", "amazon"].map(async (s) => {
  const r = await (await fetch(`${U}/rest/v1/affiliate_sales?select=synced_at&source=eq.${s}&order=synced_at.desc&limit=1`, { headers: H })).json();
  return [s, r[0]?.synced_at ? diaBRT(r[0].synced_at) : null];
})));
const amzDiaUlt = diario.filter((d) => d.fonte === "amazon").map((d) => d.dia).sort().at(-1) || null;

// ── 1. semanas (qui–qua) ────────────────────────────────────────────────────
const sem = {};
const S = (d) => (sem[quinta(d)] ||= { ml: 0, shp: 0, amz: 0, mlGrupos: 0, shpGrupos: 0, posts: 0, cliques: 0, gmvMl: 0, gmvShp: 0, vendasMl: 0, pedShp: 0, itensAmz: 0, cliquesAmz: 0 });
for (const r of ml) if (!cancel(r.status)) { const s = S(diaBRT(r.sold_at)); s.ml += +r.commission || 0; s.gmvMl += +r.gross_value || 0; s.vendasMl++; }
const shpGrupo = (r) => /^\d+-[mfce]/.test(r.utm || "") || r.sale_type === "WhatsApp";
for (const r of shp) if (!cancel(r.status)) { const s = S(diaBRT(r.sold_at)); s.shp += +r.commission || 0; s.gmvShp += +r.gross_value || 0; s.pedShp++; if (shpGrupo(r)) s.shpGrupos += +r.commission || 0; }
for (const d of diario) {
  if (d.fonte === "amazon" && d.tag === "manualdorec0c-20") { const s = S(d.dia); s.amz += +d.comissao; s.itensAmz += d.vendas; s.cliquesAmz += d.cliques; }
  if (d.fonte === "ml" && /^(asofertasmaternas|mrnof)/.test(d.tag)) S(d.dia).mlGrupos += +d.comissao;
}
for (const p of Array.isArray(posts) ? posts : []) S(p.dia).posts += +p.posts;
for (const c of cliques) S(diaBRT(c.clicked_at)).cliques++;
const semanas = Object.keys(sem).sort().filter((w) => w >= quinta(somaDias(hoje, -7 * SEMANAS))).map((w) => {
  const s = sem[w], total = s.ml + s.shp + s.amz, fim = somaDias(w, 6);
  return { semana: w, ate: fim, parcial: fim >= hoje, amzAte: amzDiaUlt && amzDiaUlt < fim ? amzDiaUlt : null, ...s, total };
});
const fechadas = semanas.filter((s) => !s.parcial);
const media = (n) => { const a = fechadas.slice(-n); return a.length ? a.reduce((x, s) => x + s.total, 0) / a.length : 0; };

// ── 2. meses (conta inteira) ────────────────────────────────────────────────
const mes = {};
const M = (m) => (mes[m] ||= { ml: 0, shp: 0, amz: 0, gmvMl: 0, gmvShp: 0, gmvAmz: 0, vendasMl: 0, cancMl: 0, pedShp: 0, cancShp: 0, itensAmz: 0, cliquesAmz: 0, amzOcultos: 0, amzGrupos: 0 });
for (const r of ml) { const m = M(diaBRT(r.sold_at).slice(0, 7)); if (cancel(r.status)) m.cancMl++; else { m.ml += +r.commission || 0; m.gmvMl += +r.gross_value || 0; m.vendasMl++; } }
for (const r of shp) { const m = M(diaBRT(r.sold_at).slice(0, 7)); if (cancel(r.status)) m.cancShp++; else { m.shp += +r.commission || 0; m.gmvShp += +r.gross_value || 0; m.pedShp++; } }
for (const r of amzMes) {
  const m = M(r.period_start.slice(0, 7)), c = +r.commission || 0;
  m.amz += c; m.gmvAmz += +r.gross_value || 0; m.itensAmz += +r.units || 0; m.cliquesAmz += +r.clicks || 0;
  if (!r.product_name || /^(others?|-|none|outros produtos.*)$/i.test(r.product_name)) m.amzOcultos += c;
  if (/^mrnof/.test(r.store || "")) m.amzGrupos += c;
}
const meses = Object.keys(mes).sort().map((m) => ({ mes: m, ...mes[m], total: mes[m].ml + mes[m].shp + mes[m].amz, shopeeIncompleto: m < "2026-08" }));

// ── 3. médias técnicas (últimos 30 dias fechados) ───────────────────────────
const d30 = somaDias(hoje, -30);
const ml30 = ml.filter((r) => diaBRT(r.sold_at) >= d30 && diaBRT(r.sold_at) < hoje);
const shp30 = shp.filter((r) => diaBRT(r.sold_at) >= d30 && diaBRT(r.sold_at) < hoje);
const amz30 = diario.filter((d) => d.fonte === "amazon" && d.dia >= d30 && d.dia < hoje);
const soma = (a, f) => a.reduce((x, r) => x + (+f(r) || 0), 0);
const mlOk = ml30.filter((r) => !cancel(r.status)), shpOk = shp30.filter((r) => !cancel(r.status));
const medias = {
  janela: `${d30} a ${somaDias(hoje, -1)}`,
  ml: { comissao: soma(mlOk, (r) => r.commission), vendas: mlOk.length, porVenda: soma(mlOk, (r) => r.commission) / (mlOk.length || 1), taxa: soma(mlOk, (r) => r.commission) / (soma(mlOk, (r) => r.gross_value) || 1), ticket: soma(mlOk, (r) => r.gross_value) / (mlOk.length || 1), cancelamento: (ml30.length - mlOk.length) / (ml30.length || 1), indireta: soma(mlOk.filter((r) => r.sale_type === "INDIRECT"), (r) => r.commission) / (soma(mlOk, (r) => r.commission) || 1) },
  shopee: { comissao: soma(shpOk, (r) => r.commission), itens: shpOk.length, porItem: soma(shpOk, (r) => r.commission) / (shpOk.length || 1), taxa: soma(shpOk, (r) => r.commission) / (soma(shpOk, (r) => r.gross_value) || 1), cancelamento: (shp30.length - shpOk.length) / (shp30.length || 1), viaGrupos: soma(shpOk.filter(shpGrupo), (r) => r.commission) / (soma(shpOk, (r) => r.commission) || 1) },
  amazon: { comissao: soma(amz30, (d) => d.comissao), itens: soma(amz30, (d) => d.vendas), cliques: soma(amz30, (d) => d.cliques), porItem: soma(amz30, (d) => d.comissao) / (soma(amz30, (d) => d.vendas) || 1), conversao: soma(amz30, (d) => d.vendas) / (soma(amz30, (d) => d.cliques) || 1) },
};

// ── 4. top produtos ─────────────────────────────────────────────────────────
function top(rows, nome, com, n = 10) {
  const t = {};
  for (const r of rows) { const k = nomeChave(nome(r)); if (!k) continue; (t[k] ||= { nome: String(nome(r)).slice(0, 70), comissao: 0, vendas: 0, gmv: 0 }); t[k].comissao += com(r); t[k].vendas += r.units ? +r.units : 1; t[k].gmv += +r.gross_value || 0; }
  return Object.values(t).sort((a, b) => b.comissao - a.comissao).slice(0, n);
}
const d90 = somaDias(hoje, -90);
const amzVisiveis = amzMes.filter((r) => r.product_name && !/^(others?|-|none|outros produtos.*)$/i.test(r.product_name));
const tops = {
  ml30: top(mlOk, (r) => r.product_name, (r) => +r.commission || 0),
  ml90: top(ml.filter((r) => !cancel(r.status) && diaBRT(r.sold_at) >= d90), (r) => r.product_name, (r) => +r.commission || 0),
  shopee90: top(shp.filter((r) => !cancel(r.status) && diaBRT(r.sold_at) >= d90), (r) => r.product_name, (r) => +r.commission || 0),
  shopeeGrupos90: top(shp.filter((r) => !cancel(r.status) && diaBRT(r.sold_at) >= d90 && shpGrupo(r)), (r) => r.product_name, (r) => +r.commission || 0, 8),
  amazon6m: top(amzVisiveis, (r) => r.product_name, (r) => +r.commission || 0),
  amazonMesAtual: top(amzVisiveis.filter((r) => r.period_start.slice(0, 7) === hoje.slice(0, 7)), (r) => r.product_name, (r) => +r.commission || 0, 8),
  categoriasMl90: Object.entries(ml.filter((r) => !cancel(r.status) && diaBRT(r.sold_at) >= d90).reduce((a, r) => ((a[r.category || "?"] = (a[r.category || "?"] || 0) + (+r.commission || 0)), a), {})).sort((a, b) => b[1] - a[1]).slice(0, 8),
};

// ── 5. grupos, posts e cliques ──────────────────────────────────────────────
const g = grupos.at(-1) || null, g7 = grupos.filter((x) => x.dia > somaDias(hoje, -7));
const cliquesPorGrupo = Object.entries(cliques.reduce((a, c) => ((a[c.grupo ?? "?"] = (a[c.grupo ?? "?"] || 0) + 1), a), {})).sort((a, b) => b[1] - a[1]);
const postsPorLoja = {};
for (const p of Array.isArray(posts) ? posts : []) if (p.dia >= somaDias(hoje, -7)) postsPorLoja[p.plataforma] = (postsPorLoja[p.plataforma] || 0) + +p.posts;
const operacao = {
  grupos: g && { dia: g.dia, grupos: g.grupos, pessoas: g.pessoas_unicas, vagas: g.vagas, entraram7d: soma(g7, (x) => x.entraram), sairam7d: soma(g7, (x) => x.sairam) },
  posts7dPorLoja: postsPorLoja,
  cliquesTopGrupos: cliquesPorGrupo.slice(0, 8), cliquesPioresGrupos: cliquesPorGrupo.slice(-5),
};

// ── 6. alertas automáticos ──────────────────────────────────────────────────
const alertas = [];
const op0 = operacao.grupos;
const ult = fechadas.at(-1), m8 = media(8);
if (ult && m8 && ult.total < 0.8 * m8) alertas.push(`Semana ${ult.semana} fechou em ${brl(ult.total)}, ${pct(ult.total, m8)} da média de 8 semanas (${brl(m8)}).`);
for (const [k, nome] of [["ml", "ML"], ["shp", "Shopee"], ["amz", "Amazon"]]) {
  const a = fechadas.slice(-2).reduce((x, s) => x + s[k], 0) / 2, b = fechadas.slice(-8, -2).reduce((x, s) => x + s[k], 0) / Math.max(1, fechadas.slice(-8, -2).length);
  if (b && a < 0.7 * b) alertas.push(`${nome} caiu: ${brl(a)}/sem nas 2 últimas contra ${brl(b)}/sem antes (${pct(a, b)}).`);
}
if (op0 && op0.sairam7d > op0.entraram7d) alertas.push(`Grupos perdendo gente: +${op0.entraram7d} / -${op0.sairam7d} em 7 dias (${op0.pessoas} pessoas hoje).`);
for (const [s, d] of Object.entries(ultimaSync)) if (!d || d < somaDias(hoje, -3)) alertas.push(`Dado velho: ${s} sincronizado por último em ${d || "nunca"}.`);
if (!amzDiaUlt || amzDiaUlt < somaDias(hoje, -3)) alertas.push(`Amazon por dia parada em ${amzDiaUlt || "nunca"} (tarefa amazon-vendas-sync roda a cada 2 dias com o PC ligado).`);

const saida = { geradoEm: new Date().toISOString(), hoje, inicio, regua: { manualSemana: REGUA_MANUAL_SEMANA }, ultimaSync, amzDiaUlt, semanas, mediaSemanal4: media(4), mediaSemanal8: media(8), meses, medias, tops, operacao, alertas };
const dir = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")), ".saida");
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "ultimo.json"), JSON.stringify(saida, null, 1));

// ── relatório em texto (o que a skill lê) ───────────────────────────────────
const L = [];
L.push(`TIO PATINHAS · Ofertas Maternas · gerado ${hoje} · dados desde ${inicio}`);
L.push(`Última sync: ML ${ultimaSync.ml} · Shopee ${ultimaSync.shopee} · Amazon mês ${ultimaSync.amazon} · Amazon dia ${amzDiaUlt}`);
L.push(`\n== SEMANAS (qui–qua, comissão CONTA INTEIRA; grupos = só o provado) ==`);
for (const s of semanas) L.push(`${s.semana}${s.parcial ? " (parcial)" : ""}${s.amzAte ? ` (Amazon até ${s.amzAte})` : ""} | total ${brl(s.total)} | ML ${brl(s.ml)} · Shopee ${brl(s.shp)} · Amazon ${brl(s.amz)} | grupos: ML ${brl(s.mlGrupos)} · Shopee ${brl(s.shpGrupos)} | posts (4 campanhas) ${s.posts} · cliques ${s.cliques} | Amazon conv ${pct(s.itensAmz, s.cliquesAmz)}`);
L.push(`Média 4 sem ${brl(media(4))} · 8 sem ${brl(media(8))} · régua manual ${brl(REGUA_MANUAL_SEMANA)}`);
L.push(`\n== MESES (conta inteira) ==`);
for (const m of meses) L.push(`${m.mes} | total ${brl(m.total)}${m.shopeeIncompleto ? " (sem Shopee completa)" : ""} | ML ${brl(m.ml)} (${m.vendasMl} vendas, ${m.cancMl} canc) · Shopee ${brl(m.shp)} (${m.pedShp} itens) · Amazon ${brl(m.amz)} (${m.itensAmz} itens, ocultos ${brl(m.amzOcultos)}, IDs grupos ${brl(m.amzGrupos)}) | vendido ML ${brl(m.gmvMl)} · Shopee ${brl(m.gmvShp)} · Amazon ${brl(m.gmvAmz)}`);
const md = medias;
L.push(`\n== MÉDIAS (${md.janela}) ==`);
L.push(`ML: ${brl(md.ml.comissao)} · ${md.ml.vendas} vendas · R$ ${md.ml.porVenda.toFixed(2)}/venda · taxa ${(100 * md.ml.taxa).toFixed(1)}% · ticket ${brl(md.ml.ticket)} · cancel ${(100 * md.ml.cancelamento).toFixed(1)}% · indireta ${pct(md.ml.indireta, 1)}`);
L.push(`Shopee: ${brl(md.shopee.comissao)} · ${md.shopee.itens} itens · R$ ${md.shopee.porItem.toFixed(2)}/item · taxa ${(100 * md.shopee.taxa).toFixed(1)}% · cancel ${(100 * md.shopee.cancelamento).toFixed(1)}% · via grupos ${pct(md.shopee.viaGrupos, 1)}`);
L.push(`Amazon (0c-20): ${brl(md.amazon.comissao)} · ${md.amazon.itens} itens · R$ ${md.amazon.porItem.toFixed(2)}/item · ${md.amazon.cliques} cliques · conversão ${(100 * md.amazon.conversao).toFixed(1)}%`);
const lt = (t, a) => { L.push(`\n== ${t} ==`); for (const x of a) L.push(`${brl(x.comissao)} · ${x.vendas}un · ${x.nome}`); };
lt("TOP ML 30d", tops.ml30); lt("TOP ML 90d", tops.ml90); lt("TOP SHOPEE 90d", tops.shopee90); lt("TOP SHOPEE vindo dos grupos 90d", tops.shopeeGrupos90);
lt(`TOP AMAZON ${MESES} meses (sem os ocultos)`, tops.amazon6m); lt("TOP AMAZON mês atual", tops.amazonMesAtual);
L.push(`\n== CATEGORIAS ML 90d ==\n` + tops.categoriasMl90.map(([c, v]) => `${brl(v)} ${c}`).join(" · "));
const op = operacao;
L.push(`\n== OPERAÇÃO ==`);
if (op.grupos) L.push(`Grupos ${op.grupos.grupos} · ${op.grupos.pessoas} pessoas únicas (${op.grupos.dia}) · 7d: +${op.grupos.entraram7d} / -${op.grupos.sairam7d}`);
L.push(`Posts 7d por loja (soma das 4 campanhas): ${JSON.stringify(op.posts7dPorLoja)}`);
L.push(`Cliques: top grupos ${op.cliquesTopGrupos.map(([gr, n]) => `#${gr}=${n}`).join(" ")} · menos cliques ${op.cliquesPioresGrupos.map(([gr, n]) => `#${gr}=${n}`).join(" ")}`);
L.push(`\n== ALERTAS ==\n` + (alertas.length ? alertas.map((a) => "! " + a).join("\n") : "nenhum"));
console.log(L.join("\n"));
