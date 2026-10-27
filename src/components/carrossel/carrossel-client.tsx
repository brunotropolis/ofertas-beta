"use client";

import { useEffect, useMemo, useState } from "react";
import { LayoutTemplate, Link2, RefreshCw, Search, Trash2, Wallet, Images, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { TEMPLATES, getTemplate, orcamento, fmtBRL, fmtUSD, CUSTO, type TemplateId } from "@/lib/carrossel/templates";
import { MARCAS } from "@/lib/carrossel/marcas";
import { Slide, type ProdutoSlide, type SlideKind } from "./slide";

interface ParseResp {
  platform?: "amazon" | "shopee" | "ml";
  title?: string;
  price_current?: number | null;
  image_url?: string | null;
  error?: string;
}

const LOJA: Record<string, string> = { amazon: "amazon", shopee: "shopee", ml: "meli" };

// Produtos de exemplo pras miniaturas (sem foto: a cena é a paleta do template).
const DEMO: ProdutoSlide[] = [
  { nome: "Poltrona de amamentação", preco: "R$ 489,90", loja: "shopee", imagem: null, codigo: "BAE-FTU-YKT" },
  { nome: "Luminária nuvem", preco: "R$ 59,90", loja: "meli", imagem: null, codigo: "AVA-ZNQ-GEU" },
];

const LS_KEY = "ob_carrossel_rascunho";

function nomeCurto(t: string) {
  const limpo = t.replace(/\s*[-|–].*$/, "").replace(/\s+/g, " ").trim();
  return limpo.split(" ").slice(0, 4).join(" ");
}

function codigo(seed: string) {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const L = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  let s = "";
  for (let i = 0; i < 9; i++) {
    s += L[h % L.length];
    h = Math.floor(h / L.length) + (i + 1) * 7919;
    if (i === 2 || i === 5) s += "-";
  }
  return s;
}

const brl = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`;

export default function CarrosselClient() {
  const [templateId, setTemplateId] = useState<TemplateId>("garimpo-dourado");
  const [marcaId, setMarcaId] = useState(MARCAS[0].id);
  const [titulo, setTitulo] = useState(TEMPLATES[0].capaPadrao);
  const [links, setLinks] = useState("");
  const [produtos, setProdutos] = useState<ProdutoSlide[]>([]);
  const [lendo, setLendo] = useState(false);
  const [erros, setErros] = useState<string[]>([]);
  const [rascunho, setRascunho] = useState(false);
  const [carregado, setCarregado] = useState(false);

  const template = getTemplate(templateId);
  const marca = MARCAS.find((m) => m.id === marcaId) ?? MARCAS[0];

  // rascunho local (só conveniência; nada aqui é a fonte de verdade)
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(LS_KEY) || "null");
      if (s) {
        if (TEMPLATES.some((t) => t.id === s.templateId)) setTemplateId(s.templateId);
        if (MARCAS.some((m) => m.id === s.marcaId)) setMarcaId(s.marcaId);
        if (typeof s.titulo === "string") setTitulo(s.titulo);
        if (typeof s.links === "string") setLinks(s.links);
        if (Array.isArray(s.produtos)) setProdutos(s.produtos);
      }
    } catch {}
    setCarregado(true);
  }, []);

  useEffect(() => {
    if (!carregado) return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ templateId, marcaId, titulo, links, produtos }));
    } catch {}
  }, [carregado, templateId, marcaId, titulo, links, produtos]);

  function escolherTemplate(id: TemplateId) {
    const atual = getTemplate(templateId);
    // troca o título da capa só se ainda era o padrão do template anterior
    if (titulo === atual.capaPadrao) setTitulo(getTemplate(id).capaPadrao);
    setTemplateId(id);
    document.getElementById("simulador")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function lerProdutos() {
    const urls = links.split(/\s+/).map((u) => u.trim()).filter((u) => /^https:\/\//.test(u));
    if (!urls.length) return;
    setLendo(true);
    setErros([]);
    const novos: ProdutoSlide[] = [];
    const falhas: string[] = [];
    for (const url of urls) {
      try {
        const r = await fetch("/api/carrossel/produto", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        });
        const d: ParseResp = await r.json();
        if (!r.ok || d.error) throw new Error(d.error || `erro ${r.status}`);
        novos.push({
          nome: nomeCurto(d.title || "Produto"),
          preco: d.price_current ? brl(d.price_current) : "",
          loja: LOJA[d.platform || ""] || "",
          imagem: d.image_url || null,
          codigo: codigo(url),
        });
      } catch (e) {
        falhas.push(`${url.slice(0, 60)}… (${e instanceof Error ? e.message : "falhou"})`);
      }
    }
    setProdutos(novos);
    setErros(falhas);
    setLendo(false);
  }

  function editar(i: number, campo: keyof ProdutoSlide, valor: string) {
    setProdutos((ps) => ps.map((p, k) => (k === i ? { ...p, [campo]: campo === "imagem" ? valor || null : valor } : p)));
  }

  const lista = produtos.length ? produtos : DEMO;
  const slides: SlideKind[] = useMemo(() => {
    const s: SlideKind[] = [{ tipo: "capa", titulo, imagem: lista[0]?.imagem ?? null }];
    lista.forEach((p, i) => s.push({ tipo: "produto", produto: p, indice: i }));
    if (template.ctaFinal) s.push({ tipo: "cta", imagem: lista[0]?.imagem ?? null });
    return s;
  }, [lista, titulo, template.ctaFinal]);

  const orc = orcamento(templateId, lista.length, { rascunho });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-display font-semibold text-white tracking-tightest">Carrossel</h1>
        <p className="text-zinc-500 text-sm mt-1">
          Fábrica de afiliados: escolha o template, cole os links e veja como o carrossel fica. Por enquanto é simulação: nada é postado.
        </p>
      </div>

      {/* Galeria de templates */}
      <Section title="Templates" icon={LayoutTemplate}>
        <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4">
          {TEMPLATES.map((t) => {
            const o8 = orcamento(t.id, 8);
            const ativo = t.id === templateId;
            return (
              <button
                key={t.id}
                onClick={() => escolherTemplate(t.id)}
                className={cn(
                  "text-left rounded-2xl border p-3 transition-all bg-zinc-950/40",
                  ativo ? "border-orange-500/70 shadow-[0_0_0_3px_rgba(255,107,53,0.12)]" : "border-zinc-800 hover:border-zinc-600"
                )}
              >
                <div className="grid grid-cols-3 gap-1.5">
                  <Slide template={t.id} marca={marca} slide={{ tipo: "capa", titulo: t.capaPadrao, imagem: null }} />
                  <Slide template={t.id} marca={marca} slide={{ tipo: "produto", produto: DEMO[0], indice: 0 }} />
                  {t.ctaFinal ? (
                    <Slide template={t.id} marca={marca} slide={{ tipo: "cta", imagem: null }} />
                  ) : (
                    <Slide template={t.id} marca={marca} slide={{ tipo: "produto", produto: DEMO[1], indice: 1 }} />
                  )}
                </div>
                <div className="mt-3 px-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-white font-display font-semibold tracking-tight">{t.nome}</p>
                    <span className="text-[11px] text-emerald-300/90 font-medium whitespace-nowrap">8 produtos ≈ {fmtBRL(o8.brl)}</span>
                  </div>
                  <p className="text-zinc-400 text-xs mt-1 leading-relaxed">{t.resumo}</p>
                  <p className="text-zinc-600 text-[11px] mt-1.5">inspirado em {t.inspiracao}</p>
                </div>
              </button>
            );
          })}
        </div>
      </Section>

      {/* Simulador */}
      <div id="simulador" className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-5 scroll-mt-6">
        <div className="space-y-4">
          <Section title="Montar" icon={Link2}>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Campo label="Marca">
                  <select value={marcaId} onChange={(e) => setMarcaId(e.target.value)} className="form-input">
                    {MARCAS.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
                  </select>
                </Campo>
                <Campo label="Template">
                  <select value={templateId} onChange={(e) => escolherTemplate(e.target.value as TemplateId)} className="form-input">
                    {TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
                  </select>
                </Campo>
              </div>
              <Campo label="Título da capa">
                <input value={titulo} onChange={(e) => setTitulo(e.target.value)} className="form-input" />
              </Campo>
              <Campo label="Links dos produtos (um por linha: Shopee, Amazon, Mercado Livre)">
                <textarea
                  value={links}
                  onChange={(e) => setLinks(e.target.value)}
                  rows={5}
                  placeholder={"https://shopee.com.br/...\nhttps://www.amazon.com.br/...\nhttps://produto.mercadolivre.com.br/MLB-..."}
                  className="form-input font-mono text-xs"
                />
              </Campo>
              <button
                onClick={lerProdutos}
                disabled={lendo || !links.trim()}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-all glow-orange-sm"
              >
                {lendo ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" strokeWidth={2} />}
                {lendo ? "Lendo produtos…" : "Ler produtos"}
              </button>
              {erros.length > 0 && (
                <div className="text-xs text-red-400 space-y-1">
                  <p>Não consegui ler {erros.length} link(s). Dá pra adicionar a foto e o preço na mão:</p>
                  {erros.map((e) => <p key={e} className="text-red-400/70 break-all">{e}</p>)}
                </div>
              )}
            </div>
          </Section>

          {produtos.length > 0 && (
            <Section title={`Produtos (${produtos.length})`} icon={Images}>
              <div className="space-y-3">
                {produtos.map((p, i) => (
                  <div key={i} className="flex gap-3 rounded-xl border border-zinc-800 bg-zinc-950/40 p-2.5">
                    <div className="w-14 h-14 shrink-0 rounded-lg bg-zinc-900 overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {p.imagem && <img src={p.imagem} alt="" className="w-full h-full object-cover" />}
                    </div>
                    <div className="flex-1 min-w-0 grid grid-cols-2 gap-1.5">
                      <input value={p.nome} onChange={(e) => editar(i, "nome", e.target.value)} className="form-input col-span-2 !py-1.5 text-xs" placeholder="nome curto" />
                      <input value={p.preco} onChange={(e) => editar(i, "preco", e.target.value)} className="form-input !py-1.5 text-xs" placeholder="R$ 0,00" />
                      <input value={p.loja} onChange={(e) => editar(i, "loja", e.target.value)} className="form-input !py-1.5 text-xs" placeholder="loja" />
                      <input value={p.imagem ?? ""} onChange={(e) => editar(i, "imagem", e.target.value)} className="form-input col-span-2 !py-1.5 text-[11px] font-mono" placeholder="link da foto" />
                    </div>
                    <button onClick={() => setProdutos((ps) => ps.filter((_, k) => k !== i))} className="self-start p-1.5 text-zinc-500 hover:text-red-400 icon-only" aria-label="Remover produto">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </Section>
          )}

          <Section title="Orçamento deste carrossel" icon={Wallet}>
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-3 gap-2 text-center">
                <Numero label="lâminas" valor={String(orc.laminas)} />
                <Numero label="cenas com IA" valor={String(orc.cenas)} />
                <Numero label="custo" valor={fmtBRL(orc.brl)} destaque />
              </div>
              <p className="text-zinc-500 text-xs">{fmtUSD(orc.usd)} · câmbio R$ {CUSTO.cambio.toFixed(2).replace(".", ",")}</p>
              <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                <input type="checkbox" checked={rascunho} onChange={(e) => setRascunho(e.target.checked)} className="accent-orange-500" />
                Rascunho barato (Qwen Image 3, US$ 0,03 por cena) antes da versão final
              </label>
              <div className="flex gap-2 rounded-xl bg-zinc-950/50 border border-zinc-800 p-3 text-xs text-zinc-400 leading-relaxed">
                <Info className="w-4 h-4 shrink-0 text-orange-400 mt-0.5" />
                <p>
                  Cena final no Seedream 5 Pro (US$ 0,045), GPT-Image 2 quando o produto é de marca. Conta inclui 20% de cenas refeitas e a taxa de 5,5% do OpenRouter. Legenda (Gemini Flash Lite) sai quase de graça. Texto, preço e etiquetas são HTML por cima: custo zero. A prévia abaixo usa a foto do anúncio; a cena com IA entra quando ligarmos o renderizador.
                </p>
              </div>
            </div>
          </Section>
        </div>

        <Section title={`Prévia · ${template.nome}${produtos.length ? "" : " (exemplo)"}`} icon={Images}>
          <div className="flex gap-3 overflow-x-auto pb-3 scroll-thin snap-x">
            {slides.map((s, i) => (
              <div key={i} className="w-[260px] sm:w-[300px] shrink-0 snap-start">
                <Slide template={templateId} marca={marca} slide={s} />
                <p className="text-[11px] text-zinc-600 mt-1.5 text-center">{i + 1}/{slides.length}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div className="rounded-xl bg-zinc-950/50 border border-zinc-800 p-3">
              <p className="text-zinc-300 font-medium mb-1">Cena que a IA vai gerar</p>
              <p className="text-zinc-500 leading-relaxed">{template.cena}</p>
            </div>
            <div className="rounded-xl bg-zinc-950/50 border border-zinc-800 p-3">
              <p className="text-zinc-300 font-medium mb-1">Etiqueta</p>
              <p className="text-zinc-500 leading-relaxed">{template.etiqueta}</p>
            </div>
          </div>
        </Section>
      </div>

      <style jsx global>{`
        .form-input {
          width: 100%;
          background: rgba(24, 24, 27, 0.7);
          border: 1px solid rgb(39 39 42);
          border-radius: 0.75rem;
          padding: 0.625rem 0.875rem;
          color: rgb(244 244 245);
          font-size: 0.875rem;
          transition: all 0.15s;
        }
        .form-input::placeholder { color: rgb(82 82 91); }
        .form-input:focus {
          outline: none;
          border-color: rgb(255 107 53 / 0.6);
          box-shadow: 0 0 0 3px rgb(255 107 53 / 0.12);
        }
      `}</style>
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon?: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="glass rounded-2xl p-5 min-w-0">
      <h2 className="text-white font-display font-semibold tracking-tight flex items-center gap-2 text-sm mb-4">
        {Icon && (
          <span className="h-7 w-7 rounded-lg bg-zinc-900/80 border border-zinc-800/70 flex items-center justify-center">
            <Icon className="w-3.5 h-3.5 text-orange-400" strokeWidth={1.75} />
          </span>
        )}
        {title}
      </h2>
      {children}
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-zinc-400 mb-1.5">{label}</span>
      {children}
    </label>
  );
}

function Numero({ label, valor, destaque }: { label: string; valor: string; destaque?: boolean }) {
  return (
    <div className="rounded-xl bg-zinc-950/50 border border-zinc-800 py-2.5">
      <p className={cn("font-display font-semibold", destaque ? "text-emerald-300 text-lg" : "text-white text-lg")}>{valor}</p>
      <p className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</p>
    </div>
  );
}
