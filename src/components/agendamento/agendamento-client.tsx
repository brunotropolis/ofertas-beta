"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, Plus, Pencil, Trash2, Copy, Loader2, ImagePlus, X, CheckCircle2, AlertTriangle, Clock, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePerfil } from "@/lib/profile-context";

interface Aviso {
  id: string;
  titulo: string;
  image_url: string | null;
  link: string | null;
  texto: string;
  queue_id: string | null;
  campaign_ids: string[];
  scheduled_at: string | null;
  status: "pending" | "publishing" | "published" | "error" | "sem_fila";
  published_at: string | null;
  error_message: string | null;
}
interface Campanha { id: string; name: string; is_active?: boolean; categoria?: string | null }
interface Rascunho { id: string | null; titulo: string; image_url: string; link: string; texto: string; quando: string; campaign_ids: string[] }

const pad = (n: number) => String(n).padStart(2, "0");
/** ISO → valor do <input type="datetime-local"> no fuso do navegador */
function paraLocal(iso: string | null) {
  const d = iso ? new Date(iso) : new Date(Date.now() + 3600_000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const hora = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "--:--");
function rotuloDia(iso: string | null) {
  if (!iso) return "Sem horário";
  const d = new Date(iso); const hoje = new Date(); const amanha = new Date(Date.now() + 86400_000);
  const mesmo = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const data = d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" });
  return mesmo(d, hoje) ? `Hoje, ${data}` : mesmo(d, amanha) ? `Amanhã, ${data}` : data.charAt(0).toUpperCase() + data.slice(1);
}
/** *negrito* do WhatsApp na prévia */
function Formatado({ texto }: { texto: string }) {
  return (
    <>
      {texto.split("\n").map((linha, i) => (
        <span key={i} className="block min-h-[1em]">
          {linha.split(/(\*[^*\n]+\*)/g).map((p, j) => (p.startsWith("*") && p.endsWith("*") && p.length > 2 ? <b key={j}>{p.slice(1, -1)}</b> : <span key={j}>{p}</span>))}
        </span>
      ))}
    </>
  );
}

const STATUS: Record<Aviso["status"], { label: string; cls: string; Icon: typeof Clock }> = {
  pending: { label: "Agendado", cls: "bg-orange-500/15 text-orange-300 border-orange-500/30", Icon: Clock },
  publishing: { label: "Saindo agora", cls: "bg-sky-500/15 text-sky-300 border-sky-500/30", Icon: Send },
  published: { label: "Enviado", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30", Icon: CheckCircle2 },
  error: { label: "Erro", cls: "bg-red-500/15 text-red-300 border-red-500/30", Icon: AlertTriangle },
  sem_fila: { label: "Fora da fila", cls: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30", Icon: AlertTriangle },
};

export default function AgendamentoClient() {
  const { perfilId, perfil } = usePerfil();
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState<Rascunho | null>(null);
  const [verEnviados, setVerEnviados] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!perfilId) return;
    setLoading(true);
    const [a, c] = await Promise.all([
      fetch(`/api/avisos?perfil=${perfilId}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : [])),
      fetch(`/api/campanhas?perfil=${perfilId}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : [])),
    ]);
    setAvisos(Array.isArray(a) ? a : []);
    setCampanhas(Array.isArray(c) ? c : []);
    setLoading(false);
  }, [perfilId]);
  useEffect(() => { carregar(); }, [carregar]);

  const nomeCampanha = useMemo(() => Object.fromEntries(campanhas.map((c) => [c.id, c.name])), [campanhas]);
  const futuros = avisos.filter((a) => a.status !== "published");
  const enviados = avisos.filter((a) => a.status === "published").reverse();
  const porDia = useMemo(() => {
    const m = new Map<string, Aviso[]>();
    for (const a of futuros) { const k = rotuloDia(a.scheduled_at); if (!m.has(k)) m.set(k, []); m.get(k)!.push(a); }
    return [...m.entries()];
  }, [futuros]);

  const linkPadrao = perfil?.slug === "ofertas-maternas" ? "https://asofertasmaternas.com.br/" : "";
  const campanhaPadrao = campanhas.find((c) => c.is_active && (c.categoria ?? "geral") === "geral")?.id ?? campanhas[0]?.id;

  function novo() {
    setEditando({ id: null, titulo: "", image_url: "", link: linkPadrao, texto: "", quando: paraLocal(null), campaign_ids: campanhaPadrao ? [campanhaPadrao] : [] });
  }
  function abrir(a: Aviso, duplicar = false) {
    const texto = a.link ? a.texto.replace(new RegExp(`\\n*${a.link.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`), "") : a.texto;
    setEditando({
      id: duplicar ? null : a.id, titulo: a.titulo === "Aviso" ? "" : a.titulo, image_url: a.image_url ?? "", link: a.link ?? linkPadrao,
      texto, quando: duplicar ? paraLocal(null) : paraLocal(a.scheduled_at), campaign_ids: a.campaign_ids,
    });
  }
  async function apagar(a: Aviso) {
    if (!confirmarApagar(a)) return;
    const r = await fetch(`/api/avisos/${a.id}`, { method: "DELETE" });
    const j = await r.json().catch(() => ({}));
    setMsg(r.ok ? "Post cancelado." : j.error || "Não deu pra apagar.");
    carregar();
  }

  return (
    <div>
      <div className="flex items-end justify-between mb-8 gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-display font-semibold text-white tracking-tightest">Agendamento</h1>
          <p className="text-zinc-500 text-sm mt-1">Posts com arte e texto pronto que saem sozinhos no horário: avisos, convites e campanhas</p>
        </div>
        <button onClick={novo} disabled={!perfilId}
          className="flex items-center gap-2 pl-3 pr-4 py-2 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-white text-sm font-medium rounded-full transition-all glow-orange-sm disabled:opacity-50">
          <Plus className="w-4 h-4" strokeWidth={2} />
          Novo agendamento
        </button>
      </div>

      {msg && (
        <div className="mb-4 text-sm text-zinc-200 glass rounded-xl px-4 py-2.5 flex items-center justify-between">
          <span>{msg}</span><button onClick={() => setMsg(null)} className="text-zinc-500 hover:text-zinc-300"><X className="w-4 h-4" /></button>
        </div>
      )}

      {loading ? (
        <div className="glass rounded-2xl p-12 flex justify-center"><Loader2 className="w-6 h-6 text-zinc-500 animate-spin" /></div>
      ) : futuros.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-zinc-900/70 border border-zinc-800/60 mb-4">
            <CalendarClock className="w-7 h-7 text-zinc-600" strokeWidth={1.5} />
          </div>
          <p className="text-zinc-200 font-medium tracking-tight">Nenhum post agendado</p>
          <p className="text-zinc-500 text-sm mt-1.5">Clique em Novo agendamento, suba a arte, escreva o texto e escolha o horário</p>
        </div>
      ) : (
        <div className="space-y-8">
          {porDia.map(([dia, lista]) => (
            <section key={dia}>
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">{dia}</h2>
              <div className="space-y-3">
                {lista.map((a) => <Card key={a.id} a={a} nomes={nomeCampanha} onEditar={() => abrir(a)} onDuplicar={() => abrir(a, true)} onApagar={() => apagar(a)} />)}
              </div>
            </section>
          ))}
        </div>
      )}

      {enviados.length > 0 && (
        <div className="mt-10">
          <button onClick={() => setVerEnviados((v) => !v)} className="text-sm text-zinc-400 hover:text-zinc-200">
            {verEnviados ? "Esconder" : "Ver"} os já enviados ({enviados.length})
          </button>
          {verEnviados && (
            <div className="space-y-3 mt-3">
              {enviados.map((a) => <Card key={a.id} a={a} nomes={nomeCampanha} onDuplicar={() => abrir(a, true)} />)}
            </div>
          )}
        </div>
      )}

      {editando && perfilId && (
        <Editor rascunho={editando} perfilId={perfilId} campanhas={campanhas}
          onFechar={() => setEditando(null)}
          onSalvo={(t) => { setEditando(null); setMsg(t); carregar(); }} />
      )}
    </div>
  );
}

function confirmarApagar(a: Aviso) {
  try { return window.confirm(`Cancelar o post das ${hora(a.scheduled_at)}?`); } catch { return true; }
}

function Card({ a, nomes, onEditar, onDuplicar, onApagar }: {
  a: Aviso; nomes: Record<string, string>; onEditar?: () => void; onDuplicar?: () => void; onApagar?: () => void;
}) {
  const st = STATUS[a.status];
  const travado = a.status === "published" || a.status === "publishing";
  return (
    <div className="glass rounded-2xl p-4 flex gap-4">
      {a.image_url
        ? <img src={a.image_url} alt="" className="w-24 h-24 sm:w-28 sm:h-28 rounded-xl object-cover shrink-0 bg-zinc-900" />
        : <div className="w-24 h-24 rounded-xl bg-zinc-900 shrink-0" />}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xl font-display font-semibold text-white tabular-nums">{hora(a.scheduled_at)}</span>
          <span className={cn("inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border", st.cls)}>
            <st.Icon className="w-3 h-3" />{st.label}
          </span>
          {a.campaign_ids.map((id) => <span key={id} className="text-[11px] text-zinc-400 bg-zinc-800/70 px-2 py-0.5 rounded-full">{nomes[id] ?? "campanha"}</span>)}
        </div>
        <p className="text-sm text-zinc-300 mt-1.5 line-clamp-3 whitespace-pre-line">{a.texto.replace(/\*/g, "")}</p>
        {a.status === "error" && a.error_message && <p className="text-xs text-red-300 mt-1">{a.error_message}</p>}
        <div className="flex gap-1.5 mt-2.5">
          {!travado && onEditar && <Botao onClick={onEditar} Icon={Pencil}>Editar</Botao>}
          {onDuplicar && <Botao onClick={onDuplicar} Icon={Copy}>Duplicar</Botao>}
          {!travado && onApagar && <Botao onClick={onApagar} Icon={Trash2} perigo>Cancelar</Botao>}
        </div>
      </div>
    </div>
  );
}

function Botao({ onClick, Icon, children, perigo }: { onClick: () => void; Icon: typeof Pencil; children: React.ReactNode; perigo?: boolean }) {
  return (
    <button onClick={onClick}
      className={cn("inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors",
        perigo ? "border-red-500/30 text-red-300 hover:bg-red-500/10" : "border-zinc-700/70 text-zinc-300 hover:bg-zinc-800/70")}>
      <Icon className="w-3.5 h-3.5" />{children}
    </button>
  );
}

function Editor({ rascunho, perfilId, campanhas, onFechar, onSalvo }: {
  rascunho: Rascunho; perfilId: string; campanhas: Campanha[]; onFechar: () => void; onSalvo: (msg: string) => void;
}) {
  const [r, setR] = useState(rascunho);
  const [subindo, setSubindo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const set = <K extends keyof Rascunho>(k: K, v: Rascunho[K]) => setR((x) => ({ ...x, [k]: v }));

  async function subirArte(f: File) {
    setSubindo(true); setErro(null);
    const fd = new FormData(); fd.append("file", f);
    const res = await fetch("/api/avisos/imagem", { method: "POST", body: fd });
    const j = await res.json().catch(() => ({}));
    setSubindo(false);
    if (!res.ok) { setErro(j.error || "Não deu pra subir a arte."); return; }
    set("image_url", j.url);
  }

  async function salvar() {
    setErro(null);
    if (!r.image_url) return setErro("Suba a arte do post.");
    if (!r.texto.trim()) return setErro("Escreva o texto.");
    if (!r.campaign_ids.length) return setErro("Escolha pelo menos uma campanha.");
    const quando = new Date(r.quando);
    if (Number.isNaN(quando.getTime())) return setErro("Data e hora inválidas.");
    setSalvando(true);
    const body = { perfil_id: perfilId, campaign_ids: r.campaign_ids, texto: r.texto, link: r.link.trim(), image_url: r.image_url, titulo: r.titulo, scheduled_at: quando.toISOString() };
    const res = await fetch(r.id ? `/api/avisos/${r.id}` : "/api/avisos", { method: r.id ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({}));
    setSalvando(false);
    if (!res.ok) { setErro(j.details?.[0]?.message || j.error || "Não deu pra salvar."); return; }
    onSalvo(r.id ? "Post atualizado." : `Post agendado pra ${quando.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}.`);
  }

  const hBrt = new Date(r.quando).getHours();
  const foraDoHorario = !Number.isNaN(hBrt) && (hBrt < 8 || hBrt >= 20);
  const textoFinal = r.link && !r.texto.includes(r.link) ? `${r.texto.trim()}\n\n${r.link}` : r.texto;

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto" onClick={onFechar}>
      <div className="glass rounded-2xl w-full max-w-4xl p-5 sm:p-6 my-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-display font-semibold text-white">{r.id ? "Editar post" : "Novo post agendado"}</h2>
          <button onClick={onFechar} className="text-zinc-500 hover:text-zinc-200"><X className="w-5 h-5" /></button>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-4 min-w-0">
            <Campo label="Arte (JPG ou PNG, quadrada de preferência)">
              <label className="flex items-center gap-3 cursor-pointer">
                {r.image_url
                  ? <img src={r.image_url} alt="" className="w-20 h-20 rounded-xl object-cover bg-zinc-900" />
                  : <div className="w-20 h-20 rounded-xl bg-zinc-900 border border-dashed border-zinc-700 flex items-center justify-center"><ImagePlus className="w-6 h-6 text-zinc-600" /></div>}
                <span className="text-sm text-orange-300 hover:text-orange-200">{subindo ? "Subindo..." : r.image_url ? "Trocar arte" : "Escolher arte"}</span>
                <input id="aviso-arte" type="file" accept="image/jpeg,image/png" className="hidden" disabled={subindo}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) subirArte(f); e.target.value = ""; }} />
              </label>
            </Campo>

            <Campo label="Texto (use *asterisco* pra negrito)">
              <textarea id="aviso-texto" value={r.texto} onChange={(e) => set("texto", e.target.value)} rows={10}
                className="w-full bg-zinc-900/70 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-zinc-100 focus:outline-none focus:border-orange-500/60" />
            </Campo>

            <Campo label="Link (vai no fim do texto e no card)">
              <input id="aviso-link" value={r.link} onChange={(e) => set("link", e.target.value)} placeholder="https://"
                className="w-full bg-zinc-900/70 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-orange-500/60" />
            </Campo>

            <div className="grid grid-cols-2 gap-3">
              <Campo label="Dia e hora">
                <input id="aviso-quando" type="datetime-local" value={r.quando} onChange={(e) => set("quando", e.target.value)}
                  className="w-full bg-zinc-900/70 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-100 [color-scheme:dark] focus:outline-none focus:border-orange-500/60" />
              </Campo>
              <Campo label="Título do card (opcional)">
                <input id="aviso-titulo" value={r.titulo} onChange={(e) => set("titulo", e.target.value)}
                  className="w-full bg-zinc-900/70 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-orange-500/60" />
              </Campo>
            </div>
            {foraDoHorario && <p className="text-xs text-amber-300">Os grupos só recebem post das 8h às 20h. Fora disso, ele sai às 8h do dia seguinte.</p>}

            <Campo label="Onde sai">
              <div className="flex flex-wrap gap-2">
                {campanhas.map((c) => {
                  const on = r.campaign_ids.includes(c.id);
                  return (
                    <button key={c.id} type="button"
                      onClick={() => set("campaign_ids", on ? r.campaign_ids.filter((x) => x !== c.id) : [...r.campaign_ids, c.id])}
                      className={cn("text-xs px-3 py-1.5 rounded-full border transition-colors",
                        on ? "bg-orange-500/20 border-orange-500/50 text-orange-200" : "border-zinc-700 text-zinc-400 hover:text-zinc-200")}>
                      {c.name}{c.is_active === false ? " (pausada)" : ""}
                    </button>
                  );
                })}
              </div>
            </Campo>
          </div>

          <div className="min-w-0">
            <p className="text-xs text-zinc-500 mb-2">Como chega no grupo</p>
            <div className="rounded-2xl bg-[#0b141a] p-3">
              <div className="bg-[#005c4b] text-[#e9edef] rounded-lg rounded-tl-none overflow-hidden max-w-[360px]">
                {r.image_url && <img src={r.image_url} alt="" className="w-full aspect-square object-cover" />}
                {r.titulo && <div className="px-2.5 pt-2 text-xs font-semibold opacity-90">{r.titulo}</div>}
                <div className="px-2.5 py-2 text-[13.5px] leading-snug break-words"><Formatado texto={textoFinal || "O texto aparece aqui"} /></div>
              </div>
            </div>
          </div>
        </div>

        {erro && <p className="text-sm text-red-300 mt-4">{erro}</p>}
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onFechar} className="text-sm px-4 py-2 rounded-full text-zinc-300 hover:bg-zinc-800/70">Fechar</button>
          <button onClick={salvar} disabled={salvando || subindo}
            className="flex items-center gap-2 text-sm px-5 py-2 rounded-full bg-gradient-to-r from-orange-500 to-orange-600 text-white font-medium disabled:opacity-50">
            {salvando && <Loader2 className="w-4 h-4 animate-spin" />}{r.id ? "Salvar alterações" : "Agendar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><p className="text-xs font-medium text-zinc-400 mb-1.5">{label}</p>{children}</div>;
}
