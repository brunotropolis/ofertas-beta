-- 04/Nov/2026: notícias geek do canal "Manual do Geek" (antes na planilha NOTICIAS_POSTADAS 1br6TG8r…).
-- Só o n8n (service_role) lê e grava; RLS ligado e sem política = fechado pra anon/authenticated de propósito.
create table if not exists public.noticias_geek (
  id bigserial primary key,
  link text not null unique,
  site text,
  titulo text,
  postado_em timestamptz not null default now(),
  destino text not null default '120363423824646473@newsletter',
  mensagem jsonb,
  created_at timestamptz not null default now()
);
create index if not exists noticias_geek_postado_em on public.noticias_geek (postado_em desc);
alter table public.noticias_geek enable row level security;
revoke all on public.noticias_geek from anon, authenticated;
comment on table public.noticias_geek is 'Notícias postadas no canal Manual do Geek (n8n NOTICIAS GEEK). Só service_role; RLS sem política de propósito.';
