import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const BRT_MS = 3 * 3600_000;
const brtDay = (iso: string) => new Date(new Date(iso).getTime() - BRT_MS).toISOString().slice(0, 10);

/**
 * GET /api/inicio?perfil=<id>
 * Resumo dos últimos 7 dias (BRT, hoje incluso) do perfil: posts enviados por dia/plataforma,
 * ofertas coletadas e agendamentos pendentes. Fila e vendas a tela busca nas rotas próprias.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const db = supabase as Any;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const perfil = new URL(request.url).searchParams.get("perfil");

  // Janela: 00:00 BRT de 6 dias atrás → agora
  const todayBrt = brtDay(new Date().toISOString());
  const startMs = Date.parse(`${todayBrt}T00:00:00Z`) + BRT_MS - 6 * 86400_000;
  const since = new Date(startMs).toISOString();
  const days: string[] = [];
  for (let i = 0; i < 7; i++) days.push(new Date(startMs - BRT_MS + i * 86400_000).toISOString().slice(0, 10));

  let campQ = db.from("campaigns").select("id, name, is_active, timer_minutes, auto_enqueue, auto_daily_cap, auto_window_start, auto_window_end");
  if (perfil) campQ = campQ.eq("perfil_id", perfil);
  const { data: campaigns } = await campQ;
  const campList = (campaigns ?? []) as Any[];
  const campIds = campList.map((c) => c.id);

  // ── Envios: somados no banco (função inicio_resumo — antes lia 30 mil+ linhas de log, ~7s) ──
  const perDay = new Map(days.map((d) => [d, { day: d, posts: 0, envios: 0, erros: 0 }]));
  const perPlatform: Record<string, number> = {};
  let posts = 0, envios = 0, erros = 0, lastSent: string | null = null;
  if (campIds.length) {
    const { data: resumo, error } = await db.rpc("inicio_resumo", { p_campaigns: campIds, p_since: since });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    for (const r of (resumo ?? []) as Any[]) {
      const d = perDay.get(r.dia);
      const n = Number(r.posts), e = Number(r.envios), er = Number(r.erros);
      posts += n; envios += e; erros += er;
      if (d) { d.posts += n; d.envios += e; d.erros += er; }
      if (n) perPlatform[r.plataforma] = (perPlatform[r.plataforma] ?? 0) + n;
      if (r.ultimo && (!lastSent || r.ultimo > lastSent)) lastSent = r.ultimo;
    }
  }
  const perGroup: Record<string, number> = {};

  // ── Ofertas coletadas (entrada) ───────────────────────────────────────────
  let offQ = db.from("offers").select("platform, source, created_at").gte("created_at", since).limit(5000);
  if (perfil) offQ = offQ.eq("perfil_id", perfil);
  const { data: offers } = await offQ;
  const coletadas: Record<string, number> = {};
  for (const o of (offers ?? []) as Any[]) {
    const k = o.platform ?? "outro";
    coletadas[k] = (coletadas[k] ?? 0) + 1;
  }

  // ── Agendamentos pendentes ────────────────────────────────────────────────
  const { data: sched } = await db
    .from("scheduled_posts")
    .select("id, title, link, campaign_ids, scheduled_at, repeat_type, repeat_limit, repeat_count, status")
    .in("status", ["pending", "publishing"])
    .order("scheduled_at", { ascending: true })
    .limit(50);
  const agendados = ((sched ?? []) as Any[]).filter(
    (s) => !perfil || (s.campaign_ids ?? []).some((c: string) => campIds.includes(c))
  );

  // ── Grupos: pessoas, entradas/saídas por dia, top 10 (alimentado por /api/cron/grupos) ──
  let grupos: Any = null;
  if (perfil) {
    const desde14 = new Date(Date.now() - BRT_MS - 13 * 86400_000).toISOString().slice(0, 10);
    const { data: resumo } = await db
      .from("grupos_resumo_diario")
      .select("dia, grupos, vagas, pessoas_unicas, entraram, sairam, atualizado_em")
      .eq("perfil_id", perfil)
      .gte("dia", desde14)
      .order("dia", { ascending: true });
    const lista = (resumo ?? []) as Any[];
    const ultimo = lista[lista.length - 1];
    let top: Any[] = [];
    if (ultimo) {
      const { data: tg } = await db
        .from("grupos_diario")
        .select("group_name, membros, entraram, sairam")
        .eq("perfil_id", perfil)
        .eq("dia", ultimo.dia)
        .order("membros", { ascending: false })
        .limit(10);
      top = tg ?? [];
    }
    grupos = { atual: ultimo ?? null, dias: lista, top };
  }

  return NextResponse.json({
    grupos,
    period: { since, days },
    campaigns: campList,
    kpis: {
      posts,
      envios,
      erros,
      taxa: envios + erros ? envios / (envios + erros) : null,
      mediaDia: posts / 7,
      lastSent,
      coletadas: Object.values(coletadas).reduce((a, b) => a + b, 0),
    },
    perDay: [...perDay.values()],
    perPlatform,
    perGroup,
    coletadas,
    agendados,
  });
}
