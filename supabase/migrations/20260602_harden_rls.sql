-- =====================================================
-- HARDEN RLS — 02-Jun-2026
-- Aplicar via Supabase Dashboard > SQL Editor > New Query
-- Ou: supabase db push (requer Supabase CLI configurado)
--
-- Resolve achados de auditoria de segurança:
-- - CRÍTICO: publication_log aceitava INSERT de qualquer cliente authenticated
-- - ALTO: operators podiam DELETE qualquer campanha/oferta de outros
-- - MÉDIO: faltava isolamento por created_by
--
-- Estratégia:
-- - SELECT permanece amplo (admin/operator/viewer veem tudo — necessário p/ UI)
-- - INSERT requer admin/operator (igual antes)
-- - UPDATE/DELETE: admin OR (operator AND created_by = auth.uid())
--   ↑ operators só editam o que criaram. admin tem override total.
-- - publication_log INSERT: só service_role (back-end), nunca cliente direto.
-- =====================================================

BEGIN;

-- Helper: checar se user é admin (cache do role)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin');
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper: checar se user é operator (não-admin)
CREATE OR REPLACE FUNCTION public.is_operator()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'operator'));
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- =====================================================
-- CAMPAIGNS — isolamento por owner em UPDATE/DELETE
-- =====================================================
DROP POLICY IF EXISTS "Admin and operator can manage campaigns" ON public.campaigns;
CREATE POLICY "Authenticated can insert campaigns"  ON public.campaigns
  FOR INSERT WITH CHECK (public.is_operator());
CREATE POLICY "Owner or admin can update campaigns" ON public.campaigns
  FOR UPDATE USING (public.is_admin() OR created_by = auth.uid());
CREATE POLICY "Owner or admin can delete campaigns" ON public.campaigns
  FOR DELETE USING (public.is_admin() OR created_by = auth.uid());

-- =====================================================
-- OFFERS — isolamento por owner
-- =====================================================
DROP POLICY IF EXISTS "Admin and operator can manage offers" ON public.offers;
CREATE POLICY "Authenticated can insert offers"  ON public.offers
  FOR INSERT WITH CHECK (public.is_operator());
CREATE POLICY "Owner or admin can update offers" ON public.offers
  FOR UPDATE USING (public.is_admin() OR created_by = auth.uid());
CREATE POLICY "Owner or admin can delete offers" ON public.offers
  FOR DELETE USING (public.is_admin() OR created_by = auth.uid());

-- =====================================================
-- PUBLICATION_QUEUE — isolamento por owner
-- =====================================================
DROP POLICY IF EXISTS "Admin and operator can manage queue" ON public.publication_queue;
CREATE POLICY "Authenticated can insert queue"  ON public.publication_queue
  FOR INSERT WITH CHECK (public.is_operator());
CREATE POLICY "Owner or admin can update queue" ON public.publication_queue
  FOR UPDATE USING (public.is_admin() OR created_by = auth.uid());
CREATE POLICY "Owner or admin can delete queue" ON public.publication_queue
  FOR DELETE USING (public.is_admin() OR created_by = auth.uid());

-- =====================================================
-- SCHEDULED_POSTS — isolamento por owner
-- =====================================================
DROP POLICY IF EXISTS "Admin and operator can manage scheduled posts" ON public.scheduled_posts;
CREATE POLICY "Authenticated can insert scheduled"  ON public.scheduled_posts
  FOR INSERT WITH CHECK (public.is_operator());
CREATE POLICY "Owner or admin can update scheduled" ON public.scheduled_posts
  FOR UPDATE USING (public.is_admin() OR created_by = auth.uid());
CREATE POLICY "Owner or admin can delete scheduled" ON public.scheduled_posts
  FOR DELETE USING (public.is_admin() OR created_by = auth.uid());

-- =====================================================
-- CAMPAIGN_PHONES — herdam a permissao da campanha pai
-- (operator só edita phones de campaign que ele criou)
-- =====================================================
DROP POLICY IF EXISTS "Admin and operator can manage phones" ON public.campaign_phones;
CREATE POLICY "Manage phones via parent campaign" ON public.campaign_phones
  FOR ALL USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = campaign_phones.campaign_id AND c.created_by = auth.uid()
    )
  );

-- =====================================================
-- CAMPAIGN_GROUPS — idem
-- =====================================================
DROP POLICY IF EXISTS "Admin and operator can manage groups" ON public.campaign_groups;
CREATE POLICY "Manage groups via parent campaign" ON public.campaign_groups
  FOR ALL USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = campaign_groups.campaign_id AND c.created_by = auth.uid()
    )
  );

-- =====================================================
-- CAMPAIGN_TELEGRAM — idem
-- =====================================================
DROP POLICY IF EXISTS "Admin and operator can manage telegram" ON public.campaign_telegram;
CREATE POLICY "Manage telegram via parent campaign" ON public.campaign_telegram
  FOR ALL USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = campaign_telegram.campaign_id AND c.created_by = auth.uid()
    )
  );

-- =====================================================
-- CAMPAIGN_PLATFORMS — idem (CONTÉM SECRETS — extra cuidado)
-- =====================================================
DROP POLICY IF EXISTS "Admin and operator can manage platforms" ON public.campaign_platforms;
DROP POLICY IF EXISTS "All authenticated can view platforms" ON public.campaign_platforms;
CREATE POLICY "View platforms via parent campaign" ON public.campaign_platforms
  FOR SELECT USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = campaign_platforms.campaign_id AND c.created_by = auth.uid()
    )
  );
CREATE POLICY "Manage platforms via parent campaign" ON public.campaign_platforms
  FOR ALL USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = campaign_platforms.campaign_id AND c.created_by = auth.uid()
    )
  );

-- =====================================================
-- PUBLICATION_LOG — FECHAR INSERT (era WITH CHECK true)
-- =====================================================
DROP POLICY IF EXISTS "Service role can insert logs" ON public.publication_log;
-- Sem policy de INSERT pra `authenticated` = nenhum cliente autenticado
-- insere. Service_role (back-end) bypassa RLS por padrão e continua escrevendo.
-- (Logs ficam imutáveis pra clientes autenticados — só SELECT.)

COMMIT;
