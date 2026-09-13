
create table if not exists public.perfis (
  id uuid primary key default uuid_generate_v4(),
  nome text not null,
  slug text unique not null,
  ai_prompt text,
  waha_url text,
  waha_session text default 'default',
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.campaigns add column if not exists perfil_id uuid references public.perfis(id) on delete set null;
alter table public.offers add column if not exists perfil_id uuid references public.perfis(id) on delete set null;
alter table public.perfis enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='perfis' and policyname='perfis_select') then
    create policy "perfis_select" on public.perfis for select to authenticated using (true);
  end if;
end $$;
create index if not exists idx_campaigns_perfil on public.campaigns(perfil_id);
create index if not exists idx_offers_perfil on public.offers(perfil_id);
