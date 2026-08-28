"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { LogOut, Menu } from "lucide-react";
import { useEffect, useState } from "react";

export function Header({ onOpenMenu }: { onOpenMenu?: () => void }) {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
    });
  }, []);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const initial = email?.[0]?.toUpperCase() ?? "•";

  return (
    <header
      className="flex items-center justify-between px-4 md:px-6 gap-3 border-b border-zinc-900/80 bg-zinc-950/40 backdrop-blur-xl sticky top-0 z-30"
      style={{
        paddingTop: "max(0.75rem, env(safe-area-inset-top))",
        paddingBottom: "0.75rem",
        paddingLeft: "max(1rem, env(safe-area-inset-left))",
        paddingRight: "max(1rem, env(safe-area-inset-right))",
      }}
    >
      {/* Hamburger — só mobile */}
      <button
        onClick={onOpenMenu}
        className="md:hidden p-2 -ml-2 rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-900/60 icon-only"
        aria-label="Abrir menu"
      >
        <Menu className="w-6 h-6" strokeWidth={1.75} />
      </button>

      {/* Espaço flexível */}
      <div className="flex-1" />

      {/* Avatar + email (email escondido no mobile) */}
      {email && (
        <div className="flex items-center gap-2 md:gap-2.5 pl-1 md:pr-3 py-1 rounded-full md:bg-zinc-900/70 md:border md:border-zinc-800/80">
          <div
            className="h-8 w-8 md:h-7 md:w-7 rounded-full grid place-items-center text-white text-xs font-semibold shrink-0"
            style={{ background: "linear-gradient(135deg, #ff7a30 0%, #ff4e62 100%)" }}
          >
            {initial}
          </div>
          <span className="hidden md:block text-xs text-zinc-300 font-medium tracking-tight">
            {email}
          </span>
        </div>
      )}

      <button
        onClick={handleLogout}
        className="hidden md:flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors px-3 py-2 rounded-full hover:bg-zinc-900/80 border border-transparent hover:border-zinc-800"
      >
        <LogOut className="w-3.5 h-3.5" strokeWidth={1.75} />
        Sair
      </button>

      {/* Sair mobile — só o ícone */}
      <button
        onClick={handleLogout}
        className="md:hidden p-2 -mr-2 rounded-lg text-zinc-400 hover:text-white icon-only"
        aria-label="Sair"
      >
        <LogOut className="w-5 h-5" strokeWidth={1.75} />
      </button>
    </header>
  );
}
