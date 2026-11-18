-- Extensão "Buscador Geek" (18/Nov/2026): acesso POR PESSOA no lugar do segredo compartilhado.
-- Cada pessoa conecta a extensão pelo painel e recebe um código próprio (só o hash fica aqui), preso a UM perfil.
-- A rota /api/extensao/sessao aceita esse código e grava a sessão só na campanha principal desse perfil.
-- Fechado por padrão (regra 9): RLS ligado, a pessoa só vê os próprios códigos/vínculos; quem cria/revoga é o servidor.

-- quem pode usar cada perfil além de admin/operator (cliente com perfil próprio, ex.: Renara)
create table if not exists public.perfil_membros (
  perfil_id uuid not null references public.perfis(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (perfil_id, user_id)
);
alter table public.perfil_membros enable row level security;
drop policy if exists perfil_membros_select_dono on public.perfil_membros;
create policy perfil_membros_select_dono on public.perfil_membros for select to authenticated using (user_id = auth.uid());

create table if not exists public.extensao_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  perfil_id uuid not null references public.perfis(id) on delete cascade,
  nome text not null default 'Chrome',
  token_hash text not null unique,
  prefixo text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index if not exists idx_extensao_tokens_user on public.extensao_tokens(user_id);
alter table public.extensao_tokens enable row level security;
drop policy if exists extensao_tokens_select_dono on public.extensao_tokens;
create policy extensao_tokens_select_dono on public.extensao_tokens for select to authenticated using (user_id = auth.uid());
revoke all on public.extensao_tokens from anon;
revoke all on public.perfil_membros from anon;

-- lojas novas (Magalu, Natura...) sem mexer no banco: o código valida o nome pela lista de lojas
alter table public.campaign_platforms drop constraint if exists campaign_platforms_platform_check;
alter table public.campaign_platforms add constraint campaign_platforms_platform_check check (platform ~ '^[a-z0-9_]{2,20}$');
