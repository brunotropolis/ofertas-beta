import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
type Params = { params: Promise<{ id: string }> };
type Luz = "verde" | "amarelo" | "vermelho";

const WAHA_KEY = process.env.WAHA_OFERTAS_API_KEY || process.env.WAHA_API_KEY || "";
const BRT_MS = 3 * 3600_000;
const tag = (url: string) => `waha:${new URL(url).host.split(".")[0]}`;

/**
 * GET /api/perfis/[id]/saude — saúde do que é do PERFIL (vale pra todas as campanhas dele):
 *   numeros    → cada servidor WAHA (waha_url + waha_urls): conectado?, nº, grupos fixos, envios hoje,
 *                erros e rate-overlimit nas últimas 24h. Luz: vermelho = desconectado;
 *                amarelo = conectado mas com rate-overlimit ou >5% de erro em 24h; verde = ok.
 *   plataformas → Amazon/Shopee/ML: última oferta que os coletores trouxeram + último sync de vendas.
 *                Luz: verde = coletou nas últimas 3h (dentro da janela 8h–20h); amarelo = até 12h; vermelho = mais.
 */
export async function GET(_: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = createAdminClient() as Any;

  const { data: perfil } = await db.from("perfis").select("id, waha_url, waha_session, waha_urls").eq("id", id).maybeSingle();
  if (!perfil) return NextResponse.json({ error: "Perfil não encontrado" }, { status: 404 });

  const agora = Date.now();
  const desde24 = new Date(agora - 86400_000).toISOString();
  const hojeBrt = new Date(agora - BRT_MS).toISOString().slice(0, 10);
  const inicioHoje = new Date(Date.parse(`${hojeBrt}T00:00:00Z`) + BRT_MS).toISOString();

  // ── Números (WAHA) ──────────────────────────────────────────────────────
  const urls: string[] = perfil.waha_url ? [perfil.waha_url, ...((perfil.waha_urls ?? []) as string[]).filter((u: string) => u !== perfil.waha_url)] : [];
  const { data: camps } = await db.from("campaigns").select("id").eq("perfil_id", id);
  const campIds = ((camps ?? []) as Any[]).map((c) => c.id);
  const { data: grupos } = campIds.length
    ? await db.from("campaign_groups").select("waha_url").in("campaign_id", campIds).eq("is_enabled", true)
    : { data: [] };

  const numeros = await Promise.all(urls.map(async (url, i) => {
    let status = "FORA DO AR", numero = "", nome = "";
    try {
      const r = await fetch(`${url}/api/sessions/${perfil.waha_session || "default"}`, { headers: { "X-Api-Key": WAHA_KEY }, cache: "no-store", signal: AbortSignal.timeout(6000) });
      if (r.ok) { const s = await r.json(); status = s.status; numero = String(s.me?.id ?? "").split("@")[0]; nome = s.me?.pushName ?? ""; }
    } catch { /* fora do ar */ }
    const t = tag(url);
    const conta = async (q: Any) => (await q).count ?? 0;
    const base = () => db.from("publication_log").select("id", { count: "exact", head: true }).eq("phone_used", t);
    const [enviosHoje, ok24, erros24, rate24] = await Promise.all([
      conta(base().eq("status", "success").gte("sent_at", inicioHoje)),
      conta(base().eq("status", "success").gte("sent_at", desde24)),
      conta(base().eq("status", "error").gte("sent_at", desde24)),
      conta(base().eq("status", "error").ilike("error_message", "%rate-overlimit%").gte("sent_at", desde24)),
    ]);
    const { data: ult } = await db.from("publication_log").select("sent_at").eq("phone_used", t).eq("status", "success").order("sent_at", { ascending: false }).limit(1).maybeSingle();
    const taxaErro = ok24 + erros24 ? erros24 / (ok24 + erros24) : 0;
    let luz: Luz = "verde", motivo = "Conectado, sem alerta nas últimas 24h";
    if (status !== "WORKING") { luz = "vermelho"; motivo = status === "FORA DO AR" ? "Servidor fora do ar" : `Sessão ${status.toLowerCase()} — precisa reconectar`; }
    else if (rate24 > 0) { luz = "amarelo"; motivo = `WhatsApp limitou envio (rate-overlimit) ${rate24}x em 24h`; }
    else if (erros24 >= 5 && taxaErro > 0.05) { luz = "amarelo"; motivo = `${Math.round(taxaErro * 100)}% de erro nos envios em 24h`; }
    return {
      url, tag: t, ordem: i + 1, numero, nome, status, luz, motivo,
      grupos: ((grupos ?? []) as Any[]).filter((g) => g.waha_url === url).length,
      envios_hoje: enviosHoje, erros_24h: erros24, rate_24h: rate24, ultimo_envio: ult?.sent_at ?? null,
    };
  }));

  // ── Plataformas ─────────────────────────────────────────────────────────
  const hBrt = new Date(agora - BRT_MS).getUTCHours();
  // fora da janela os coletores param: mede a partir das 20h (ou 8h de amanhã)
  const folgaH = hBrt >= 8 && hBrt < 20 ? 0 : hBrt >= 20 ? hBrt - 20 : hBrt + 4;
  const { data: vendasSync } = await db.from("affiliate_sales").select("source, synced_at").order("synced_at", { ascending: false }).limit(200);
  const ultSync = (src: string) => ((vendasSync ?? []) as Any[]).find((v) => v.source === src)?.synced_at ?? null;
  const NOMES: Record<string, string> = { amazon: "Amazon", shopee: "Shopee", ml: "Mercado Livre" };
  const plataformas = await Promise.all(["amazon", "shopee", "ml"].map(async (p) => {
    const { data: ult } = await db.from("offers").select("created_at").eq("perfil_id", id).eq("platform", p).eq("source", "auto").order("created_at", { ascending: false }).limit(1).maybeSingle();
    const { count: n24 } = await db.from("offers").select("id", { count: "exact", head: true }).eq("perfil_id", id).eq("platform", p).eq("source", "auto").gte("created_at", desde24);
    const horas = ult?.created_at ? (agora - Date.parse(ult.created_at)) / 3600_000 - folgaH : Infinity;
    const luz: Luz = horas <= 3 ? "verde" : horas <= 12 ? "amarelo" : "vermelho";
    const motivo = !ult ? "Coletor nunca trouxe oferta" : luz === "verde" ? "Coletor trazendo ofertas normalmente" : `Coletor sem oferta nova há ${Math.round(horas + folgaH)}h`;
    return {
      plataforma: p, nome: NOMES[p], luz, motivo, ultima_coleta: ult?.created_at ?? null, coletadas_24h: n24 ?? 0,
      vendas: p === "shopee" ? "ao vivo (API)" : ultSync(p),
    };
  }));

  return NextResponse.json({ numeros, plataformas });
}
