-- Resultado por ETIQUETA/tag de afiliado por dia (23/Out). Hoje só o Mercado Livre: a página de ganhos do ML
-- (afiliados/dashboard, bloco earnings) dá cliques/vendas/comissão por etiqueta, mas a lista de vendas não diz
-- a etiqueta de cada venda. Fica SEPARADO de affiliate_sales de propósito: é um recorte do mesmo dinheiro,
-- somar com affiliate_sales contaria 2x. Gravado pelo ML Vendas Sync (n8n) via POST /api/vendas/import.
-- RLS: leitura só admin/operator; escrita só service_role.
create table if not exists public.afiliado_etiquetas_diario (
  fonte         text        not null,           -- 'ml'
  tag           text        not null,
  dia           date        not null,
  cliques       integer     not null default 0,
  vendas        integer     not null default 0,
  comissao      numeric(12,2) not null default 0,
  atualizado_em timestamptz not null default now(),
  primary key (fonte, tag, dia)
);
alter table public.afiliado_etiquetas_diario enable row level security;
drop policy if exists afiliado_etiquetas_diario_select on public.afiliado_etiquetas_diario;
create policy afiliado_etiquetas_diario_select on public.afiliado_etiquetas_diario for select using (public.is_operator());
