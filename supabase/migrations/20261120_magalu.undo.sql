drop table if exists public.magalu_produtos;
alter table public.offers drop constraint if exists offers_platform_check;
alter table public.offers add constraint offers_platform_check check (platform = any (array['amazon','shopee','ml']));
alter table public.affiliate_sales drop constraint if exists affiliate_sales_source_check;
alter table public.affiliate_sales add constraint affiliate_sales_source_check check (source = any (array['ml','amazon','shopee']));
alter table public.perfis drop column if exists afiliados;
