/**
 * Saúde do que é do PERFIL (vale pra todas as campanhas dele) — usado pela tela de Campanhas
 * (GET /api/perfis/[id]/saude) e pelo alerta no WhatsApp (POST /api/cron/saude, n8n).
 *   numeros     → cada servidor WAHA (waha_url + waha_urls): conectado?, nº, grupos fixos, envios hoje,
 *                 erros e rate-overlimit. Luz (últimas 6h): vermelho = desconectado;
 *                 amarelo = conectado mas com rate-overlimit ou >5% de erro; verde = ok.
 *   plataformas → Amazon/Shopee/ML: última oferta NOVA que os coletores trouxeram + último sync de vendas.
 *                 Luz: verde = coletou nas últimas 3h (dentro da janela 8h–20h); amarelo = até 12h; vermelho = mais.
 *   disparo     → último envio com sucesso de qualquer campanha do perfil. Vermelho = mais de 1h sem envio
 *                 dentro da janela (8h30–20h) com campanha ativa.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
export type Luz = "verde" | "amarelo" | "vermelho";

const WAHA_KEY = process.env.WAHA_OFERTAS_API_KEY || process.env.WAHA_API_KEY || "";
const BRT_MS = 3 * 3600_000;
const tag = (url: string) => `waha:${new URL(url).host.split(".")[0]}`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function saudePerfil(db: SupabaseClient<any> | Any, id: string) {
  const { data: perfil } = await db.from("perfis").select("id, waha_url, waha_session, waha_urls").eq("id", id).maybeSingle();
  if (!perfil) return null;

  const agora = Date.now();
  const desde24 = new Date(agora - 86400_000).toISOString();
  const desde6 = new Date(agora - 6 * 3600_000).toISOString(); // luz olha as últimas 6h (o que está acontecendo agora)
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
    const [enviosHoje, erros24, ok6, erros6, rate6, rate24] = await Promise.all([
      conta(base().eq("status", "success").gte("sent_at", inicioHoje)),
      conta(base().eq("status", "error").gte("sent_at", desde24)),
      conta(base().eq("status", "success").gte("sent_at", desde6)),
      conta(base().eq("status", "error").gte("sent_at", desde6)),
      conta(base().eq("status", "error").ilike("error_message", "%rate-overlimit%").gte("sent_at", desde6)),
      conta(base().eq("status", "error").ilike("error_message", "%rate-overlimit%").gte("sent_at", desde24)),
    ]);
    const { data: ult } = await db.from("publication_log").select("sent_at").eq("phone_used", t).eq("status", "success").order("sent_at", { ascending: false }).limit(1).maybeSingle();
    const { data: ultRate } = rate24 ? await db.from("publication_log").select("sent_at").eq("phone_used", t).eq("status", "error").ilike("error_message", "%rate-overlimit%").order("sent_at", { ascending: false }).limit(1).maybeSingle() : { data: null };
    const taxaErro = ok6 + erros6 ? erros6 / (ok6 + erros6) : 0;
    let luz: Luz = "verde", motivo = "Conectado, sem alerta nas últimas 6h";
    if (status !== "WORKING") { luz = "vermelho"; motivo = status === "FORA DO AR" ? "Servidor fora do ar" : `Sessão ${status.toLowerCase()} — precisa reconectar`; }
    else if (rate6 > 0) { luz = "amarelo"; motivo = `WhatsApp limitou envio (rate-overlimit) ${rate6}x nas últimas 6h`; }
    else if (erros6 >= 5 && taxaErro > 0.05) { luz = "amarelo"; motivo = `${Math.round(taxaErro * 100)}% de erro nos envios nas últimas 6h`; }
    return {
      url, tag: t, ordem: i + 1, numero, nome, status, luz, motivo,
      grupos: ((grupos ?? []) as Any[]).filter((g) => g.waha_url === url).length,
      envios_hoje: enviosHoje, erros_24h: erros24, rate_24h: rate24, ultimo_rate: ultRate?.sent_at ?? null, ultimo_envio: ult?.sent_at ?? null,
    };
  }));

  // ── Plataformas ─────────────────────────────────────────────────────────
  const hBrt = new Date(agora - BRT_MS).getUTCHours();
  // fora da janela os coletores param: mede a partir das 20h (ou 8h de amanhã)
  // de manhã (até 11h) desconta a noite inteira parada (20h→8h), senão o alerta acusa coletor parado às 8h
  const folgaH = hBrt < 8 ? hBrt + 4 : hBrt < 11 ? 12 : hBrt >= 20 ? hBrt - 20 : 0;
  const sync: Record<string, string | null> = {};
  for (const src of ["ml", "amazon"]) {
    const { data: v } = await db.from("affiliate_sales").select("synced_at").eq("source", src).order("synced_at", { ascending: false }).limit(1).maybeSingle();
    sync[src] = v?.synced_at ?? null;
  }
  const ultSync = (src: string) => sync[src] ?? null;
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


  // ── Disparo (algum post saindo?) ────────────────────────────────────────
  const { data: ultEnvio } = campIds.length
    ? await db.from("publication_log").select("sent_at").in("campaign_id", campIds).eq("status", "success").order("sent_at", { ascending: false }).limit(1).maybeSingle()
    : { data: null };
  const { count: ativas } = await db.from("campaigns").select("id", { count: "exact", head: true }).eq("perfil_id", id).eq("is_active", true);
  const minBrt = hBrt * 60 + new Date(agora - BRT_MS).getUTCMinutes();
  const naJanela = minBrt >= 8 * 60 + 30 && minBrt < 20 * 60;
  const semEnvioMin = ultEnvio?.sent_at ? (agora - Date.parse(ultEnvio.sent_at)) / 60000 : Infinity;
  const disparo = {
    luz: (!ativas || !naJanela || semEnvioMin <= 60 ? "verde" : "vermelho") as Luz,
    ultimo_envio: ultEnvio?.sent_at ?? null,
    motivo: !ativas ? "Nenhuma campanha ativa" : !naJanela ? "Fora da janela de disparo (8h–20h)" : semEnvioMin <= 60 ? "Disparos saindo normalmente" : `Nenhum post saiu há ${Math.round(semEnvioMin)} min`,
  };

  return { numeros, plataformas, disparo };
}
