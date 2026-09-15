"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X, Plus, Loader2, Tag, Info } from "lucide-react";
import { cn } from "@/lib/utils";

export default function KeywordsTab({
  perfilId,
  perfilNome,
}: {
  perfilId: string | null;
  perfilNome?: string | null;
}) {
  const [keywords, setKeywords] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);

  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // carrega keywords do perfil
  useEffect(() => {
    if (!perfilId) { setLoading(false); return; }
    (async () => {
      setLoading(true);
      const res = await fetch(`/api/perfis/${perfilId}/keywords`, { cache: "no-store" });
      if (res.ok) {
        const j = await res.json();
        setKeywords(Array.isArray(j.keywords) ? j.keywords : []);
      }
      setLoading(false);
    })();
  }, [perfilId]);

  // autocomplete (debounce)
  useEffect(() => {
    const t = setTimeout(async () => {
      const res = await fetch(`/api/keywords/suggest?q=${encodeURIComponent(query)}`);
      if (res.ok) setSuggestions(await res.json());
    }, 150);
    return () => clearTimeout(t);
  }, [query]);

  // fecha dropdown ao clicar fora
  useEffect(() => {
    function h(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  function add(term: string) {
    const t = term.trim().toLowerCase().replace(/\s+/g, " ");
    if (!t || t.length < 2) return;
    if (keywords.includes(t)) { setQuery(""); return; }
    setKeywords((k) => [...k, t]);
    setDirty(true);
    setSaved(false);
    setQuery("");
    setSuggestions([]);
  }

  function remove(term: string) {
    setKeywords((k) => k.filter((x) => x !== term));
    setDirty(true);
    setSaved(false);
  }

  async function handleSave() {
    if (!perfilId) return;
    setSaving(true);
    const res = await fetch(`/api/perfis/${perfilId}/keywords`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keywords }),
    });
    setSaving(false);
    if (res.ok) {
      const j = await res.json();
      setKeywords(j.keywords ?? keywords);
      setDirty(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
  }

  if (!perfilId) {
    return (
      <div className="glass rounded-2xl p-7">
        <div className="flex items-start gap-3 text-zinc-400">
          <Info className="w-5 h-5 shrink-0 text-orange-400 mt-0.5" strokeWidth={1.75} />
          <div>
            <h3 className="text-white font-display font-semibold tracking-tight">Palavras-chave do nicho</h3>
            <p className="text-sm mt-1">
              Esta campanha ainda não está vinculada a um <span className="text-zinc-200">perfil</span>.
              As palavras-chave ficam no nível do perfil (nicho) para todas as plataformas usarem.
              Vincule um perfil à campanha para cadastrar aqui.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="glass rounded-2xl p-7">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-white font-display font-semibold tracking-tight flex items-center gap-2">
            <Tag className="w-4 h-4 text-orange-400" strokeWidth={1.75} />
            Palavras-chave do nicho
          </h3>
          <p className="text-zinc-500 text-sm mt-1">
            Cadastre os <span className="text-zinc-300">tipos de produto</span> que os coletores devem buscar.
            Todas as plataformas {perfilNome ? <>do perfil <span className="text-zinc-300">{perfilNome}</span></> : "deste perfil"} puxam desta lista.
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving || !dirty}
          className={cn(
            "px-4 py-2 text-white text-sm rounded-full transition-all font-medium disabled:opacity-40 shrink-0",
            saved ? "bg-emerald-600" : "bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 glow-orange-sm"
          )}
        >
          {saving ? "Salvando..." : saved ? "✓ Salvo!" : dirty ? "Salvar alterações" : "Salvo"}
        </button>
      </div>

      {/* Caixa de busca com autocomplete */}
      <div ref={boxRef} className="relative mt-5">
        <div className="flex items-center gap-2 bg-zinc-900/70 border border-zinc-800 rounded-xl px-3.5 py-2.5 focus-within:border-orange-500/60 focus-within:ring-2 focus-within:ring-orange-500/15 transition">
          <Search className="w-4 h-4 text-zinc-500 shrink-0" strokeWidth={1.75} />
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); add(query); }
            }}
            placeholder="Digite um produto: fralda, shampoo, talco..."
            className="flex-1 bg-transparent text-white text-sm placeholder-zinc-600 focus:outline-none"
          />
          {query.trim() && (
            <button onClick={() => add(query)} className="text-orange-400 hover:text-orange-300 shrink-0" title="Adicionar">
              <Plus className="w-4 h-4" strokeWidth={2} />
            </button>
          )}
        </div>

        {open && suggestions.length > 0 && (
          <div className="absolute left-0 right-0 top-full mt-1.5 bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl py-1 z-40 max-h-72 overflow-y-auto scroll-thin">
            <p className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-zinc-600">Sugestões do nicho</p>
            {suggestions.map((s) => {
              const already = keywords.includes(s);
              return (
                <button
                  key={s}
                  onClick={() => add(s)}
                  disabled={already}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors",
                    already ? "text-zinc-600 cursor-default" : "text-zinc-300 hover:bg-zinc-900/60 hover:text-white"
                  )}
                >
                  <Plus className={cn("w-3.5 h-3.5 shrink-0", already && "opacity-0")} strokeWidth={2} />
                  <span className="tracking-tight">{s}</span>
                  {already && <span className="text-[10px] text-emerald-400 ml-auto">já adicionado</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Chips */}
      <div className="mt-5">
        {loading ? (
          <div className="flex items-center gap-2 text-zinc-500 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
          </div>
        ) : keywords.length === 0 ? (
          <p className="text-zinc-600 text-sm">Nenhuma palavra-chave ainda. Use a busca acima para adicionar.</p>
        ) : (
          <>
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[11px] uppercase tracking-wider text-zinc-500">{keywords.length} palavra{keywords.length > 1 ? "s" : ""}-chave</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {keywords.map((k) => (
                <span
                  key={k}
                  className="group flex items-center gap-1.5 pl-3 pr-2 py-1.5 bg-zinc-900/80 border border-zinc-800 rounded-full text-sm text-zinc-200"
                >
                  {k}
                  <button
                    onClick={() => remove(k)}
                    className="text-zinc-500 hover:text-red-400 transition-colors rounded-full"
                    title="Remover"
                  >
                    <X className="w-3.5 h-3.5" strokeWidth={2} />
                  </button>
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
