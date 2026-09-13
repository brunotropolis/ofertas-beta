"use client";

import { usePerfil } from "@/lib/profile-context";
import { ChevronDown, Check, Layers } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

export function ProfileSelector() {
  const { perfis, perfil, setPerfilId, loading } = usePerfil();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function h(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  if (loading || !perfis.length) return null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-900/70 border border-zinc-800 hover:border-orange-500/50 text-sm text-white transition-colors max-w-[200px]"
      >
        <Layers className="w-3.5 h-3.5 text-orange-400 shrink-0" strokeWidth={2} />
        <span className="font-medium tracking-tight truncate">{perfil?.nome ?? "Perfil"}</span>
        <ChevronDown className={cn("w-3.5 h-3.5 text-zinc-500 shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1.5 w-60 bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl py-1 z-50">
          <p className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-zinc-600">Perfil / nicho</p>
          {perfis.map((p) => (
            <button
              key={p.id}
              onClick={() => { setPerfilId(p.id); setOpen(false); }}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left transition-colors",
                p.id === perfil?.id ? "text-white bg-zinc-900/60" : "text-zinc-400 hover:bg-zinc-900/40 hover:text-zinc-200"
              )}
            >
              <span className={cn("w-4 h-4 flex items-center justify-center shrink-0", p.id === perfil?.id ? "text-orange-400" : "opacity-0")}>
                <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
              </span>
              <span className="tracking-tight truncate">{p.nome}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
