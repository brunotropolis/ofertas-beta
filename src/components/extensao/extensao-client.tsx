"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Copy, Loader2, Plug, Trash2 } from "lucide-react";

// Tela /extensao (18/Nov/2026): conecta a extensão "Buscador Geek" do Chrome da pessoa ao painel.
// Aberta pela própria extensão como /extensao?ext=<id da extensão>: gera um código pessoal e entrega direto pra
// extensão (chrome.runtime.sendMessage, liberado no manifest em externally_connectable). Sem ?ext, mostra o código
// pra colar no popup.
type Perfil = { id: string; slug: string; nome: string };
type Token = { id: string; nome: string; prefixo: string; created_at: string; last_used_at: string | null; perfis: { nome: string } | null };

const LOJA_URL = "https://chromewebstore.google.com/detail/buscador-geek"; // trocar pelo link definitivo depois da aprovação
const dt = (s: string | null) => (s ? new Date(s).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "nunca");

declare global {
  interface Window { chrome?: { runtime?: { sendMessage: (id: string, msg: unknown, cb: (r: unknown) => void) => void; lastError?: { message: string } } } }
}

function mandarPraExtensao(ext: string, token: string): Promise<boolean> {
  return new Promise((ok) => {
    const rt = window.chrome?.runtime;
    if (!rt?.sendMessage) return ok(false);
    try {
      rt.sendMessage(ext, { tipo: "conectar", token, painel: location.origin }, (r) => ok(!rt.lastError && !!(r as { ok?: boolean })?.ok));
    } catch { ok(false); }
  });
}

export default function ExtensaoClient() {
  const [perfis, setPerfis] = useState<Perfil[]>([]);
  const [tokens, setTokens] = useState<Token[]>([]);
  const [perfilId, setPerfilId] = useState("");
  const [nome, setNome] = useState("");
  const [ext, setExt] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [gerando, setGerando] = useState(false);
  const [codigo, setCodigo] = useState<string | null>(null);
  const [conectou, setConectou] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const r = await fetch("/api/extensao/tokens");
    const j = await r.json();
    setPerfis(j.perfis ?? []);
    setTokens(j.tokens ?? []);
    setPerfilId((p) => p || j.perfis?.[0]?.id || "");
    setCarregando(false);
  }, []);

  useEffect(() => {
    const q = new URLSearchParams(location.search).get("ext");
    if (q && /^[a-p]{32}$/.test(q)) setExt(q);
    carregar();
  }, [carregar]);

  async function gerar() {
    setGerando(true); setErro(null); setCodigo(null); setConectou(false);
    const r = await fetch("/api/extensao/tokens", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ perfil_id: perfilId, nome: nome || "Chrome" }) });
    const j = await r.json();
    setGerando(false);
    if (!r.ok) { setErro(j.error || "não deu pra gerar"); return; }
    if (ext && (await mandarPraExtensao(ext, j.token))) setConectou(true);
    else setCodigo(j.token);
    carregar();
  }

  async function revogar(id: string) {
    if (!confirm("Desconectar esse Chrome? A extensão dele para de mandar o login.")) return;
    await fetch(`/api/extensao/tokens?id=${id}`, { method: "DELETE" });
    carregar();
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-8">
        <h1 className="text-3xl font-display font-semibold text-white tracking-tightest">Extensão do Chrome</h1>
        <p className="text-zinc-500 text-sm mt-1">
          A extensão Buscador Geek manda o login do Mercado Livre e da Amazon deste Chrome pro painel, pra gerar os links de afiliado sem o login vencer.
          Cada Chrome conecta com o seu próprio acesso. <a href={LOJA_URL} target="_blank" rel="noreferrer" className="text-orange-300 hover:text-orange-200">Instalar a extensão</a>
        </p>
      </div>

      <div className="glass rounded-2xl p-5 mb-6">
        <p className="text-sm font-medium text-zinc-200 mb-3 flex items-center gap-2"><Plug className="w-4 h-4" />{ext ? "Conectar a extensão deste Chrome" : "Conectar um Chrome"}</p>
        {carregando ? (
          <Loader2 className="w-4 h-4 animate-spin text-zinc-500" />
        ) : perfis.length === 0 ? (
          <p className="text-sm text-zinc-400">Sua conta ainda não tem perfil liberado. Peça pro administrador do painel liberar.</p>
        ) : (
          <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
            <label className="text-xs text-zinc-500">Perfil
              <select value={perfilId} onChange={(e) => setPerfilId(e.target.value)} className="mt-1 w-full px-3 py-2 bg-zinc-900/70 border border-zinc-800 rounded-xl text-zinc-100 text-sm">
                {perfis.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </label>
            <label className="text-xs text-zinc-500">Nome deste Chrome
              <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="ex.: notebook, Chrome do Manual" className="mt-1 w-full px-3 py-2 bg-zinc-900/70 border border-zinc-800 rounded-xl text-zinc-100 text-sm" />
            </label>
            <button onClick={gerar} disabled={gerando || !perfilId} className="px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-400 text-zinc-950 text-sm font-semibold disabled:opacity-50">
              {gerando ? <Loader2 className="w-4 h-4 animate-spin" /> : ext ? "Conectar" : "Gerar código"}
            </button>
          </div>
        )}
        {erro && <p className="text-sm text-red-300 mt-3">{erro}</p>}
        {conectou && (
          <p className="text-sm text-emerald-300 mt-4 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" />Extensão conectada. Pode fechar esta aba; o login das lojas já está indo pro painel.</p>
        )}
        {codigo && (
          <div className="mt-4">
            <p className="text-xs text-zinc-400 mb-1">Cole este código no popup da extensão (aparece só agora):</p>
            <div className="flex gap-2">
              <code className="flex-1 min-w-0 truncate text-xs bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200">{codigo}</code>
              <button onClick={() => navigator.clipboard.writeText(codigo)} className="px-3 rounded-lg border border-zinc-700 text-zinc-300 hover:text-white"><Copy className="w-4 h-4" /></button>
            </div>
          </div>
        )}
      </div>

      <div className="glass rounded-2xl p-5">
        <p className="text-xs font-medium text-zinc-400 mb-2">Seus Chromes conectados</p>
        {tokens.length === 0 ? (
          <p className="text-sm text-zinc-500">Nenhum ainda.</p>
        ) : (
          <div className="divide-y divide-zinc-800/70">
            {tokens.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="min-w-0">
                  <span className="text-zinc-200">{t.nome}</span>
                  <span className="text-zinc-500"> · {t.perfis?.nome ?? ""} · bgx_{t.prefixo}…</span>
                  <span className="block text-xs text-zinc-500">conectado {dt(t.created_at)} · último envio {dt(t.last_used_at)}</span>
                </span>
                <button onClick={() => revogar(t.id)} className="text-red-300 hover:text-red-200 shrink-0 flex items-center gap-1 text-xs"><Trash2 className="w-3.5 h-3.5" />desconectar</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
