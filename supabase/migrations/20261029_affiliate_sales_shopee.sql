-- 29/Out: affiliate_sales passa a guardar a Shopee (histórico pro Tio Patinhas; a API da Shopee só dá 3 meses).
-- A tela Vendas segue lendo a Shopee ao vivo. RLS da tabela não muda (SELECT logado, escrita só service_role).
alter table public.affiliate_sales drop constraint if exists affiliate_sales_source_check;
alter table public.affiliate_sales add constraint affiliate_sales_source_check check (source in ('ml','amazon','shopee'));
