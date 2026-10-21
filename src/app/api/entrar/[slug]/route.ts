import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

// Reserva se algo falhar: o link antigo do SendFlow (ninguém fica sem grupo)
const RESERVA: Record<string, string> = {
  "ofertas-maternas": "https://sndflw.com/i/xVTaSq0Ldq3oCzNmYC6s",
};
const LIMITE = 900; // grupo com mais que isso não recebe gente nova (WhatsApp aceita 1.024)

/**
 * GET /api/entrar/[slug] — distribuidor de leads nos grupos (21/Out, substitui o SendFlow).
 * Público (é o destino do asofertasmaternas.com.br). Escolhe o grupo MENOS CHEIO da campanha geral do perfil
 * (membros do último retrato + cliques desde o retrato), grava o clique e redireciona pro convite.
 * ?json=1 → devolve { url } (o worker do domínio usa isso pra fazer 1 redirecionamento só).
 * Não grava IP, telefone nem nada da pessoa: só "alguém clicou pra entrar no grupo X às HH:MM".
 */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const json = new URL(request.url).searchParams.get("json") === "1";
  const responder = (url: string) => (json ? NextResponse.json({ url }) : NextResponse.redirect(url, 302));
  const reserva = RESERVA[slug] ?? "https://asofertasmaternas.com.br";

  try {
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }) as Any;
    const { data: perfil } = await db.from("perfis").select("id").eq("slug", slug).maybeSingle();
    if (!perfil) return responder(reserva);
    const { data: camps } = await db.from("campaigns").select("id").eq("perfil_id", perfil.id).eq("categoria", "geral").eq("is_active", true);
    const ids = ((camps ?? []) as Any[]).map((c) => c.id);
    if (!ids.length) return responder(reserva);
    const { data: grupos } = await db.from("campaign_groups").select("group_jid, invite_code")
      .in("campaign_id", ids).eq("is_enabled", true).not("invite_code", "is", null);
    const lista = (grupos ?? []) as Any[];
    if (!lista.length) return responder(reserva);

    // tamanho: último retrato de cada grupo + cliques depois dele
    const { data: ult } = await db.from("grupos_diario").select("dia").eq("perfil_id", perfil.id).order("dia", { ascending: false }).limit(1).maybeSingle();
    const { data: retrato } = ult ? await db.from("grupos_diario").select("group_jid, membros, atualizado_em").eq("perfil_id", perfil.id).eq("dia", ult.dia) : { data: [] };
    const tam = new Map(((retrato ?? []) as Any[]).map((r) => [r.group_jid, { m: r.membros as number, em: r.atualizado_em as string }]));
    const desde = new Date(Date.now() - 3 * 3600_000).toISOString();
    const { data: cliques } = await db.from("grupos_cliques").select("group_jid, clicked_at").eq("perfil_id", perfil.id).gte("clicked_at", desde).limit(5000);
    const extra = new Map<string, number>();
    for (const c of (cliques ?? []) as Any[]) {
      const t = tam.get(c.group_jid);
      if (!t || c.clicked_at > t.em) extra.set(c.group_jid, (extra.get(c.group_jid) ?? 0) + 1);
    }
    const candidatos = lista
      .map((g) => ({ ...g, n: (tam.get(g.group_jid)?.m ?? 0) + (extra.get(g.group_jid) ?? 0) }))
      .filter((g) => g.n < LIMITE)
      .sort((a, b) => a.n - b.n);
    if (!candidatos.length) return responder(reserva);
    // empate: sorteia entre os 3 menores pra não mandar todo mundo do mesmo segundo pro mesmo grupo
    const escolhido = candidatos[Math.floor(Math.random() * Math.min(3, candidatos.length))];
    await db.from("grupos_cliques").insert({ perfil_id: perfil.id, group_jid: escolhido.group_jid });
    return responder(`https://chat.whatsapp.com/${escolhido.invite_code}`);
  } catch {
    return responder(reserva);
  }
}
