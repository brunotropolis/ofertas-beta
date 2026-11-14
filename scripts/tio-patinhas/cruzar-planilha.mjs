// Tio Patinhas: cruza a planilha da equipe (ofertas_historico_comissao, operação manual) com o que as
// plataformas dizem (affiliate_sales ML/Shopee/Amazon + afiliado_etiquetas_diario Amazon por dia).
// Só LÊ. Uso: node scripts/tio-patinhas/cruzar-planilha.mjs   Saída: texto + .saida/cruzamento.json
import fs from "fs";
const env = Object.fromEntries(fs.readFileSync("D:/CLAUDE/.env.meta", "utf8").split(/\r?\n/).filter((l) => /^[A-Z0-9_]+=/.test(l))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"(.*)"$/, "$1")]; }));
const U = env.SUPABASE_URL_OFERTAS_BETA, K = env.SUPABASE_SERVICE_ROLE_OFERTAS_BETA, H = { apikey: K, Authorization: `Bearer ${K}` };
async function all(p) { let o = []; for (let i = 0; ; i += 1000) { const j = await (await fetch(`${U}/rest/v1/${p}&limit=1000&offset=${i}`, { headers: H })).json(); if (!Array.isArray(j)) throw new Error(JSON.stringify(j)); o = o.concat(j); if (j.length < 1000) return o; } }
const diaBRT = (iso) => new Date(new Date(iso).getTime() - 3 * 3600e3).toISOString().slice(0, 10);
const cancel = (s) => /CANCEL/i.test(s || "");
const f = (n) => "R$ " + Math.round(n).toLocaleString("pt-BR");

const [plan, ml, shp, amzMes, amzDia] = await Promise.all([
  all("ofertas_historico_comissao?select=dia,loja,comissao"),
  all("affiliate_sales?select=sold_at,commission,status&source=eq.ml"),
  all("affiliate_sales?select=sold_at,commission,status&source=eq.shopee"),
  all("affiliate_sales?select=period_start,commission,store&source=eq.amazon"),
  all("afiliado_etiquetas_diario?select=dia,comissao,tag&fonte=eq.amazon&tag=eq.manualdorec0c-20"),
]);

// dia × loja
const P = {}, R = {}; // planilha, real (plataforma)
const add = (o, d, l, v) => { o[d] ??= {}; o[d][l] = (o[d][l] || 0) + v; };
for (const r of plan) add(P, r.dia, r.loja, +r.comissao || 0);
for (const r of ml) if (!cancel(r.status)) add(R, diaBRT(r.sold_at), "ml", +r.commission || 0);
for (const r of shp) if (!cancel(r.status)) add(R, diaBRT(r.sold_at), "shopee", +r.commission || 0);
for (const r of amzDia) add(R, r.dia, "amazon", +r.comissao || 0);
const amzMesReal = {}; // Amazon por mês (relatório mensal, todas as lojas da conta)
for (const r of amzMes) { const m = r.period_start.slice(0, 7); amzMesReal[m] = (amzMesReal[m] || 0) + (+r.commission || 0); }

// cobertura de cada fonte
const cob = (o, l) => { const ds = Object.keys(o).filter((d) => o[d][l]).sort(); return ds.length ? [ds[0], ds[ds.length - 1]] : null; };
const lojas = ["ml", "shopee", "amazon"];
console.log("== COBERTURA ==");
for (const l of lojas) console.log(l.padEnd(7), "planilha", cob(P, l)?.join(" a ") ?? "-", "| plataforma", cob(R, l)?.join(" a ") ?? "-");
console.log("amazon mensal (relatório) meses:", Object.keys(amzMesReal).sort().join(" "));

// mês × loja, só nos dias que as DUAS fontes cobrem
const out = { meses: [], dias: {} };
console.log("\n== MÊS A MÊS (só dias cobertos pelas duas fontes) ==");
for (const l of lojas) {
  const ini = [cob(P, l)?.[0], cob(R, l)?.[0]].sort().pop(), fim = [cob(P, l)?.[1], cob(R, l)?.[1]].sort()[0];
  if (!ini || !fim || ini > fim) { console.log(l, "sem período em comum"); continue; }
  const M = {};
  for (const d of Object.keys({ ...P, ...R })) if (d >= ini && d <= fim) {
    const m = d.slice(0, 7); M[m] ??= { p: 0, r: 0, dias: 0, difDia: [] };
    const p = P[d]?.[l] || 0, r = R[d]?.[l] || 0; M[m].p += p; M[m].r += r; M[m].dias++; M[m].difDia.push({ d, p, r });
  }
  console.log(`-- ${l} (${ini} a ${fim})`);
  for (const [m, v] of Object.entries(M).sort()) {
    const dif = v.p - v.r, pct = v.r ? (dif / v.r) * 100 : 0;
    const iguais = v.difDia.filter((x) => Math.abs(x.p - x.r) <= Math.max(2, 0.05 * x.r)).length;
    console.log(`${m} | planilha ${f(v.p)} | plataforma ${f(v.r)} | diferença ${dif >= 0 ? "+" : ""}${f(dif)} (${pct.toFixed(0)}%) | dias batendo ${iguais}/${v.dias}`);
    out.meses.push({ loja: l, mes: m, planilha: +v.p.toFixed(2), plataforma: +v.r.toFixed(2), dias: v.dias, dias_batendo: iguais });
    out.dias[`${l}:${m}`] = v.difDia.sort((a, b) => Math.abs(b.p - b.r) - Math.abs(a.p - a.r)).slice(0, 5);
  }
}
// Amazon: planilha por mês x relatório mensal da Amazon (pega também os meses sem série diária)
console.log("\n== AMAZON: planilha × relatório mensal da Amazon ==");
const pm = {}; for (const r of plan) if (r.loja === "amazon") { const m = r.dia.slice(0, 7); pm[m] = (pm[m] || 0) + (+r.comissao || 0); }
for (const m of Object.keys(amzMesReal).sort()) if (pm[m] != null) console.log(`${m} | planilha ${f(pm[m])} | Amazon ${f(amzMesReal[m])} | dif ${f(pm[m] - amzMesReal[m])}`);

// planilha: totais por mês e loja (histórico da era manual)
console.log("\n== PLANILHA: total por mês (todas as lojas) ==");
const tm = {}; for (const r of plan) { const m = r.dia.slice(0, 7); tm[m] ??= {}; tm[m][r.loja] = (tm[m][r.loja] || 0) + (+r.comissao || 0); }
for (const [m, v] of Object.entries(tm).sort()) console.log(m, f(Object.values(v).reduce((a, b) => a + b, 0)), Object.entries(v).sort((a, b) => b[1] - a[1]).map(([k, x]) => `${k} ${f(x)}`).join(" · "));
out.planilha_mes = tm;
fs.mkdirSync("scripts/tio-patinhas/.saida", { recursive: true });
fs.writeFileSync("scripts/tio-patinhas/.saida/cruzamento.json", JSON.stringify(out, null, 1));
