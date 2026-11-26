"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Ban, Loader2, Plus, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePerfil } from "@/lib/profile-context";
import { bloqueadoPorLista, ehInternacional, type Bloqueio } from "@/lib/bloqueados";

interface Item extends Bloqueio { id: string; ativo: boolean; criado_em: string }

export default function BloqueadosClient() {
  const { perfis } = usePerfil();
  const [itens, setItens] = useState<Item[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [termo, setTermo] = useState("");
  const [excecao, setExcecao] = useState("");
  const [perfilId, setPerfilId] = useState("");
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [teste, setTeste] = useState("");

  const nomePerfil = useCallback((id: string | null) => (id ? perfis.find((p) => p.id === id)?.nome ?? "perfil" : "Todos os perfis"), [perfis]);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const r = await fetch("/api/bloqueados");
    const j = await r.json().catch(() => []);
    if (!r.ok) setMsg(j.error || "Não consegui carregar a lista");
    else setItens(j);
    setCarregando(false);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  async function adicionar(e: React.FormEvent) {
    e.preventDefault();
    if (termo.trim().length < 3) { setMsg("Escreva pelo menos 3 letras do produto."); return; }
    setSalvando(true);
    const r = await fetch("/api/bloqueados", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ termo, excecao, perfil_id: perfilId || null, motivo }) });
    const j = await r.json().catch(() => ({}));
    setSalvando(false);
    if (!r.ok) { setMsg(j.error || "Não consegui salvar"); return; }
    setItens((l) => [j, ...l]);
    setTermo(""); setExcecao(""); setMotivo("");
    setMsg(`"${j.termo}" bloqueado. Vale a partir do próximo post.`);
  }
  async function alternar(it: Item) {
    const r = await fetch(`/api/bloqueados?id=${it.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ ativo: !it.ativo }) });
    if (r.ok) setItens((l) => l.map((x) => (x.id === it.id ? { ...x, ativo: !x.ativo } : x)));
  }
  async function remover(it: Item) {
    const r = await fetch(`/api/bloqueados?id=${it.id}`, { method: "DELETE" });
    if (r.ok) { setItens((l) => l.filter((x) => x.id !== it.id)); setMsg(`"${it.termo}" saiu da lista.`); }
  }

  const resultadoTeste = useMemo(() => {
    if (!teste.trim()) return null;
    const ativos = itens.filter((i) => i.ativo);
    if (ehInternacional({ title: teste })) return { bloq: true, txt: "Bloqueado: venda internacional" };
    const porPerfil = perfis.map((p) => ({ p: p.nome, t: bloqueadoPorLista(ativos, p.id, teste) })).filter((x) => x.t);
    if (!porPerfil.length) return { bloq: false, txt: "Passa: nenhum item da lista pega esse título." };
    return { bloq: true, txt: porPerfil.map((x) => `${x.p}: bloqueado por "${x.t}"`).join(" · ") };
  }, [teste, itens, perfis]);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-display font-semibold text-white tracking-tightest">Produtos bloqueados</h1>
        <p className="text-zinc-500 text-sm mt-1 max-w-3xl">
          O robô não posta nenhum produto cujo título tenha um destes termos, nos grupos, nos canais e até no envio manual.
          Não importa acento nem maiúscula. Venda internacional (Amazon Global, compra internacional do ML, AliExpress) já fica de fora sozinha.
        </p>
      </div>

      {msg && (
        <div className="mb-4 text-sm text-zinc-200 glass rounded-xl px-4 py-2.5 flex items-center justify-between">
          <span>{msg}</span><button onClick={() => setMsg(null)} aria-label="Fechar" className="text-zinc-500 hover:text-zinc-300"><X className="w-4 h-4" /></button>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-4 mb-8">
        <form onSubmit={adicionar} className="glass rounded-2xl p-5 flex flex-col gap-3">
          <p className="text-sm font-medium text-zinc-200 flex items-center gap-2"><Ban className="w-4 h-4 text-red-300" />Bloquear um produto</p>
          <label className="text-xs text-zinc-400 flex flex-col gap-1">Palavra ou trecho do título
            <input id="bl-termo" value={termo} onChange={(e) => setTermo(e.target.value)} placeholder="ex.: protetor de grade" className="bg-zinc-900/70 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 outline-none focus:border-orange-400/60" />
          </label>
          <label className="text-xs text-zinc-400 flex flex-col gap-1">Menos quando tiver (opcional, separe com |)
            <input id="bl-excecao" value={excecao} onChange={(e) => setExcecao(e.target.value)} placeholder="ex.: tela respirável" className="bg-zinc-900/70 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 outline-none focus:border-orange-400/60" />
          </label>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="text-xs text-zinc-400 flex flex-col gap-1">Vale pra
              <select id="bl-perfil" value={perfilId} onChange={(e) => setPerfilId(e.target.value)} className="bg-zinc-900/70 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 outline-none focus:border-orange-400/60">
                <option value="">Todos os perfis</option>
                {perfis.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </label>
            <label className="text-xs text-zinc-400 flex flex-col gap-1">Motivo (opcional)
              <input id="bl-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="ex.: não é seguro pro bebê" className="bg-zinc-900/70 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 outline-none focus:border-orange-400/60" />
            </label>
          </div>
          <button type="submit" disabled={salvando} className="self-start mt-1 inline-flex items-center gap-2 text-sm px-4 py-2 rounded-lg bg-orange-500/90 hover:bg-orange-500 text-white disabled:opacity-60">
            {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}Bloquear
          </button>
        </form>

        <div className="glass rounded-2xl p-5 flex flex-col gap-3">
          <p className="text-sm font-medium text-zinc-200">Testar um título</p>
          <textarea id="bl-teste" value={teste} onChange={(e) => setTeste(e.target.value)} rows={3} placeholder="Cole o nome de um produto pra ver se ele passa" className="bg-zinc-900/70 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 outline-none focus:border-orange-400/60 resize-none" />
          {resultadoTeste && (
            <p className={cn("text-sm rounded-lg px-3 py-2 border", resultadoTeste.bloq ? "text-red-200 border-red-500/30 bg-red-500/10" : "text-emerald-200 border-emerald-500/30 bg-emerald-500/10")}>{resultadoTeste.txt}</p>
          )}
        </div>
      </div>

      {carregando ? (
        <div className="glass rounded-2xl p-12 flex justify-center"><Loader2 className="w-6 h-6 text-zinc-500 animate-spin" /></div>
      ) : !itens.length ? (
        <div className="glass rounded-2xl p-10 text-center text-sm text-zinc-500">Nenhum produto bloqueado ainda. Use o formulário acima pra adicionar o primeiro.</div>
      ) : (
        <div className="glass rounded-2xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-zinc-500 border-b border-zinc-800">
              <th className="p-3 font-medium">Termo</th><th className="p-3 font-medium">Menos quando tiver</th><th className="p-3 font-medium">Vale pra</th><th className="p-3 font-medium">Motivo</th><th className="p-3 font-medium" />
            </tr></thead>
            <tbody>
              {itens.map((it) => (
                <tr key={it.id} className={cn("border-b border-zinc-800/60 last:border-0", !it.ativo && "opacity-50")}>
                  <td className="p-3 text-zinc-100 whitespace-nowrap">{it.termo}</td>
                  <td className="p-3 text-zinc-400">{it.excecao ? it.excecao.split("|").join(", ") : "—"}</td>
                  <td className="p-3 text-zinc-400 whitespace-nowrap">{nomePerfil(it.perfil_id)}</td>
                  <td className="p-3 text-zinc-400 min-w-[180px]">{it.motivo || ""}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-3 justify-end whitespace-nowrap">
                      <button onClick={() => alternar(it)} className="text-xs text-zinc-400 hover:text-zinc-200">{it.ativo ? "pausar" : "reativar"}</button>
                      <button onClick={() => remover(it)} aria-label={`Tirar ${it.termo} da lista`} className="text-red-300 hover:text-red-200"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
