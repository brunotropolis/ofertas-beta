-- Cliques nos links das ofertas por grupo (22/Out). O encurtador (worker utm-redirector) avisa o painel
-- a cada clique em asofertasmaternas.com.br/l/<slug>?g=<nº do grupo>. Sem IP, sem telefone.
-- bot = robô de prévia do WhatsApp/Facebook (não é gente; fica separado das contas).
-- RLS: leitura só admin/operator; escrita só service_role (POST /api/cliques, com segredo próprio).
create table if not exists public.link_cliques (
  id         bigserial   primary key,
  slug       text        not null,
  grupo      text,
  bot        boolean     not null default false,
  clicked_at timestamptz not null default now()
);
create index if not exists link_cliques_at_idx on public.link_cliques (clicked_at desc);
create index if not exists link_cliques_slug_idx on public.link_cliques (slug);
alter table public.link_cliques enable row level security;
drop policy if exists link_cliques_select on public.link_cliques;
create policy link_cliques_select on public.link_cliques for select using (public.is_operator());

-- Resumo pro painel: cliques (sem bot) por grupo e por slug desde p_since. SECURITY INVOKER, sem anon.
create or replace function public.cliques_resumo(p_since timestamptz)
returns table(grupo text, slug text, cliques bigint, primeiro timestamptz, ultimo timestamptz)
language sql stable security invoker set search_path = public as $$
  select grupo, slug, count(*), min(clicked_at), max(clicked_at)
  from public.link_cliques where clicked_at >= p_since and not bot
  group by grupo, slug;
$$;
revoke execute on function public.cliques_resumo(timestamptz) from public, anon;
grant execute on function public.cliques_resumo(timestamptz) to authenticated, service_role;
