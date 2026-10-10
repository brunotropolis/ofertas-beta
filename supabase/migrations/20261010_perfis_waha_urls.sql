-- Revezamento de números: outros servidores WAHA do perfil (mesma API key, mesma sessão "default").
-- O dispatcher alterna por post entre perfis.waha_url e os de waha_urls.
alter table public.perfis add column if not exists waha_urls text[] not null default '{}';
