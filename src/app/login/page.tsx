"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/layout/logo";
import { ArrowRight } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError("Email ou senha inválidos");
      setLoading(false);
    } else {
      router.push("/campanhas");
      router.refresh();
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-ambient px-4 relative overflow-hidden">
      {/* Decorative glow blob */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 h-[480px] w-[480px] rounded-full blur-[120px] opacity-40"
        style={{ background: "radial-gradient(circle, #ff6b35 0%, transparent 70%)" }}
      />

      <div className="relative w-full max-w-sm">
        <div className="flex flex-col items-center mb-10">
          <Logo size="lg" />
        </div>

        <form
          onSubmit={handleLogin}
          className="glass rounded-2xl p-7 space-y-5 shadow-soft"
        >
          <div>
            <label className="block text-[11px] uppercase tracking-wider font-medium text-zinc-500 mb-2">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              className="w-full px-4 py-3 bg-zinc-900/70 border border-zinc-800 rounded-xl text-zinc-100 text-sm placeholder-zinc-600 focus:outline-none focus:border-orange-500/60 focus:ring-2 focus:ring-orange-500/20 transition"
              placeholder="seu@email.com"
            />
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-wider font-medium text-zinc-500 mb-2">
              Senha
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-4 py-3 bg-zinc-900/70 border border-zinc-800 rounded-xl text-zinc-100 text-sm placeholder-zinc-600 focus:outline-none focus:border-orange-500/60 focus:ring-2 focus:ring-orange-500/20 transition"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2 text-red-400 text-xs">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="group w-full flex items-center justify-center gap-2 py-3 px-4 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium text-sm rounded-xl transition-all glow-orange-sm hover:glow-orange"
          >
            {loading ? "Entrando..." : (
              <>
                Entrar
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" strokeWidth={2} />
              </>
            )}
          </button>
        </form>

        <p className="text-center text-[11px] text-zinc-600 mt-6 tracking-wide">
          painel interno · acesso restrito
        </p>
      </div>
    </div>
  );
}
