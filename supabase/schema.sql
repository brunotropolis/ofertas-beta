-- =====================================================
-- OFERTAS BETA — Schema Supabase
-- Projeto: Buscador Geek Admin Panel
-- =====================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- 1. PROFILES (extends Supabase Auth)
-- =====================================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'operator', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', 'viewer');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =====================================================
-- 2. CAMPAIGNS
-- =====================================================
CREATE TABLE public.campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  niche TEXT,
  ai_prompt TEXT,
  timer_minutes INT NOT NULL DEFAULT 15,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- 3. CAMPAIGN PHONES
-- =====================================================
CREATE TABLE public.campaign_phones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  evolution_instance_id TEXT NOT NULL,
  is_admin BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  connected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- 4. CAMPAIGN GROUPS (WhatsApp)
-- =====================================================
CREATE TABLE public.campaign_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  phone_id UUID REFERENCES public.campaign_phones(id) ON DELETE SET NULL,
  group_jid TEXT NOT NULL,
  group_name TEXT NOT NULL,
  group_type TEXT NOT NULL DEFAULT 'group' CHECK (group_type IN ('group', 'channel')),
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- 5. CAMPAIGN TELEGRAM
-- =====================================================
CREATE TABLE public.campaign_telegram (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  chat_id TEXT NOT NULL,
  chat_name TEXT NOT NULL,
  chat_type TEXT NOT NULL DEFAULT 'monitor' CHECK (chat_type IN ('monitor', 'destination')),
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- 6. CAMPAIGN PLATFORMS (affiliate credentials)
-- =====================================================
CREATE TABLE public.campaign_platforms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('amazon', 'shopee', 'ml')),
  api_key TEXT,
  api_secret TEXT,
  cookie TEXT,
  cookie_expires_at TIMESTAMPTZ,
  keywords TEXT[] DEFAULT '{}',
  categories TEXT[] DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(campaign_id, platform)
);

-- =====================================================
-- 7. OFFERS
-- =====================================================
CREATE TABLE public.offers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'telegram', 'whatsapp', 'auto')),
  source_ref TEXT,
  platform TEXT CHECK (platform IN ('amazon', 'shopee', 'ml')),
  url TEXT NOT NULL,
  affiliate_url TEXT,
  title TEXT,
  price_current DECIMAL(10,2),
  price_original DECIMAL(10,2),
  discount_pct INT,
  image_url TEXT,
  extra_text TEXT,
  ai_caption TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'queued', 'publishing', 'published', 'error')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '48 hours')
);

-- Index for fast source queries
CREATE INDEX idx_offers_source ON public.offers(source);
CREATE INDEX idx_offers_status ON public.offers(status);
CREATE INDEX idx_offers_expires_at ON public.offers(expires_at);
CREATE INDEX idx_offers_created_at ON public.offers(created_at DESC);

-- =====================================================
-- 8. PUBLICATION QUEUE
-- =====================================================
CREATE TABLE public.publication_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  offer_id UUID REFERENCES public.offers(id) ON DELETE CASCADE,
  campaign_ids UUID[] NOT NULL DEFAULT '{}',
  position INT NOT NULL DEFAULT 0,
  scheduled_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'locked', 'publishing', 'published', 'error')),
  published_at TIMESTAMPTZ,
  error_message TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_queue_status ON public.publication_queue(status);
CREATE INDEX idx_queue_position ON public.publication_queue(position);
CREATE INDEX idx_queue_scheduled ON public.publication_queue(scheduled_at);

-- =====================================================
-- 9. PUBLICATION LOG
-- =====================================================
CREATE TABLE public.publication_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  queue_id UUID REFERENCES public.publication_queue(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  group_jid TEXT NOT NULL,
  group_name TEXT,
  phone_used TEXT,
  status TEXT NOT NULL CHECK (status IN ('success', 'error')),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  error_message TEXT
);

CREATE INDEX idx_log_queue_id ON public.publication_log(queue_id);
CREATE INDEX idx_log_sent_at ON public.publication_log(sent_at DESC);

-- =====================================================
-- 10. SCHEDULED POSTS (announcements, invites)
-- =====================================================
CREATE TABLE public.scheduled_posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  body TEXT,
  image_url TEXT,
  link TEXT,
  campaign_ids UUID[] NOT NULL DEFAULT '{}',
  scheduled_at TIMESTAMPTZ NOT NULL,
  repeat_type TEXT NOT NULL DEFAULT 'once' CHECK (repeat_type IN ('once', 'daily', 'weekly')),
  repeat_limit INT NOT NULL DEFAULT 1,
  repeat_count INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'publishing', 'done', 'error')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_scheduled_posts_scheduled_at ON public.scheduled_posts(scheduled_at);
CREATE INDEX idx_scheduled_posts_status ON public.scheduled_posts(status);

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_phones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_telegram ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_platforms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publication_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publication_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_posts ENABLE ROW LEVEL SECURITY;

-- Helper function: get current user role
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- PROFILES policies
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (id = auth.uid());
CREATE POLICY "Admin can view all profiles" ON public.profiles
  FOR ALL USING (public.current_user_role() = 'admin');
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (id = auth.uid());

-- CAMPAIGNS policies
CREATE POLICY "All authenticated users can view campaigns" ON public.campaigns
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Admin and operator can manage campaigns" ON public.campaigns
  FOR ALL USING (public.current_user_role() IN ('admin', 'operator'));

-- CAMPAIGN_PHONES policies
CREATE POLICY "All authenticated can view phones" ON public.campaign_phones
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Admin and operator can manage phones" ON public.campaign_phones
  FOR ALL USING (public.current_user_role() IN ('admin', 'operator'));

-- CAMPAIGN_GROUPS policies
CREATE POLICY "All authenticated can view groups" ON public.campaign_groups
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Admin and operator can manage groups" ON public.campaign_groups
  FOR ALL USING (public.current_user_role() IN ('admin', 'operator'));

-- CAMPAIGN_TELEGRAM policies
CREATE POLICY "All authenticated can view telegram" ON public.campaign_telegram
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Admin and operator can manage telegram" ON public.campaign_telegram
  FOR ALL USING (public.current_user_role() IN ('admin', 'operator'));

-- CAMPAIGN_PLATFORMS policies
CREATE POLICY "All authenticated can view platforms" ON public.campaign_platforms
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Admin and operator can manage platforms" ON public.campaign_platforms
  FOR ALL USING (public.current_user_role() IN ('admin', 'operator'));

-- OFFERS policies
CREATE POLICY "All authenticated can view offers" ON public.offers
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Admin and operator can manage offers" ON public.offers
  FOR ALL USING (public.current_user_role() IN ('admin', 'operator'));

-- PUBLICATION_QUEUE policies
CREATE POLICY "All authenticated can view queue" ON public.publication_queue
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Admin and operator can manage queue" ON public.publication_queue
  FOR ALL USING (public.current_user_role() IN ('admin', 'operator'));

-- PUBLICATION_LOG policies
CREATE POLICY "All authenticated can view logs" ON public.publication_log
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Service role can insert logs" ON public.publication_log
  FOR INSERT WITH CHECK (true);

-- SCHEDULED_POSTS policies
CREATE POLICY "All authenticated can view scheduled posts" ON public.scheduled_posts
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Admin and operator can manage scheduled posts" ON public.scheduled_posts
  FOR ALL USING (public.current_user_role() IN ('admin', 'operator'));

-- =====================================================
-- UPDATED_AT trigger function
-- =====================================================
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_campaigns_updated_at
  BEFORE UPDATE ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_campaign_platforms_updated_at
  BEFORE UPDATE ON public.campaign_platforms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
