"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Loader2, Plus, RotateCcw, Save, SlidersHorizontal, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { categoriaDe, palavraQueCasou, temMarca, type CategoriaRegra, type RegrasCampanha } from "@/lib/regras-campanha";

// Aba "Regras de produto" da campanha (26/Nov): o que o robô posta nessa campanha. Lida pelo auto-enqueue.
const vazia: RegrasCampanha = { so_categorias: false, marcas: [], categorias: [], teto_shopee: null, sem_marca_abaixo_de: null, shopee_generico_abaixo_de: null };
const lista = (s: string) => s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));
const inputCls = "bg-zinc-900/70 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-sm text-zinc-100 outline-none focus:border-orange-400/60 w-full";

export default function RegrasTab({ campaignId }: { campaignId: string }) {
  const [regras, setRegras] = useState<RegrasCampanha | null>(null);
  const [original, setOriginal] = useState<string>("null");
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [aberta, setAberta] = useState<number | null>(null);
  const [teste, setTeste] = useState("");
  const [testePreco, setTestePreco] = useState("");

  useEffect(() => {
    (async () => {
      const r = await fetch(`/api/campanhas/${campaignId}/regras`, { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (r.ok) { setRegras(j.regras); setOriginal(JSON.stringify(j.regras)); }
      else setMsg(j.error || "Não consegui carregar as regras");
      setCarregando(false);
    })();
  }, [campaignId]);

  const mudou = JSON.stringify(regras) !== original;
  const r = regras ?? vazia;
  const set = (patch: Partial<RegrasCampanha>) => setRegras({ ...r, ...patch });
  const setCat = (i: number, patch: Partial<CategoriaRegra>) => set({ categorias: r.categorias.map((c, k) => (k === i ? { ...c, ...patch } : c)) });
  const mover = (i: number, d: -1 | 1) => { const l = [...r.categorias]; const j = i + d; if (j < 0 || j >= l.length) return; [l[i], l[j]] = [l[j], l[i]]; set({ categorias: l }); };
  const somaCotas = r.categorias.reduce((s, c) => s + (Number(c.meta) || 0), 0);

  async function salvar() {
    setSalvando(true); setMsg(null);
    const res = await fetch(`/api/campanhas/${campaignId}/regras`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ regras }) });
    const j = await res.json().catch(() => ({}));
    setSalvando(false);
    if (!res.ok) { setMsg(j.error || "Não consegui salvar"); return; }
    setRegras(j.regras); setOriginal(JSON.stringify(j.regras));
    setMsg("Regras salvas. Valem a partir da próxima rodada do robô (até 5 minutos).");
  }

  const resultado = useMemo(() => {
    if (!teste.trim()) return null;
    const cat = categoriaDe(r, { title: teste });
    const marca = temMarca(r, teste);
    const preco = num(testePreco);
    const motivos: string[] = [];
    if (r.so_categorias && !cat) motivos.push("não bate em nenhuma categoria");
    if (preco != null && r.sem_marca_abaixo_de != null && preco < r.sem_marca_abaixo_de && !marca) motivos.push(`sem marca boa e abaixo de R$ ${r.sem_marca_abaixo_de}`);
    if (cat && preco != null && cat.preco_min != null && preco < cat.preco_min) motivos.push(`abaixo do preço mínimo da cota (R$ ${cat.preco_min})`);
    if (cat && preco != null && cat.preco_max != null && preco > cat.preco_max) motivos.push(`acima do preço máximo da cota (R$ ${cat.preco_max})`);
    const palavra = cat ? palavraQueCasou(cat.palavras, teste) : null;
    return { cat, marca, palavra, motivos };
  }, [teste, testePreco, r]);

  if (carregando) return <div className="glass rounded-2xl p-8 flex justify-center mb-8"><Loader2 className="w-5 h-5 text-zinc-500 animate-spin" /></div>;

  return (
    <section className="glass rounded-2xl p-5 mb-8 flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-white"><SlidersHorizontal className="w-4 h-4 text-orange-400" strokeWidth={1.75} />Regras de produto</h3>
          <p className="text-xs text-zinc-500 mt-1 max-w-2xl">O que o robô posta nesta campanha. As palavras valem sem acento e sem maiúscula, no começo da palavra (&quot;toalha&quot; pega &quot;toalhas&quot;); palavra de até 4 letras só vale inteira. A ordem das categorias importa: o produto entra na primeira que bater. Bebê fora do Lar, masculino fora do Mãe e a lista de Bloqueados continuam valendo sempre.</p>
        </div>
        <div className="flex items-center gap-2">
          {mudou && <button onClick={() => setRegras(JSON.parse(original))} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-300 hover:text-white"><RotateCcw className="w-3.5 h-3.5" />Desfazer</button>}
          <button onClick={salvar} disabled={!mudou || salvando} className="inline-flex items-center gap-1.5 text-sm px-4 py-1.5 rounded-lg bg-orange-500/90 hover:bg-orange-500 text-white disabled:opacity-40">
            {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}Salvar
          </button>
        </div>
      </div>

      {msg && <p className="text-sm text-zinc-200 bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 py-2">{msg}</p>}

      {!regras && (
        <div className="text-sm text-zinc-400 bg-zinc-900/40 border border-dashed border-zinc-700 rounded-xl p-4">
          Esta campanha ainda não tem regras de produto: o robô usa só o mix padrão.{" "}
          <button onClick={() => setRegras({ ...vazia })} className="text-orange-300 hover:text-orange-200">Criar regras</button>
        </div>
      )}

      {regras && (<>
        <div className="grid md:grid-cols-4 gap-3">
          <label className="text-xs text-zinc-400 flex items-center gap-2 md:col-span-4">
            <input id="rg-so" type="checkbox" checked={!!r.so_categorias} onChange={(e) => set({ so_categorias: e.target.checked })} className="accent-orange-500" />
            Só posta produto que bate em alguma categoria abaixo
          </label>
          <label className="text-xs text-zinc-400 flex flex-col gap-1">Teto de Shopee (% dos posts)
            <input id="rg-shopee" className={inputCls} value={r.teto_shopee ?? ""} onChange={(e) => set({ teto_shopee: num(e.target.value) })} placeholder="sem teto" inputMode="decimal" />
          </label>
          <label className="text-xs text-zinc-400 flex flex-col gap-1">Sem marca boa abaixo de (R$) fica fora
            <input id="rg-semmarca" className={inputCls} value={r.sem_marca_abaixo_de ?? ""} onChange={(e) => set({ sem_marca_abaixo_de: num(e.target.value) })} placeholder="não usa" inputMode="decimal" />
          </label>
          <label className="text-xs text-zinc-400 flex flex-col gap-1 md:col-span-2">Shopee sem marca abaixo de (R$) só com nota 4,8 e 1.000+ vendidos
            <input id="rg-shopeegen" className={inputCls} value={r.shopee_generico_abaixo_de ?? ""} onChange={(e) => set({ shopee_generico_abaixo_de: num(e.target.value) })} placeholder="não usa" inputMode="decimal" />
          </label>
        </div>

        <label className="text-xs text-zinc-400 flex flex-col gap-1">Marcas boas ({r.marcas.length}) · separe com vírgula
          <textarea id="rg-marcas" rows={3} className={cn(inputCls, "resize-y")} value={r.marcas.join(", ")} onChange={(e) => set({ marcas: lista(e.target.value) })} />
        </label>

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-sm font-medium text-zinc-200">Categorias ({r.categorias.length})</p>
          <p className={cn("text-xs", somaCotas > 100 ? "text-red-300" : "text-zinc-500")}>Soma das cotas: {somaCotas}% {somaCotas > 100 ? "(passa de 100%)" : "(o resto fica pro mix padrão)"}</p>
        </div>

        <div className="flex flex-col gap-2">
          {r.categorias.map((c, i) => (
            <div key={i} className="border border-zinc-800 rounded-xl bg-zinc-900/40">
              <div className="flex items-center gap-2 px-3 py-2 flex-wrap">
                <button onClick={() => setAberta(aberta === i ? null : i)} className="text-left flex-1 min-w-[180px]">
                  <span className="text-sm text-zinc-100 font-medium">{c.nome || "(sem nome)"}</span>
                  <span className="text-xs text-zinc-500 ml-2">{c.meta ? `cota ${c.meta}%` : "sem cota"}{c.teto != null ? ` · teto ${c.teto}%` : ""}{c.loja ? ` · loja ${c.loja}` : ""} · {c.palavras.length} palavras</span>
                </button>
                <button onClick={() => mover(i, -1)} aria-label="Subir" className="text-zinc-500 hover:text-zinc-200"><ArrowUp className="w-4 h-4" /></button>
                <button onClick={() => mover(i, 1)} aria-label="Descer" className="text-zinc-500 hover:text-zinc-200"><ArrowDown className="w-4 h-4" /></button>
                <button onClick={() => set({ categorias: r.categorias.filter((_, k) => k !== i) })} aria-label={`Tirar ${c.nome}`} className="text-red-300 hover:text-red-200"><Trash2 className="w-4 h-4" /></button>
              </div>
              {aberta === i && (
                <div className="px-3 pb-3 grid md:grid-cols-6 gap-2">
                  <label className="text-xs text-zinc-400 flex flex-col gap-1 md:col-span-2">Nome<input id={`rg-nome-${i}`} className={inputCls} value={c.nome} onChange={(e) => setCat(i, { nome: e.target.value })} /></label>
                  <label className="text-xs text-zinc-400 flex flex-col gap-1">Cota (%)<input id={`rg-meta-${i}`} className={inputCls} value={c.meta ?? 0} onChange={(e) => setCat(i, { meta: num(e.target.value) ?? 0 })} inputMode="decimal" /></label>
                  <label className="text-xs text-zinc-400 flex flex-col gap-1">Teto (%)<input id={`rg-teto-${i}`} className={inputCls} value={c.teto ?? ""} onChange={(e) => setCat(i, { teto: num(e.target.value) })} placeholder="sem teto" inputMode="decimal" /></label>
                  <label className="text-xs text-zinc-400 flex flex-col gap-1">Preço mín. (R$)<input id={`rg-pmin-${i}`} className={inputCls} value={c.preco_min ?? ""} onChange={(e) => setCat(i, { preco_min: num(e.target.value) })} inputMode="decimal" /></label>
                  <label className="text-xs text-zinc-400 flex flex-col gap-1">Preço máx. (R$)<input id={`rg-pmax-${i}`} className={inputCls} value={c.preco_max ?? ""} onChange={(e) => setCat(i, { preco_max: num(e.target.value) })} inputMode="decimal" /></label>
                  <label className="text-xs text-zinc-400 flex flex-col gap-1">Desconto mín. (%)<input id={`rg-desc-${i}`} className={inputCls} value={c.desconto_min ?? ""} onChange={(e) => setCat(i, { desconto_min: num(e.target.value) })} inputMode="decimal" /></label>
                  <label className="text-xs text-zinc-400 flex flex-col gap-1">Loja do link (opcional)<input id={`rg-loja-${i}`} className={inputCls} value={c.loja ?? ""} onChange={(e) => setCat(i, { loja: e.target.value || null })} placeholder="ex.: natura.com" /></label>
                  <div className="md:col-span-4 flex items-center gap-4 flex-wrap text-xs text-zinc-400">
                    <label className="flex items-center gap-1.5"><input type="checkbox" checked={!!c.marca_primeiro} onChange={(e) => setCat(i, { marca_primeiro: e.target.checked })} className="accent-orange-500" />Marca boa primeiro</label>
                    <label className="flex items-center gap-1.5"><input type="checkbox" checked={!!c.so_marca} onChange={(e) => setCat(i, { so_marca: e.target.checked })} className="accent-orange-500" />Só com marca boa</label>
                    <label className="flex items-center gap-1.5"><input type="checkbox" checked={!!c.variar} onChange={(e) => setCat(i, { variar: e.target.checked })} className="accent-orange-500" />Variar o tipo (máx. 2 iguais por dia)</label>
                  </div>
                  <label className="text-xs text-zinc-400 flex flex-col gap-1 md:col-span-6">Palavras ({c.palavras.length}) · separe com vírgula
                    <textarea id={`rg-pal-${i}`} rows={4} className={cn(inputCls, "resize-y")} value={c.palavras.join(", ")} onChange={(e) => setCat(i, { palavras: lista(e.target.value) })} />
                  </label>
                </div>
              )}
            </div>
          ))}
          <button onClick={() => { set({ categorias: [...r.categorias, { nome: "Nova categoria", palavras: [], meta: 0, teto: null, marca_primeiro: true }] }); setAberta(r.categorias.length); }}
            className="self-start inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-300 hover:text-white"><Plus className="w-4 h-4" />Nova categoria</button>
        </div>

        <div className="border-t border-zinc-800 pt-4 grid md:grid-cols-4 gap-2 items-start">
          <label className="text-xs text-zinc-400 flex flex-col gap-1 md:col-span-3">Testar um produto
            <input id="rg-teste" className={inputCls} value={teste} onChange={(e) => setTeste(e.target.value)} placeholder="Cole o nome de um produto" />
          </label>
          <label className="text-xs text-zinc-400 flex flex-col gap-1">Preço (R$, opcional)
            <input id="rg-teste-preco" className={inputCls} value={testePreco} onChange={(e) => setTestePreco(e.target.value)} inputMode="decimal" />
          </label>
          {resultado && (
            <p className={cn("md:col-span-4 text-sm rounded-lg px-3 py-2 border", resultado.motivos.length ? "text-red-200 border-red-500/30 bg-red-500/10" : "text-emerald-200 border-emerald-500/30 bg-emerald-500/10")}>
              {resultado.cat ? <>Categoria: <b>{resultado.cat.nome}</b> (pela palavra &quot;{resultado.palavra ?? resultado.cat.loja}&quot;)</> : "Nenhuma categoria"} · {resultado.marca ? "tem marca boa" : "sem marca boa"}
              {resultado.motivos.length ? <> · <b>fica fora</b>: {resultado.motivos.join("; ")}</> : " · pode entrar"}
            </p>
          )}
        </div>
      </>)}
    </section>
  );
}
