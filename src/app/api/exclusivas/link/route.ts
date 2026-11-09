import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { z } from "zod";
import { parseOrError } from "@/lib/schemas";
import { resolver } from "@/lib/carrossel/ler-produto";
import { amazonItens, ofertaExclusiva } from "@/lib/exclusivas";

const LinkSchema = z.object({
  perfil_id: z.string().uuid(),
  link: z.string().trim().min(5, "cole o link da Amazon"),
  preco_promo: z.number().positive().nullable().optional(),
  preco_capa: z.number().positive().nullable().optional(),
  inicio: z.string().datetime({ offset: true }),
  fim: z.string().datetime({ offset: true }),
});

// POST /api/exclusivas/link — cadastra UMA oferta exclusiva da Amazon com prazo (link avulso, ex.: da comunidade).
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = parseOrError(LinkSchema, await request.json().catch(() => ({})));
  if (!parsed.ok) return NextResponse.json(parsed.error, { status: 400 });
  const a = parsed.data;
  if (new Date(a.fim) <= new Date(a.inicio)) return NextResponse.json({ error: "o fim tem que ser depois do início" }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: perfil } = await (supabase as any).from("perfis").select("id, slug").eq("id", a.perfil_id).maybeSingle();
  if (!perfil) return NextResponse.json({ error: "perfil não encontrado" }, { status: 400 });

  let url = a.link.startsWith("http") ? a.link : `https://${a.link}`;
  const asinDireto = a.link.trim().toUpperCase().match(/^[A-Z0-9]{10}$/)?.[0];
  if (!asinDireto && !/amazon\.com\.br|amzn\.to|a\.co\//i.test(url)) return NextResponse.json({ error: "esse link não é da Amazon" }, { status: 400 });
  if (!asinDireto && /amzn\.to|a\.co\//i.test(url)) url = await resolver(url).catch(() => url);
  const asin = asinDireto || url.match(/\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})/i)?.[1]?.toUpperCase();
  if (!asin) return NextResponse.json({ error: "não achei o código do produto (ASIN) nesse link" }, { status: 400 });

  const it = (await amazonItens([asin]))[asin];
  if (!it?.imagem) return NextResponse.json({ error: "a Amazon não devolveu esse produto (confira o link)" }, { status: 400 });
  const promo = a.preco_promo ?? it.preco ?? null;
  const capa = a.preco_capa ?? (it.preco && promo && it.preco > promo ? it.preco : null);
  const desconto = promo && capa && capa > promo ? (1 - promo / capa) * 100 : null;

  const row = ofertaExclusiva({ asin, perfilId: perfil.id, perfilSlug: perfil.slug, titulo: it.titulo, imagem: it.imagem,
    promo, capa, desconto, inicio: new Date(a.inicio).toISOString(), fim: new Date(a.fim).toISOString(), fonte: "link avulso", userId: user.id });
  const admin = createAdminClient();
  const { data: ja } = await admin.from("offers").select("id").eq("source", "manual").eq("source_ref", row.source_ref).maybeSingle();
  if (ja) return NextResponse.json({ error: "esse produto já está cadastrado com esse início" }, { status: 409 });
  const { error } = await admin.from("offers").insert(row);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, titulo: row.title, preco: promo, esgotado: it.esgotado });
}
