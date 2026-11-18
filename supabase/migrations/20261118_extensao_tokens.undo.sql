-- Desfaz 20261118_extensao_tokens.sql (a extensão volta a depender só do EXTENSAO_SECRET).
drop table if exists public.extensao_tokens;
drop table if exists public.perfil_membros;
alter table public.campaign_platforms drop constraint if exists campaign_platforms_platform_check;
alter table public.campaign_platforms add constraint campaign_platforms_platform_check check (platform = any (array['amazon','shopee','ml']));
