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

  // ── Envios (publication_log = 1 linha por grupo) ─────────────────────────
  let logs: Any[] = [];
  if (campIds.length) {
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db
        .from("publication_log")
        .select("queue_id, campaign_id, group_name, status, sent_at, queue:publication_queue(offer:offers(platform))")
        .in("campaign_id", campIds)
        .gte("sent_at", since)
        .order("sent_at", { ascending: true })
        .range(from, from + 999);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      logs = logs.concat(data ?? []);
      if (!data || data.length < 1000) break;
    }
  }

  const perDay = new Map(days.map((d) => [d, { day: d, posts: new Set<string>(), envios: 0, erros: 0 }]));
  const perPlatform: Record<string, Set<string>> = {};
  const perGroup: Record<string, number> = {};
  const posts = new Set<string>();
  let envios = 0, erros = 0, lastSent: string | null = null;

  for (const l of logs) {
    const d = perDay.get(brtDay(l.sent_at));
    const key = l.queue_id ?? `${l.sent_at}`;
    if (l.status === "success") {
      envios++;
      posts.add(key);
      lastSent = l.sent_at;
      if (d) { d.envios++; d.posts.add(key); }
      const plat = l.queue?.offer?.platform ?? "outro";
      (perPlatform[plat] ??= new Set()).add(key);
      const g = l.group_name ?? "grupo";
      perGroup[g] = (perGroup[g] ?? 0) + 1;
    } else {
      erros++;
      if (d) d.erros++;
    }
  }

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

  return NextResponse.json({
    period: { since, days },
    campaigns: campList,
    kpis: {
      posts: posts.size,
      envios,
      erros,
      taxa: envios + erros ? envios / (envios + erros) : null,
      mediaDia: posts.size / 7,
      lastSent,
      coletadas: Object.values(coletadas).reduce((a, b) => a + b, 0),
    },
    perDay: [...perDay.values()].map((d) => ({ day: d.day, posts: d.posts.size, envios: d.envios, erros: d.erros })),
    perPlatform: Object.fromEntries(Object.entries(perPlatform).map(([k, v]) => [k, v.size])),
    perGroup,
    coletadas,
    agendados,
  });
}
