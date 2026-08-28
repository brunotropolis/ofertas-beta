import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { testPlatform } from "@/lib/platform-test";

export const maxDuration = 30;

type Params = { params: Promise<{ id: string; platform: string }> };

export async function POST(_: Request, { params }: Params) {
  const { id, platform } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!["amazon", "shopee", "ml"].includes(platform)) {
    return NextResponse.json({ error: "Plataforma inválida" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("get_platform_secrets", {
    p_campaign_id: id,
    p_platform: platform,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return NextResponse.json({ ok: false, message: "Nada salvo ainda pra essa plataforma" });
  }

  const result = await testPlatform(platform, {
    api_key: row.api_key ?? null,
    api_secret: row.api_secret ?? null,
    cookie: row.cookie ?? null,
    tag: row.tag ?? null,
  });
  return NextResponse.json(result);
}
