import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { CaptionRequestSchema, parseOrError } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request: Request) {
  // Auth check (defense-in-depth — middleware ja bloqueia, mas reforço aqui pra impedir
  // gasto de creditos Anthropic se algum dia o middleware abrir)
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY não configurada" }, { status: 500 });
  }

  const raw = await request.json().catch(() => ({}));
  const parsed = parseOrError(CaptionRequestSchema, raw);
  if (!parsed.ok) return NextResponse.json(parsed.error, { status: 400 });
  const { title, price_current, price_original, discount_pct, platform, ai_prompt } = parsed.data;

  const defaultPrompt = `Você é um especialista em copywriting para grupos de WhatsApp de ofertas.
Crie uma legenda curta e impactante em português brasileiro para a oferta abaixo.
Use emojis relevantes. Máximo de 4 linhas. Tom animado e urgente.
Destaque o desconto se houver. Inclua uma chamada para ação no final.`;

  const systemPrompt = ai_prompt || defaultPrompt;

  const offerInfo = [
    `Produto: ${title}`,
    `Plataforma: ${platform?.toUpperCase() || ""}`,
    price_current ? `Preço: R$ ${Number(price_current).toFixed(2)}` : null,
    price_original ? `Preço original: R$ ${Number(price_original).toFixed(2)}` : null,
    discount_pct ? `Desconto: ${discount_pct}% OFF` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const message = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 300,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: `Crie a legenda para esta oferta:\n\n${offerInfo}`,
      },
    ],
  });

  const caption =
    message.content[0].type === "text" ? message.content[0].text : "";

  return NextResponse.json({ caption });
}
