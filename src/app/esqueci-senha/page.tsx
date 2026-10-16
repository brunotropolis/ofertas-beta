"use client";

import { useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/layout/logo";
import { ArrowRight, MailCheck } from "lucide-react";

export default function EsqueciSenhaPage() {
  const [email, setEmail] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [loading, setLoading] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await fetch("/api/auth/esqueci", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }).catch(() => {});
    setLoading(false);
    setEnviado(true);
  }

  const input =
    "w-full px-4 py-3 bg-zinc-900/70 border border-zinc-800 rounded-xl text-zinc-100 text-sm placeholder-zinc-600 focus:outline-none focus:border-orange-500/60 focus:ring-2 focus:ring-orange-500/20 transition";

  return (
    <div className="min-h-screen flex items-center justify-center bg-ambient px-4 relative overflow-hidden">
      <div className="relative w-full max-w-sm">
        <div className="flex flex-col items-center mb-10">
          <Logo size="lg" />
        </div>
        <div className="glass rounded-2xl p-7 space-y-5 shadow-soft">
          {enviado ? (
            <div className="text-center space-y-3">
              <MailCheck className="w-8 h-8 mx-auto text-emerald-400" strokeWidth={1.75} />
              <p className="text-sm text-zinc-200">Se esse e-mail tiver acesso ao painel, o link pra criar uma nova senha chega em alguns minutos.</p>
              <p className="text-xs text-zinc-500">Confira também a caixa de spam. O link vale por 1 hora.</p>
            </div>
          ) : (
            <form onSubmit={enviar} className="space-y-5">
              <div>
                <p className="text-sm text-zinc-300">Esqueceu a senha?</p>
                <p className="text-xs text-zinc-500 mt-1">Digite seu e-mail que mandamos um link pra criar uma nova.</p>
              </div>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus
                className={input} placeholder="seu@email.com" autoComplete="email" />
              <button type="submit" disabled={loading}
                className="group w-full flex items-center justify-center gap-2 py-3 px-4 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 disabled:opacity-60 text-white font-medium text-sm rounded-xl transition-all">
                {loading ? "Enviando..." : (<>Enviar link <ArrowRight className="w-4 h-4" strokeWidth={2} /></>)}
              </button>
            </form>
          )}
          <Link href="/login" className="block text-center text-xs text-zinc-500 hover:text-orange-300">Voltar pro login</Link>
        </div>
      </div>
    </div>
  );
}
