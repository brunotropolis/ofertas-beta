import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { lerPlanilha, ehGeek, ehMaternas, amazonItens, ofertaExclusiva } from "@/lib/exclusivas";

export const maxDuration = 120;

// POST /api/exclusivas/importar (multipart: file, perfil_id, quantos, desconto_min, simular)
// Lê a planilha de ofertas exclusivas da Amazon (.xlsx/.csv), filtra pro perfil, pega os maiores descontos,
// confere foto/estoque e grava como rascunho com a janela de cada oferta. "simular=1" só mostra o que entraria.
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const perfilId = String(form?.get("perfil_id") ?? "");
  const simular = form?.get("simular") === "1";
  if (!(file instanceof File)) return NextResponse.json({ error: "suba o arquivo da planilha (.xlsx ou .csv)" }, { status: 400 });
  if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "arquivo acima de 10 MB" }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: perfil } = await (supabase as any).from("perfis").select("id, slug").eq("id", perfilId).maybeSingle();
  if (!perfil) return NextResponse.json({ error: "perfil não encontrado" }, { status: 400 });
  const geek = perfil.slug === "buscador-geek";
  const quantos = Math.min(500, Math.max(1, Number(form?.get("quantos")) || (geek ? 300 : 150)));
  const descMin = Math.min(90, Math.max(0, Number(form?.get("desconto_min")) || (geek ? 20 : 10)));

  let linhas;
  try { linhas = lerPlanilha(Buffer.from(await file.arrayBuffer())); }
  catch { return NextResponse.json({ error: "não consegui ler esse arquivo. Baixe a planilha como .xlsx ou .csv e tente de novo." }, { status: 400 }); }
  if (!linhas.length) return NextResponse.json({ error: "não achei ofertas na planilha (precisa ter as colunas de data, ASIN e preço)" }, { status: 400 });

  const agora = Date.now();
  const doPerfil = linhas.filter(geek ? ehGeek : ehMaternas);
  const validas = doPerfil.filter((o) => new Date(o.fim).getTime() > agora + 2 * 3600_000 && o.promo && o.capa && o.promo < o.capa);
  const escolhidas = validas.filter((o) => o.desconto >= descMin).sort((a, b) => b.desconto - a.desconto).slice(0, quantos);
  const periodo = linhas.length ? `${linhas.map((l) => l.inicio).sort()[0].slice(0, 10)} a ${linhas.map((l) => l.fim).sort().at(-1)!.slice(0, 10)}` : "";
  const resumo = { lidas: linhas.length, do_perfil: doPerfil.length, no_prazo: validas.length, escolhidas: escolhidas.length, periodo,
    criadas: 0, repetidas: 0, sem_foto: 0, esgotadas: 0 };

  if (simular) {
    return NextResponse.json({ ...resumo, amostra: escolhidas.slice(0, 30).map((o) => ({ titulo: o.titulo, desconto: o.desconto, promo: o.promo, capa: o.capa, inicio: o.inicio, fim: o.fim, categoria: o.categoria })) });
  }

  const info = await amazonItens([...new Set(escolhidas.map((o) => o.asin))]).catch((e) => { throw e; });
  const fonte = `planilha ${file.name.replace(/\.(xlsx|xls|csv)$/i, "")}`.slice(0, 80);
  const admin = createAdminClient();
  const novas = [];
  for (const o of escolhidas) {
    const it = info[o.asin];
    if (!it?.imagem) { resumo.sem_foto++; continue; }
    if (it.esgotado) { resumo.esgotadas++; continue; }
    novas.push(ofertaExclusiva({ asin: o.asin, perfilId: perfil.id, perfilSlug: perfil.slug, titulo: it.titulo || o.titulo, imagem: it.imagem,
      promo: o.promo, capa: o.capa, desconto: o.desconto, inicio: o.inicio, fim: o.fim, fonte, categoria: o.categoria, userId: user.id }));
  }
  if (novas.length) {
    const refs = novas.map((n) => n.source_ref);
    const { data: ja } = await admin.from("offers").select("source_ref").eq("source", "manual").in("source_ref", refs);
    const jaSet = new Set((ja ?? []).map((r: { source_ref: string }) => r.source_ref));
    const inserir = novas.filter((n) => !jaSet.has(n.source_ref));
    resumo.repetidas = novas.length - inserir.length;
    for (let i = 0; i < inserir.length; i += 200) {
      const { error } = await admin.from("offers").insert(inserir.slice(i, i + 200));
      if (error) return NextResponse.json({ ...resumo, error: error.message }, { status: 500 });
      resumo.criadas += Math.min(200, inserir.length - i);
    }
  }
  return NextResponse.json({ ...resumo, fonte });
}
