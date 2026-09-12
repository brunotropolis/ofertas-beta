-- =====================================================
-- anuncios — 12/Set/2026
-- Posts de oferta de um grupo WhatsApp (Ofertas Maternas) = "anúncios".
-- Alimentada pelo coletor scripts/sync_anuncios.mjs (WHAPI). Guarda CRU; normalização no app.
-- Cruzada com affiliate_sales/Shopee em /api/vendas/analise (eficiência vd/ad, oportunidades).
-- Aplicar via Supabase SQL Editor.
-- =====================================================
BEGIN;
CREATE TABLE IF NOT EXISTS public.anuncios (
  msg_id      text PRIMARY KEY,        -- id da mensagem WHAPI (dedup)
  group_id    text NOT NULL,
  group_name  text,
  posted_at   timestamptz,
  platform    text,                    -- shopee | amazon | ml | magazine | outro
  product_raw text,                    -- texto em *negrito* do post
  url         text,
  raw         jsonb,
  synced_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS anuncios_posted_idx ON public.anuncios (posted_at);
ALTER TABLE public.anuncios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anuncios_select ON public.anuncios;
CREATE POLICY anuncios_select ON public.anuncios FOR SELECT USING (auth.role() = 'authenticated');
COMMIT;
