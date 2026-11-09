import { z } from "zod";

// Avisos agendados (aba Agendamento): validação e texto final. Usado por /api/avisos e /api/avisos/[id].
export const AvisoSchema = z.object({
  perfil_id: z.string().uuid(),
  campaign_ids: z.array(z.string().uuid()).min(1, "escolha ao menos 1 campanha"),
  texto: z.string().trim().min(5, "escreva o texto").max(4000),
  link: z.string().trim().url("link inválido"),
  image_url: z.string().trim().url("suba a arte"),
  titulo: z.string().trim().max(120).optional().default(""),
  scheduled_at: z.string().datetime({ offset: true }),
});

/** Texto final: garante que o link está no texto (o card do WhatsApp precisa dele). */
export function textoComLink(texto: string, link: string) {
  return texto.includes(link) ? texto.trim() : `${texto.trim()}\n\n${link}`;
}

