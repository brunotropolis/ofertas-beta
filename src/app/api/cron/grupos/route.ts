import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const BRT_MS = 3 * 3600_000;
const WAHA_KEY = process.env.WAHA_OFERTAS_API_KEY || process.env.WAHA_API_KEY || "";

/**
 * POST /api/cron/grupos — retrato dos membros dos grupos de cada perfil com WAHA.
 * Chamado pelo n8n (OFERTAS | Grupos Snapshot) de hora em hora. Header x-cron-secret = CRON_SECRET.
 * Compara os participantes de agora com o último retrato (grupos_membros, só hash) e soma
 * entradas/saídas do dia em grupos_diario + grupos_resumo_diario. Primeira vez de um grupo = só linha de base.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET não configurado" }, { status: 503 });
  if (request.headers.get("x-cron-secret") !== secret) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY não configurado" }, { status: 503 });
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, { auth: { persistSession: false } }) as Any;

  // telefone → hash (HMAC com o segredo do cron; sem ele não volta pro número)
  const hash = (p: Any) => {
    const raw = String(p?.phoneNumber || p?.id || "").split("@")[0].replace(/\D/g, "");
    return raw ? createHmac("sha256", secret).update(raw).digest("hex").slice(0, 24) : null;
  };
  const dia = new Date(Date.now() - BRT_MS).toISOString().slice(0, 10);
  const out: Any[] = [];

  const { data: perfis } = await db.from("perfis").select("id, nome, waha_url, waha_session").not("waha_url", "is", null);
  for (const perfil of (perfis ?? []) as Any[]) {
    const { data: camps } = await db.from("campaigns").select("id").eq("perfil_id", perfil.id);
    const campIds = ((camps ?? []) as Any[]).map((c) => c.id);
    if (!campIds.length) continue;
    const { data: cgs } = await db.from("campaign_groups").select("group_jid, group_name").in("campaign_id", campIds).eq("is_enabled", true);
    const alvo = new Map<string, string>(((cgs ?? []) as Any[]).map((g) => [g.group_jid, g.group_name]));
    if (!alvo.size) continue;

    const r = await fetch(`${perfil.waha_url}/api/${perfil.waha_session || "default"}/groups?limit=1000`, { headers: { "X-Api-Key": WAHA_KEY }, cache: "no-store" });
    if (!r.ok) { out.push({ perfil: perfil.nome, erro: `WAHA ${r.status}` }); continue; }
    const lista = await r.json();
    const grupos = (Array.isArray(lista) ? lista : Object.values(lista)) as Any[];

    // retrato anterior desses grupos
    const antes = new Map<string, Set<string>>();
    const jids = [...alvo.keys()];
    for (let i = 0; i < jids.length; i += 40) {
      for (let from = 0; ; from += 1000) {
        const { data, error } = await db.from("grupos_membros").select("group_jid, membro_hash").in("group_jid", jids.slice(i, i + 40)).range(from, from + 999);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        for (const m of (data ?? []) as Any[]) {
          if (!antes.has(m.group_jid)) antes.set(m.group_jid, new Set());
          antes.get(m.group_jid)!.add(m.membro_hash);
        }
        if (!data || data.length < 1000) break;
      }
    }
    const { data: hoje } = await db.from("grupos_diario").select("group_jid, entraram, sairam").eq("dia", dia).in("group_jid", jids);
    const hojeMap = new Map(((hoje ?? []) as Any[]).map((h) => [h.group_jid, h]));

    const unicos = new Set<string>();
    const diarioRows: Any[] = [];
    let vagas = 0, nGrupos = 0;
    for (const g of grupos) {
      const jid = typeof g.id === "string" ? g.id : g.id?._serialized;
      if (!alvo.has(jid)) continue;
      const agora = new Set<string>();
      for (const p of (g.participants ?? []) as Any[]) { const h = hash(p); if (h) agora.add(h); }
      if (!agora.size) continue; // lista vazia = leitura falhou; não conta como "todo mundo saiu"
      nGrupos++; vagas += agora.size; agora.forEach((h) => unicos.add(h));
      const prev = antes.get(jid);
      const novos = prev ? [...agora].filter((h) => !prev.has(h)) : [...agora];
      const foram = prev ? [...prev].filter((h) => !agora.has(h)) : [];
      if (novos.length) {
        for (let i = 0; i < novos.length; i += 500) {
          await db.from("grupos_membros").upsert(novos.slice(i, i + 500).map((h) => ({ group_jid: jid, membro_hash: h })), { onConflict: "group_jid,membro_hash" });
        }
      }
      for (let i = 0; i < foram.length; i += 200) {
        await db.from("grupos_membros").delete().eq("group_jid", jid).in("membro_hash", foram.slice(i, i + 200));
      }
      const h0 = hojeMap.get(jid);
      diarioRows.push({
        dia, group_jid: jid, perfil_id: perfil.id, group_name: g.subject || alvo.get(jid), membros: agora.size,
        entraram: (h0?.entraram ?? 0) + (prev ? novos.length : 0),
        sairam: (h0?.sairam ?? 0) + foram.length,
        atualizado_em: new Date().toISOString(),
      });
    }
    if (diarioRows.length) await db.from("grupos_diario").upsert(diarioRows, { onConflict: "dia,group_jid" });

    const entraram = diarioRows.reduce((a, d) => a + d.entraram, 0);
    const sairam = diarioRows.reduce((a, d) => a + d.sairam, 0);
    await db.from("grupos_resumo_diario").upsert({
      dia, perfil_id: perfil.id, grupos: nGrupos, vagas, pessoas_unicas: unicos.size, entraram, sairam, atualizado_em: new Date().toISOString(),
    }, { onConflict: "dia,perfil_id" });
    out.push({ perfil: perfil.nome, grupos: nGrupos, vagas, pessoas_unicas: unicos.size, entraram, sairam });
  }
  return NextResponse.json({ dia, perfis: out });
}
