"use client";

import { Suspense, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import { Logo } from "@/components/layout/logo";
import { ArrowRight } from "lucide-react";

/**
 * Troca de senha via link de recuperação gerado pelo admin
 * (Supabase admin generate_link type=recovery → ?token_hash=...). Cadastro segue fechado.
 */
function RedefinirSenha() {
  const router = useRouter();
  const tokenHash = useSearchParams().get("token_hash");
  const [pronto, setPronto] = useState(false);
  const [password, setPassword] = useState("");
  const [confirma, setConfirma] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!tokenHash) {
      setError("Link inválido. Peça um link novo.");
      return;
    }
    createClient()
      .auth.verifyOtp({ token_hash: tokenHash, type: "recovery" })
      .then(({ error }) => (error ? setError("Link vencido ou já usado. Peça um link novo.") : setPronto(true)));
  }, [tokenHash]);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) return setError("A senha precisa ter pelo menos 8 caracteres.");
    if (password !== confirma) return setError("As duas senhas não batem.");
    setLoading(true);
    const { error } = await createClient().auth.updateUser({ password });
    if (error) {
      setError("Não deu pra salvar: " + error.message);
      setLoading(false);
    } else {
      router.push("/inicio");
      router.refresh();
    }
  }

  const input =
    "w-full px-4 py-3 bg-zinc-900/70 border border-zinc-800 rounded-xl text-zinc-100 text-sm placeholder-zinc-600 focus:outline-none focus:border-orange-500/60 focus:ring-2 focus:ring-orange-500/20 transition";

  return (
    <div className="min-h-screen flex items-center justify-center bg-ambient px-4 relative overflow-hidden">
      <div className="relative w-full max-w-sm">
        <div className="flex flex-col items-center mb-10">
          <Logo size="lg" />
        </div>
        <form onSubmit={salvar} className="glass rounded-2xl p-7 space-y-5 shadow-soft">
          <p className="text-sm text-zinc-300">Defina sua nova senha</p>
          {pronto && (
            <>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus
                className={input} placeholder="Nova senha" autoComplete="new-password" />
              <input type="password" value={confirma} onChange={(e) => setConfirma(e.target.value)} required
                className={input} placeholder="Repita a nova senha" autoComplete="new-password" />
            </>
          )}
          {!pronto && !error && <p className="text-xs text-zinc-500">Validando o link...</p>}
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2 text-red-400 text-xs">{error}</div>
          )}
          {pronto && (
            <button type="submit" disabled={loading}
              className="group w-full flex items-center justify-center gap-2 py-3 px-4 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 disabled:opacity-60 text-white font-medium text-sm rounded-xl transition-all">
              {loading ? "Salvando..." : (<>Salvar e entrar <ArrowRight className="w-4 h-4" strokeWidth={2} /></>)}
            </button>
          )}
        </form>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <RedefinirSenha />
    </Suspense>
  );
}
