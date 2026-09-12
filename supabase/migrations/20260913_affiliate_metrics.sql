-- Métricas de conta (nível agregado por janela) das fontes de afiliado.
-- Nasceu do ML: o endpoint /affiliate-program/api/dashboard/general devolve cliques, compradores,
-- pedidos, GMV e comissão (split marketplace/seller/brand) por janela — dados que NÃO existem por venda
-- (são totais da conta), então não cabem em affiliate_sales. Alimenta o funil clique→pedido do ML no dash.
-- Grão: 1 linha por (source, days). O coletor /vendas-sync reescreve as janelas 7/30/90.

create table if not exists public.affiliate_metrics (
  source            text        not null,
  days              int         not null,          -- janela: 7 / 30 / 90
  clicks            bigint      not null default 0,
  buyers            bigint      not null default 0,
  requests          bigint      not null default 0,
  orders            bigint      not null default 0,
  gmv               numeric     not null default 0,
  commission        numeric     not null default 0,
  comm_marketplace  numeric     not null default 0, -- ML: comissão de marketplace
  comm_seller       numeric     not null default 0, -- ML: comissão de seller
  comm_brand        numeric     not null default 0, -- ML: comissão de brand
  synced_at         timestamptz not null default now(),
  primary key (source, days)
);

alter table public.affiliate_metrics enable row level security;

-- leitura pra qualquer usuário logado (mesmo padrão de affiliate_sales); escrita só service_role
drop policy if exists "affiliate_metrics_select" on public.affiliate_metrics;
create policy "affiliate_metrics_select" on public.affiliate_metrics
  for select to authenticated using (true);
