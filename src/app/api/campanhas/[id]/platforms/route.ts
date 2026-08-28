import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { PlatformSaveSchema, parseOrError } from "@/lib/schemas";

type Params = { params: Promise<{ id: string }> };

// Lista plataformas da campanha (SEM segredos — só flags has_*)
export async function GET(_: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("get_platforms_masked", { p_campaign_id: id });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// Salva/atualiza credenciais de UMA plataforma
export async function PUT(request: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = await request.json().catch(() => ({}));
  const parsed = parseOrError(PlatformSaveSchema, raw);
  if (!parsed.ok) return NextResponse.json(parsed.error, { status: 400 });
  const p = parsed.data;

  const admin = createAdminClient();
  const { error } = await admin.rpc("save_platform_creds", {
    p_campaign_id: id,
    p_platform: p.platform,
    p_api_key: p.api_key ?? null,
    p_api_secret: p.api_secret ?? null,
    p_cookie: p.cookie ?? null,
    p_tag: p.tag ?? null,
    p_keywords: p.keywords ?? null,
    p_categories: p.categories ?? null,
    p_is_active: p.is_active ?? null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
