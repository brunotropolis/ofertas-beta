import { createClient } from "@supabase/supabase-js";

// Client com service_role — bypassa RLS. Usar SÓ em rotas server-side
// que já validaram auth do usuário. Nunca expor no client.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurado");
  return createClient(url, key, { auth: { persistSession: false } });
}
