"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";

export interface Perfil {
  id: string;
  nome: string;
  slug: string;
}

interface Ctx {
  perfis: Perfil[];
  perfilId: string | null;
  perfil: Perfil | null;
  setPerfilId: (id: string) => void;
  loading: boolean;
}

const ProfileCtx = createContext<Ctx | null>(null);
const LS_KEY = "ob_perfil_id";

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [perfis, setPerfis] = useState<Perfil[]>([]);
  const [perfilId, setPerfilIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/perfis", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Perfil[]) => {
        setPerfis(data);
        let saved: string | null = null;
        try { saved = localStorage.getItem(LS_KEY); } catch {}
        const valid = saved && data.some((p) => p.id === saved) ? saved : (data[0]?.id ?? null);
        setPerfilIdState(valid);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const setPerfilId = useCallback((id: string) => {
    setPerfilIdState(id);
    try { localStorage.setItem(LS_KEY, id); } catch {}
  }, []);

  const perfil = perfis.find((p) => p.id === perfilId) ?? null;

  return (
    <ProfileCtx.Provider value={{ perfis, perfilId, perfil, setPerfilId, loading }}>
      {children}
    </ProfileCtx.Provider>
  );
}

export function usePerfil() {
  const ctx = useContext(ProfileCtx);
  if (!ctx) throw new Error("usePerfil precisa do ProfileProvider");
  return ctx;
}
