"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileSpreadsheet, Link2, Loader2, Trash2, X, Upload, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePerfil } from "@/lib/profile-context";

interface Exclusiva {
  id: string; title: string | null; image_url: string | null; price_current: number | null; price_original: number | null;
  discount_pct: number | null; status: string; affiliate_url: string | null; created_at: string;
  promo_meta: { exclusiva?: { inicio?: string; fim?: string; preco_promo?: number | null; fonte?: string } } | null;
}
type Situacao = "no_ar" | "proxima" | "postada" | "vencida";
interface Resumo { lidas: number; do_perfil: number; no_prazo: number; escolhidas: number; periodo: string; criadas: number; repetidas: number; sem_foto: number; esgotadas: number; error?: string;
  amostra?: { titulo: string; desconto: number; promo: number | null; capa: number | null; inicio: string; fim: string; categoria: string }[] }

const FIM_MARGEM = 30 * 60_000; // o auto-enqueue não posta nos últimos 30 min da janela
const brl = (n: number | null | undefined) => (n == null ? "" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const dh = (iso?: string) => (iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");
const pad = (n: number) => String(n).padStart(2, "0");
const local = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

function situacao(o: Exclusiva, agora: number): Situacao {
  if (o.status === "published") return "postada";
  const ex = o.promo_meta?.exclusiva ?? {};
  if (ex.inicio && new Date(ex.inicio).getTime() > agora) return "proxima";
  if (ex.fim && new Date(ex.fim).getTime() - FIM_MARGEM <= agora) return "vencida";
  return "no_ar";
}
const ROTULO: Record<Situacao, { label: string; cls: string }> = {
  no_ar: { label: "No prazo agora", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  proxima: { label: "Abre depois", cls: "bg-orange-500/15 text-orange-300 border-orange-500/30" },
  postada: { label: "Já postada", cls: "bg-sky-500/15 text-sky-300 border-sky-500/30" },
  vencida: { label: "Prazo acabou", cls: "bg-zinc-500/15 text-zinc-400 border-zinc-600/40" },
};

export default function ExclusivasClient() {
  const { perfilId, perfil } = usePerfil();
  const [lista, setLista] = useState<Exclusiva[]>([]);
  const [loading, setLoading] = useState(true);
  const [aba, setAba] = useState<Situacao>("no_ar");
  const [msg, setMsg] = useState<string | null>(null);
  const agora = Date.now();

  const carregar = useCallback(async () => {
    if (!perfilId) return;
    setLoading(true);
    const r = await fetch(`/api/exclusivas?perfil=${perfilId}`, { cache: "no-store" });
    setLista(r.ok ? await r.json() : []);
    setLoading(false);
  }, [perfilId]);
  useEffect(() => { carregar(); }, [carregar]);

  const porSituacao = useMemo(() => {
    const m: Record<Situacao, Exclusiva[]> = { no_ar: [], proxima: [], postada: [], vencida: [] };
    for (const o of lista) m[situacao(o, agora)].push(o);
    const ini = (o: Exclusiva) => o.promo_meta?.exclusiva?.inicio ?? "";
    m.no_ar.sort((a, b) => (b.discount_pct ?? 0) - (a.discount_pct ?? 0));
    m.proxima.sort((a, b) => ini(a).localeCompare(ini(b)) || (b.discount_pct ?? 0) - (a.discount_pct ?? 0));
    return m;
  }, [lista, agora]);

  const fontes = useMemo(() => {
    const m = new Map<string, { total: number; pendentes: number; postadas: number }>();
    for (const o of lista) {
      const f = o.promo_meta?.exclusiva?.fonte ?? "sem fonte";
      const x = m.get(f) ?? { total: 0, pendentes: 0, postadas: 0 };
      x.total++; if (o.status === "published") x.postadas++; else if (o.status === "draft") x.pendentes++;
      m.set(f, x);
    }
    return [...m.entries()];
  }, [lista]);

  async function apagar(o: Exclusiva) {
    const r = await fetch(`/api/exclusivas/${o.id}`, { method: "DELETE" });
    const j = await r.json().catch(() => ({}));
    setMsg(r.ok ? "Oferta retirada." : j.error || "Não deu pra retirar.");
    carregar();
  }
  async function apagarFonte(f: string, n: number) {
    try { if (!window.confirm(`Apagar as ${n} ofertas de "${f}" que ainda não saíram?`)) return; } catch { /* segue */ }
    const r = await fetch(`/api/exclusivas?perfil=${perfilId}&fonte=${encodeURIComponent(f)}`, { method: "DELETE" });
    const j = await r.json().catch(() => ({}));
    setMsg(r.ok ? `${j.apagadas} ofertas apagadas.` : j.error || "Não deu pra apagar.");
    carregar();
  }

  const teto = perfil?.slug === "buscador-geek" ? 15 : 10;
  const itens = porSituacao[aba];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-display font-semibold text-white tracking-tightest">Amazon exclusivas</h1>
        <p className="text-zinc-500 text-sm mt-1 max-w-3xl">
          Suba a planilha de ofertas exclusivas da Amazon (a que chega por e-mail) ou cadastre um link com prazo. Cada oferta só sai
          dentro do prazo dela, passa na frente da fila com a chamada &quot;OFERTA ANTECIPADA&quot; ou &quot;EXCLUSIVA&quot;, no máximo {teto} por dia neste perfil.
        </p>
      </div>

      {msg && (
        <div className="mb-4 text-sm text-zinc-200 glass rounded-xl px-4 py-2.5 flex items-center justify-between">
          <span>{msg}</span><button onClick={() => setMsg(null)} className="text-zinc-500 hover:text-zinc-300"><X className="w-4 h-4" /></button>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-4 mb-8">
        {perfilId && <SubirPlanilha perfilId={perfilId} geek={perfil?.slug === "buscador-geek"} onFeito={(t) => { setMsg(t); carregar(); }} />}
        {perfilId && <CadastrarLink perfilId={perfilId} onFeito={(t) => { setMsg(t); carregar(); }} />}
      </div>

      {fontes.length > 0 && (
        <div className="glass rounded-2xl p-4 mb-6">
          <p className="text-xs font-medium text-zinc-400 mb-2">Planilhas e links cadastrados</p>
          <div className="divide-y divide-zinc-800/70">
            {fontes.map(([f, x]) => (
              <div key={f} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="text-zinc-200 truncate min-w-0">{f}</span>
                <span className="flex items-center gap-3 shrink-0 text-zinc-400 text-xs">
                  {x.total} ofertas · {x.postadas} postadas
                  {x.pendentes > 0 && f !== "link avulso" && (
                    <button onClick={() => apagarFonte(f, x.pendentes)} className="text-red-300 hover:text-red-200">apagar as {x.pendentes} que não saíram</button>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2 mb-4 flex-wrap">
        {(Object.keys(ROTULO) as Situacao[]).map((s) => (
          <button key={s} onClick={() => setAba(s)}
            className={cn("text-sm px-3.5 py-1.5 rounded-full border transition-colors",
              aba === s ? "bg-orange-500/20 border-orange-500/50 text-orange-100" : "border-zinc-700 text-zinc-400 hover:text-zinc-200")}>
            {ROTULO[s].label} <span className="tabular-nums opacity-70">{porSituacao[s].length}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="glass rounded-2xl p-12 flex justify-center"><Loader2 className="w-6 h-6 text-zinc-500 animate-spin" /></div>
      ) : itens.length === 0 ? (
        <div className="glass rounded-2xl p-10 text-center text-sm text-zinc-500">Nada aqui.</div>
      ) : (
        <div className="glass rounded-2xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-zinc-500 border-b border-zinc-800">
              <th className="p-3 font-medium">Produto</th><th className="p-3 font-medium">Preço</th><th className="p-3 font-medium">Prazo</th><th className="p-3 font-medium" />
            </tr></thead>
            <tbody>
              {itens.slice(0, 300).map((o) => {
                const ex = o.promo_meta?.exclusiva ?? {};
                const s = situacao(o, agora);
                return (
                  <tr key={o.id} className="border-b border-zinc-800/60 last:border-0">
                    <td className="p-3">
                      <div className="flex items-center gap-3 min-w-[260px]">
                        {o.image_url ? <img src={o.image_url} alt="" className="w-11 h-11 rounded-lg object-contain bg-white shrink-0" /> : <div className="w-11 h-11 rounded-lg bg-zinc-800 shrink-0" />}
                        <div className="min-w-0">
                          <a href={o.affiliate_url ?? "#"} target="_blank" rel="noreferrer" className="text-zinc-100 hover:text-orange-200 line-clamp-2">{o.title}</a>
                          <span className={cn("inline-block mt-1 text-[11px] px-2 py-0.5 rounded-full border", ROTULO[s].cls)}>{ROTULO[s].label}</span>
                        </div>
                      </div>
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      <div className="text-zinc-100 font-medium">{brl(o.price_current)}</div>
                      {o.price_original ? <div className="text-xs text-zinc-500 line-through">{brl(o.price_original)}</div> : null}
                      {o.discount_pct ? <div className="text-xs text-emerald-300">-{o.discount_pct}%</div> : null}
                    </td>
                    <td className="p-3 whitespace-nowrap text-xs text-zinc-400 tabular-nums">{dh(ex.inicio)}<br />até {dh(ex.fim)}</td>
                    <td className="p-3 text-right">
                      {o.status !== "published" && (
                        <button onClick={() => apagar(o)} title="Retirar" className="p-2 rounded-lg text-zinc-500 hover:text-red-300 hover:bg-red-500/10"><Trash2 className="w-4 h-4" /></button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {itens.length > 300 && <p className="text-xs text-zinc-500 p-3">Mostrando 300 de {itens.length}.</p>}
        </div>
      )}
    </div>
  );
}

function SubirPlanilha({ perfilId, geek, onFeito }: { perfilId: string; geek: boolean; onFeito: (t: string) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [quantos, setQuantos] = useState(geek ? 300 : 150);
  const [desc, setDesc] = useState(geek ? 20 : 10);
  const [rodando, setRodando] = useState<"" | "simular" | "importar">("");
  const [res, setRes] = useState<Resumo | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => { setQuantos(geek ? 300 : 150); setDesc(geek ? 20 : 10); setRes(null); }, [geek]);

  async function enviar(simular: boolean) {
    if (!file) return setErro("Escolha o arquivo da planilha.");
    setErro(null); setRodando(simular ? "simular" : "importar");
    const fd = new FormData();
    fd.append("file", file); fd.append("perfil_id", perfilId); fd.append("quantos", String(quantos)); fd.append("desconto_min", String(desc));
    if (simular) fd.append("simular", "1");
    const r = await fetch("/api/exclusivas/importar", { method: "POST", body: fd });
    const j = await r.json().catch(() => ({}));
    setRodando("");
    if (!r.ok) { setErro(j.error || "Não deu pra ler a planilha."); return; }
    setRes(j);
    if (!simular) onFeito(`Planilha importada: ${j.criadas} ofertas novas${j.repetidas ? `, ${j.repetidas} já estavam` : ""}.`);
  }

  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-1"><FileSpreadsheet className="w-4 h-4 text-orange-300" /><h2 className="text-white font-medium">Subir planilha da Amazon</h2></div>
      <p className="text-xs text-zinc-500 mb-4">Abra o link do e-mail, vá em Arquivo &gt; Fazer download &gt; Microsoft Excel (.xlsx) e suba aqui.</p>
      <label className="flex items-center gap-3 border border-dashed border-zinc-700 rounded-xl px-4 py-3 cursor-pointer hover:border-orange-500/50">
        <Upload className="w-4 h-4 text-zinc-400" />
        <span className="text-sm text-zinc-300 truncate">{file ? file.name : "Escolher arquivo (.xlsx ou .csv)"}</span>
        <input id="ex-arquivo" type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setRes(null); }} />
      </label>
      <div className="grid grid-cols-2 gap-3 mt-3">
        <label className="text-xs text-zinc-400">Quantas no máximo
          <input id="ex-quantos" type="number" min={1} max={500} value={quantos} onChange={(e) => setQuantos(+e.target.value)}
            className="mt-1 w-full bg-zinc-900/70 border border-zinc-800 rounded-lg px-3 py-1.5 text-sm text-zinc-100" />
        </label>
        <label className="text-xs text-zinc-400">Desconto mínimo (%)
          <input id="ex-desc" type="number" min={0} max={90} value={desc} onChange={(e) => setDesc(+e.target.value)}
            className="mt-1 w-full bg-zinc-900/70 border border-zinc-800 rounded-lg px-3 py-1.5 text-sm text-zinc-100" />
        </label>
      </div>
      <div className="flex gap-2 mt-4">
        <button onClick={() => enviar(true)} disabled={!!rodando} className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-full border border-zinc-700 text-zinc-200 hover:bg-zinc-800/70 disabled:opacity-50">
          {rodando === "simular" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}Ver o que entra
        </button>
        <button onClick={() => enviar(false)} disabled={!!rodando} className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-full bg-gradient-to-r from-orange-500 to-orange-600 text-white font-medium disabled:opacity-50">
          {rodando === "importar" && <Loader2 className="w-4 h-4 animate-spin" />}{rodando === "importar" ? "Importando (até 1 min)..." : "Importar"}
        </button>
      </div>
      {erro && <p className="text-sm text-red-300 mt-3">{erro}</p>}
      {res && (
        <div className="mt-4 text-xs text-zinc-400 space-y-1">
          <p>{res.lidas} ofertas na planilha ({res.periodo}) · {res.do_perfil} deste perfil · {res.no_prazo} ainda no prazo · <b className="text-zinc-200">{res.escolhidas} entram</b> (maiores descontos)</p>
          {res.criadas + res.repetidas + res.sem_foto + res.esgotadas > 0 && <p>Gravadas {res.criadas} · já estavam {res.repetidas} · sem foto {res.sem_foto} · esgotadas {res.esgotadas}</p>}
          {res.amostra && (
            <ul className="mt-2 max-h-48 overflow-y-auto space-y-0.5">
              {res.amostra.map((a, i) => <li key={i} className="truncate"><span className="text-emerald-300">-{a.desconto}%</span> {a.titulo} <span className="text-zinc-500">({dh(a.inicio)} até {dh(a.fim)})</span></li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function CadastrarLink({ perfilId, onFeito }: { perfilId: string; onFeito: (t: string) => void }) {
  const hoje = new Date(); const fimDia = new Date(); fimDia.setHours(23, 59, 0, 0);
  const [link, setLink] = useState("");
  const [promo, setPromo] = useState("");
  const [capa, setCapa] = useState("");
  const [inicio, setInicio] = useState(local(hoje));
  const [fim, setFim] = useState(local(fimDia));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const n = (s: string) => { const v = Number(s.replace(/\./g, "").replace(",", ".")); return s.trim() && Number.isFinite(v) && v > 0 ? v : null; };

  async function salvar() {
    setErro(null);
    if (!link.trim()) return setErro("Cole o link da Amazon.");
    setSalvando(true);
    const r = await fetch("/api/exclusivas/link", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ perfil_id: perfilId, link: link.trim(), preco_promo: n(promo), preco_capa: n(capa), inicio: new Date(inicio).toISOString(), fim: new Date(fim).toISOString() }),
    });
    const j = await r.json().catch(() => ({}));
    setSalvando(false);
    if (!r.ok) { setErro(j.details?.[0]?.message || j.error || "Não deu pra cadastrar."); return; }
    setLink(""); setPromo(""); setCapa("");
    onFeito(`Cadastrada: ${j.titulo}${j.esgotado ? " (atenção: a Amazon mostra esgotado agora)" : ""}.`);
  }

  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-1"><Link2 className="w-4 h-4 text-orange-300" /><h2 className="text-white font-medium">Cadastrar um link com prazo</h2></div>
      <p className="text-xs text-zinc-500 mb-4">Pra oferta exclusiva que chega avulsa (comunidade, e-mail). Foto e nome vêm da Amazon; o link sai com a nossa tag.</p>
      <input id="ex-link" value={link} onChange={(e) => setLink(e.target.value)} placeholder="Link da Amazon (amzn.to, amazon.com.br/dp/...) ou o ASIN"
        className="w-full bg-zinc-900/70 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100" />
      <div className="grid grid-cols-2 gap-3 mt-3">
        <label className="text-xs text-zinc-400">Preço da promoção (opcional)
          <input id="ex-promo" value={promo} onChange={(e) => setPromo(e.target.value)} placeholder="ex.: 89,90" className="mt-1 w-full bg-zinc-900/70 border border-zinc-800 rounded-lg px-3 py-1.5 text-sm text-zinc-100" />
        </label>
        <label className="text-xs text-zinc-400">Preço de antes (opcional)
          <input id="ex-capa" value={capa} onChange={(e) => setCapa(e.target.value)} placeholder="ex.: 149,90" className="mt-1 w-full bg-zinc-900/70 border border-zinc-800 rounded-lg px-3 py-1.5 text-sm text-zinc-100" />
        </label>
        <label className="text-xs text-zinc-400">Pode postar a partir de
          <input id="ex-inicio" type="datetime-local" value={inicio} onChange={(e) => setInicio(e.target.value)} className="mt-1 w-full bg-zinc-900/70 border border-zinc-800 rounded-lg px-3 py-1.5 text-sm text-zinc-100 [color-scheme:dark]" />
        </label>
        <label className="text-xs text-zinc-400">Até
          <input id="ex-fim" type="datetime-local" value={fim} onChange={(e) => setFim(e.target.value)} className="mt-1 w-full bg-zinc-900/70 border border-zinc-800 rounded-lg px-3 py-1.5 text-sm text-zinc-100 [color-scheme:dark]" />
        </label>
      </div>
      <p className="text-[11px] text-zinc-500 mt-2">Com preço da promoção preenchido, o painel só posta quando a Amazon já estiver cobrando esse preço.</p>
      {erro && <p className="text-sm text-red-300 mt-3">{erro}</p>}
      <button onClick={salvar} disabled={salvando} className="mt-4 flex items-center gap-1.5 text-sm px-4 py-2 rounded-full bg-gradient-to-r from-orange-500 to-orange-600 text-white font-medium disabled:opacity-50">
        {salvando && <Loader2 className="w-4 h-4 animate-spin" />}Cadastrar
      </button>
    </div>
  );
}
