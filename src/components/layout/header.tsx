"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { useEffect, useState } from "react";

export function Header() {
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
    <header className="h-16 flex items-center justify-end px-6 gap-3 border-b border-zinc-900/80 bg-zinc-950/40 backdrop-blur-xl sticky top-0 z-30">
      {email && (
        <div className="flex items-center gap-2.5 pl-1 pr-3 py-1 rounded-full bg-zinc-900/70 border border-zinc-800/80">
          <div
            className="h-7 w-7 rounded-full grid place-items-center text-white text-xs font-semibold"
            style={{ background: "linear-gradient(135deg, #ff7a30 0%, #ff4e62 100%)" }}
          >
            {initial}
          </div>
          <span className="text-xs text-zinc-300 font-medium tracking-tight">
            {email}
          </span>
        </div>
      )}
      <button
        onClick={handleLogout}
        className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors px-3 py-2 rounded-full hover:bg-zinc-900/80 border border-transparent hover:border-zinc-800"
      >
        <LogOut className="w-3.5 h-3.5" strokeWidth={1.75} />
        Sair
      </button>
    </header>
  );
}
