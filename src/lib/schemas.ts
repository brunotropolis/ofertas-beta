import { z } from "zod";

// =====================================================
// Validação de URL pra parse-url (mitiga SSRF)
// =====================================================
// Domínios permitidos pro parser. Qualquer outro = 400.
const ALLOWED_DOMAINS = [
  "amazon.com.br",
  "amazon.com",
  "amzn.to",
  "a.co",
  "shopee.com.br",
  "shope.ee",
  "mercadolivre.com.br",
  "produto.mercadolivre.com.br",
  "meli.la",
];

// Hosts/IPs bloqueados explicitamente (defesa em profundidade)
const BLOCKED_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./, /^10\./, /^192\.168\./, /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^169\.254\./, // metadata cloud (AWS IMDS, GCP, etc)
  /\.local$/i,
];

export const ParseUrlSchema = z.object({
  url: z.string()
    .url("URL inválida")
    .startsWith("https://", "Só https permitido")
    .max(2048, "URL muito longa")
    .refine((u) => {
      const host = new URL(u).hostname.toLowerCase();
      if (BLOCKED_HOST_PATTERNS.some((re) => re.test(host))) return false;
      return ALLOWED_DOMAINS.some((d) => host === d || host.endsWith("." + d));
    }, "Plataforma não suportada (Amazon/Shopee/ML apenas)"),
});

// =====================================================
// Campanhas
// =====================================================
export const CampaignCreateSchema = z.object({
  name: z.string().min(1, "nome obrigatório").max(120),
  niche: z.string().max(80).nullable().optional(),
  ai_prompt: z.string().max(8000).nullable().optional(),
  timer_minutes: z.number().int().min(5).max(120).optional(),
  is_active: z.boolean().optional(),
});

export const CampaignUpdateSchema = CampaignCreateSchema.partial();

// =====================================================
// Campaign Phone
// =====================================================
// Telefone E.164 (12-15 dígitos, com ou sem prefixo +)
export const PhoneCreateSchema = z.object({
  phone_number: z.string()
    .regex(/^\+?\d{12,15}$/, "telefone formato inválido (E.164, 12-15 dígitos)"),
  label: z.string().max(60).nullable().optional(),
  is_admin: z.boolean().optional(),
});

// PATCH — editar apelido / admin de um telefone já cadastrado
export const PhoneUpdateSchema = z.object({
  label: z.string().max(60).nullable().optional(),
  is_admin: z.boolean().optional(),
}).refine((d) => d.label !== undefined || d.is_admin !== undefined, {
  message: "nada pra atualizar",
});

// =====================================================
// Campaign Group (toggle is_enabled)
// =====================================================
export const GroupTogglePatchSchema = z.object({
  group_id: z.string().uuid("group_id deve ser UUID"),
  is_enabled: z.boolean(),
});

// =====================================================
// Oferta
// =====================================================
export const OfferCreateSchema = z.object({
  source: z.enum(["manual", "telegram", "whatsapp", "auto"]).optional(),
  source_ref: z.string().max(120).nullable().optional(),
  platform: z.enum(["amazon", "shopee", "ml"]).nullable().optional(),
  url: z.string().url().max(2048),
  affiliate_url: z.string().url().max(2048).nullable().optional(),
  title: z.string().max(500).nullable().optional(),
  price_current: z.number().nonnegative().nullable().optional(),
  price_original: z.number().nonnegative().nullable().optional(),
  discount_pct: z.number().int().min(0).max(100).nullable().optional(),
  image_url: z.string().url().max(2048).nullable().optional(),
  extra_text: z.string().max(2000).nullable().optional(),
  ai_caption: z.string().max(2000).nullable().optional(),
  campaign_ids: z.array(z.string().uuid()).optional(),
  scheduled_at: z.string().datetime().nullable().optional(),
});

// =====================================================
// Caption Generator (Claude Haiku)
// =====================================================
export const CaptionRequestSchema = z.object({
  title: z.string().max(500),
  price_current: z.number().nullable().optional(),
  price_original: z.number().nullable().optional(),
  discount_pct: z.number().nullable().optional(),
  platform: z.enum(["amazon", "shopee", "ml"]).nullable().optional(),
  extra_text: z.string().max(2000).nullable().optional(),
  ai_prompt: z.string().max(8000).nullable().optional(),
});

// =====================================================
// Helper: parse seguro + resposta de erro padronizada
// =====================================================
export type ValidationError = {
  error: "validation";
  details: { path: string; message: string }[];
};

export function parseOrError<T>(
  schema: z.ZodType<T>,
  data: unknown
): { ok: true; data: T } | { ok: false; error: ValidationError } {
  const result = schema.safeParse(data);
  if (result.success) return { ok: true, data: result.data };
  return {
    ok: false,
    error: {
      error: "validation",
      details: result.error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      })),
    },
  };
}
