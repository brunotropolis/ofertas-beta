-- =====================================================
-- affiliate_sales — 11/Set/2026
-- Vendas/comissões de afiliado das fontes SEM API estável de ganhos:
--   • ML     → grão por-venda (endpoint interno /affiliate-program/api/dashboard/sales/general)
--   • Amazon → grão por-dia   (painel Associados /reporting/table group_by=date)
-- Shopee NÃO entra aqui: continua sendo puxada ao vivo pela API oficial no /api/vendas.
--
-- Alimentada pelo coletor via Chrome (skill /vendas-sync) → POST /api/vendas/import.
-- O dashboard (/api/vendas) LÊ desta tabela e funde com a Shopee ao vivo.
--
-- Aplicar via Supabase Dashboard > SQL Editor > New Query.
-- =====================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.affiliate_sales (
  source          text        NOT NULL CHECK (source IN ('ml','amazon')),
  external_id     text        NOT NULL,          -- ML: id da venda | Amazon: "day:YYYY-MM-DD"
  sold_at         timestamptz,                   -- data da venda (ML) / do dia (Amazon)
  period_start    date,                          -- janela do sync (referência do coletor)
  period_end      date,
  product_name    text,                          -- só ML/Shopee têm produto por linha; Amazon (dia) = null
  product_image   text,
  category        text,
  store           text,
  gross_value     numeric(14,2) NOT NULL DEFAULT 0,   -- GMV / receita
  units           integer       NOT NULL DEFAULT 0,   -- itens vendidos
  clicks          integer,                            -- Amazon (por dia)
  commission      numeric(14,2) NOT NULL DEFAULT 0,   -- comissão em BRL
  commission_pct  numeric(7,3),
  status          text,                               -- ML: PENDING/CONFIRMED/... | Amazon: null
  sale_type       text,
  utm             text,
  device          text,
  raw             jsonb,
  synced_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source, external_id)
);

CREATE INDEX IF NOT EXISTS affiliate_sales_source_sold_at_idx
  ON public.affiliate_sales (source, sold_at);

ALTER TABLE public.affiliate_sales ENABLE ROW LEVEL SECURITY;

-- SELECT: qualquer usuário logado (dashboard lê). Sem PII sensível aqui.
DROP POLICY IF EXISTS affiliate_sales_select ON public.affiliate_sales;
CREATE POLICY affiliate_sales_select ON public.affiliate_sales
  FOR SELECT USING (auth.role() = 'authenticated');

-- INSERT/UPDATE/DELETE: nenhuma policy → clientes authenticated NÃO escrevem.
-- Só o back-end (service_role, que bypassa RLS) grava, via /api/vendas/import.

COMMIT;
