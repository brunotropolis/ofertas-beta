// 25/11 (Bruno: "tô vendo abrir vários links da magalu no meu navegador... pq não funciona como o mercado livre que roda
// em off?"): leitura de preço/estoque da Magalu SEM navegador. A página do produto na vitrine da Day
// (magazinevoce.com.br/magazinemanualdorn/...) responde pro PC com o __NEXT_DATA__ completo; o magazineluiza.com.br dá 403.
// Pega os pedidos pendentes de magalu_produtos (o publicador pede leitura antes de postar) e grava igual a extensão gravava
// (rota /api/extensao/magalu POST): magalu_produtos + ofertas Magalu ainda não postadas desse produto.
// Uso: node leitor_magalu.mjs   · agendado no Windows (OfertasMagalu-Leitor), a cada 5 min das 7h50 às 20h.
import fs from "node:fs";
const E = Object.fromEntries(fs.readFileSync("D:/CLAUDE/.env.meta", "utf8").split(/\r?\n/).map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^"|"$/g, "")]));
const K = E.SUPABASE_SERVICE_ROLE_OFERTAS_BETA, U = "https://qkherjtsvakmpkxebuwy.supabase.co/rest/v1/";
const H = { apikey: K, Authorization: `Bearer ${K}`, "content-type": "application/json" };
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36";
const MAX_TENTATIVAS = 5;
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null; };
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));
const api = async (p, o = {}) => { const r = await fetch(U + p, { ...o, headers: { ...H, ...(o.headers || {}) } }); return r.status === 204 ? null : r.json().catch(() => null); };

async function ler(caminho) {
  const r = await fetch(`https://www.magazinevoce.com.br/magazinemanualdorn/${String(caminho).replace(/^\/+/, "")}`, { headers: { "user-agent": UA, "accept-language": "pt-BR,pt;q=0.9", accept: "text/html" }, signal: AbortSignal.timeout(25000) });
  if (r.status === 404) return { disponivel: false, erro: null };
  if (!r.ok) return { erro: `HTTP ${r.status}` };
  const m = (await r.text()).match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return { erro: "página sem dados" };
  const p = JSON.parse(m[1])?.props?.pageProps?.data?.product;
  if (!p) return { erro: "sem produto" };
  const preco = num(p.price?.bestPrice), cheio = num(p.price?.price);
  return { titulo: String(p.title || "").slice(0, 300) || null, imagem: p.image ? String(p.image).replace("{w}x{h}", "800x800") : null,
    preco, preco_de: cheio && preco && cheio > preco ? cheio : null, preco_pix: preco, disponivel: p.available !== false };
}

const pend = await api(`magalu_produtos?status=eq.pendente&tentativas=lt.${MAX_TENTATIVAS}&select=sku,caminho,tentativas&order=pedido_em.desc&limit=60`);
let ok = 0, erros = 0, ofertas = 0;
for (const it of pend ?? []) {
  let r; try { r = await ler(it.caminho); } catch (e) { r = { erro: e.message }; }
  if (r.erro || (!r.preco && r.disponivel !== false)) {
    await api(`magalu_produtos?sku=eq.${it.sku}`, { method: "PATCH", body: JSON.stringify({ status: it.tentativas + 1 >= MAX_TENTATIVAS ? "erro" : "pendente", erro: String(r.erro || "sem preço na página").slice(0, 200), tentativas: it.tentativas + 1 }) });
    erros++; await dorme(1500); continue;
  }
  await api(`magalu_produtos?sku=eq.${it.sku}`, { method: "PATCH", body: JSON.stringify({ titulo: r.titulo ?? null, imagem: r.imagem ?? null, preco: r.preco ?? null, preco_de: r.preco_de ?? null, preco_pix: r.preco_pix ?? null, disponivel: r.disponivel, status: "ok", erro: null, lido_em: new Date().toISOString() }) });
  ok++;
  const offs = await api(`offers?platform=eq.magalu&status=in.(draft,queued)&url=like.*%2Fp%2F${it.sku}%2F*&select=id,title,image_url,price_current,price_original`);
  for (const o of offs ?? []) {
    const patch = {};
    if (!r.disponivel) {
      patch.status = "error";
      await api(`publication_queue?offer_id=eq.${o.id}&status=eq.pending`, { method: "DELETE" });
    } else {
      if (!o.image_url && r.imagem) patch.image_url = r.imagem;
      if (!o.title && r.titulo) patch.title = r.titulo;
      if (r.preco && o.price_current !== r.preco) {
        patch.price_current = r.preco;
        const orig = r.preco_de && r.preco_de > r.preco * 1.02 ? r.preco_de : o.price_original && o.price_original > r.preco * 1.02 ? o.price_original : null;
        patch.price_original = orig; patch.discount_pct = orig ? Math.round((1 - r.preco / orig) * 100) : null;
      }
    }
    if (Object.keys(patch).length) { await api(`offers?id=eq.${o.id}`, { method: "PATCH", body: JSON.stringify(patch) }); ofertas++; }
  }
  await dorme(1500);
}
console.log(new Date().toISOString(), "magalu", JSON.stringify({ pendentes: pend?.length ?? 0, ok, erros, ofertas }));
