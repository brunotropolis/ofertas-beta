import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { saudePerfil } from "@/lib/saude";
import { comCache } from "@/lib/cache-curto";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** GET /api/perfis/[id]/saude — números, plataformas e disparo do perfil (ver lib/saude.ts). */
export async function GET(_: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // guarda 1 min (são ~30 consultas + WAHA); o botão de atualizar da tela manda ?fresh=1
  return comCache(_, `saude:${id}`, 60_000, async () => {
    const r = await saudePerfil(createAdminClient(), id);
    if (!r) return NextResponse.json({ error: "Perfil não encontrado" }, { status: 404 });
    return NextResponse.json(r);
  });
}
