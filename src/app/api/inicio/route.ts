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

  // ── Envios, coletadas e agendados em paralelo ─────────────────────────────
  // envios: somados no banco (função inicio_resumo — antes lia 30 mil+ linhas de log, ~7s)
  // coletadas: contagem por plataforma (antes baixava as linhas e o banco corta em 1.000 → mostrava "1000")
  const contaColetadas = (plat: string) => {
    let q = db.from("offers").select("id", { count: "exact", head: true }).gte("created_at", since).eq("platform", plat).neq("source", "fraldabarata");
    if (perfil) q = q.eq("perfil_id", perfil);
    return q;
  };
  const PLATS = ["amazon", "shopee", "ml"];
  const [resumoR, schedR, ...colR] = await Promise.all([
    campIds.length ? db.rpc("inicio_resumo", { p_campaigns: campIds, p_since: since }) : Promise.resolve({ data: [], error: null }),
    db.from("scheduled_posts")
      .select("id, title, link, campaign_ids, scheduled_at, repeat_type, repeat_limit, repeat_count, status")
      .in("status", ["pending", "publishing"])
      .order("scheduled_at", { ascending: true })
      .limit(50),
    ...PLATS.map(contaColetadas),
  ]);
  if (resumoR.error) return NextResponse.json({ error: resumoR.error.message }, { status: 500 });

  const perDay = new Map(days.map((d) => [d, { day: d, posts: 0, envios: 0, erros: 0 }]));
  const perPlatform: Record<string, number> = {};
  let posts = 0, envios = 0, erros = 0, lastSent: string | null = null;
  for (const r of (resumoR.data ?? []) as Any[]) {
    const d = perDay.get(r.dia);
    const n = Number(r.posts), e = Number(r.envios), er = Number(r.erros);
    posts += n; envios += e; erros += er;
    if (d) { d.posts += n; d.envios += e; d.erros += er; }
    if (n) perPlatform[r.plataforma] = (perPlatform[r.plataforma] ?? 0) + n;
    if (r.ultimo && (!lastSent || r.ultimo > lastSent)) lastSent = r.ultimo;
  }
  const perGroup: Record<string, number> = {};

  const coletadas: Record<string, number> = {};
  PLATS.forEach((pl, i) => { const n = (colR[i] as Any).count ?? 0; if (n) coletadas[pl] = n; });

  const agendados = ((schedR.data ?? []) as Any[]).filter(
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

  // ── Cliques nos links (encurtador → link_cliques; sem robô de prévia) ──
  let cliques: Any = null;
  {
    const { data: cr } = await db.rpc("cliques_resumo", { p_since: since });
    const linhas = (cr ?? []) as Any[];
    if (linhas.length) {
      const hojeIni = new Date(Date.parse(`${todayBrt}T00:00:00Z`) + BRT_MS).toISOString();
      const porGrupo = new Map<string, number>(), porSlug = new Map<string, number>();
      let total = 0, hoje = 0;
      for (const l of linhas) {
        const n = Number(l.cliques); total += n;
        if (l.ultimo >= hojeIni) hoje += n; // aproximação: grupo/slug com clique hoje
        if (l.grupo) porGrupo.set(l.grupo, (porGrupo.get(l.grupo) ?? 0) + n);
        porSlug.set(l.slug, (porSlug.get(l.slug) ?? 0) + n);
      }
      // membros do último retrato pra calcular cliques por mil
      const membrosPorNum = new Map<string, number>();
      if (perfil) {
        const { data: ult } = await db.from("grupos_diario").select("dia").eq("perfil_id", perfil).order("dia", { ascending: false }).limit(1).maybeSingle();
        if (ult) {
          const { data: ret } = await db.from("grupos_diario").select("group_name, membros").eq("perfil_id", perfil).eq("dia", ult.dia);
          for (const r of (ret ?? []) as Any[]) {
            const m = String(r.group_name || "").match(/^As Ofertas Maternas\s*#\s*(\d+)/i);
            if (m) membrosPorNum.set(m[1], r.membros);
          }
        }
      }
      const gruposCl = [...porGrupo.entries()].map(([g, n]) => {
        const membros = membrosPorNum.get(g) ?? null;
        return { grupo: g, nome: /^\d+$/.test(g) ? `As Ofertas Maternas #${g}` : g, cliques: n, membros, por_mil: membros ? Math.round((n / membros) * 1000) : null };
      }).sort((a, b) => b.cliques - a.cliques);
      const topSlugs = [...porSlug.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
      const titulos = new Map<string, string>();
      for (const [slug] of topSlugs) {
        const { data: of } = await db.from("offers").select("title, platform").like("affiliate_url", `%/l/${slug}`).limit(1).maybeSingle();
        if (of) titulos.set(slug, `${of.title ?? slug}`);
      }
      cliques = {
        total, hoje,
        grupos_com_clique: gruposCl.length,
        top_grupos: gruposCl.slice(0, 10),
        piores_grupos: gruposCl.filter((g) => g.por_mil != null).sort((a, b) => (a.por_mil ?? 0) - (b.por_mil ?? 0)).slice(0, 5),
        top_produtos: topSlugs.map(([slug, n]) => ({ slug, titulo: titulos.get(slug) ?? slug, cliques: n })),
      };
    }
  }

  return NextResponse.json({
    cliques,
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
