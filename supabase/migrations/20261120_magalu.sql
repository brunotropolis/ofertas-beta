-- Magalu nas Ofertas Maternas (20/Nov/2026).
-- 1) códigos de afiliado por perfil em lojas sem API (Magalu = vitrine do Magazine Você; depois Natura, etc.)
alter table public.perfis add column if not exists afiliados jsonb not null default '{}'::jsonb;
update public.perfis set afiliados = afiliados || '{"magalu":"magazinemanualdorn"}'::jsonb where slug = 'ofertas-maternas';
-- 2) offers e affiliate_sales aceitam a loja nova
alter table public.offers drop constraint if exists offers_platform_check;
alter table public.offers add constraint offers_platform_check check (platform = any (array['amazon','shopee','ml','magalu']));
alter table public.affiliate_sales drop constraint if exists affiliate_sales_source_check;
alter table public.affiliate_sales add constraint affiliate_sales_source_check check (source = any (array['ml','amazon','shopee','magalu']));
-- 3) leitura do produto Magalu feita pelo Chrome do operador (o site bloqueia servidor com 403): o painel pede,
--    a extensão lê a página e devolve título, foto, preço e estoque. Fechado: só operador lê pelo navegador.
create table if not exists public.magalu_produtos (
  sku text primary key,
  caminho text not null,            -- <slug>/p/<sku>/<cat>/<sub>
  titulo text,
  imagem text,
  preco numeric,
  preco_de numeric,
  preco_pix numeric,
  disponivel boolean,
  status text not null default 'pendente',  -- pendente | ok | erro
  erro text,
  tentativas int not null default 0,
  pedido_em timestamptz not null default now(),
  lido_em timestamptz
);
alter table public.magalu_produtos enable row level security;
drop policy if exists magalu_produtos_operador on public.magalu_produtos;
create policy magalu_produtos_operador on public.magalu_produtos for select to authenticated using (public.is_operator());
revoke all on public.magalu_produtos from anon;
