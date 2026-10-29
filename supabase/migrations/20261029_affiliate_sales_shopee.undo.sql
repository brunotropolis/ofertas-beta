-- Desfaz 20261029_affiliate_sales_shopee.sql (apaga as linhas da Shopee antes de voltar a regra).
delete from public.affiliate_sales where source = 'shopee';
alter table public.affiliate_sales drop constraint if exists affiliate_sales_source_check;
alter table public.affiliate_sales add constraint affiliate_sales_source_check check (source in ('ml','amazon'));
