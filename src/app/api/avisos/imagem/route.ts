import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

// POST /api/avisos/imagem (multipart, campo "file") — sobe a arte do aviso no bucket público "avisos".
// Só JPEG/PNG: o WhatsApp não mostra a foto do card com WebP. Gravação só pelo servidor (service_role),
// depois de conferir o login; o bucket não tem política de escrita pra ninguém.
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "arquivo não enviado" }, { status: 400 });
  if (!["image/jpeg", "image/png"].includes(file.type))
    return NextResponse.json({ error: "use JPG ou PNG (o WhatsApp não mostra WebP no card)" }, { status: 400 });
  if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: "imagem acima de 5 MB" }, { status: 400 });

  const ext = file.type === "image/png" ? "png" : "jpg";
  const caminho = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`;
  const admin = createAdminClient();
  const { error } = await admin.storage.from("avisos").upload(caminho, Buffer.from(await file.arrayBuffer()), {
    contentType: file.type, cacheControl: "31536000", upsert: false,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const { data } = admin.storage.from("avisos").getPublicUrl(caminho);
  return NextResponse.json({ url: data.publicUrl });
}
