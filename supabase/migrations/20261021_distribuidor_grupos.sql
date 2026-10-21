-- Distribuidor de leads nos grupos (21/Out): asofertasmaternas.com.br → grupo menos cheio (substitui o SendFlow).
-- invite_code: código do convite de cada grupo (chat.whatsapp.com/<code>), lido pela WAHA (número admin).
-- grupos_cliques: 1 linha por clique no link (sem IP, sem telefone) — soma com o retrato de membros
-- pra não mandar todo mundo pro mesmo grupo entre um retrato e outro, e vira métrica de entradas pelo link.
-- RLS: leitura só admin/operator; escrita só service_role (rota pública /api/entrar grava com service role).
alter table public.campaign_groups add column if not exists invite_code text;

create table if not exists public.grupos_cliques (
  id         bigserial   primary key,
  perfil_id  uuid,
  group_jid  text        not null,
  clicked_at timestamptz not null default now()
);
create index if not exists grupos_cliques_group_idx on public.grupos_cliques (group_jid, clicked_at desc);
alter table public.grupos_cliques enable row level security;
drop policy if exists grupos_cliques_select on public.grupos_cliques;
create policy grupos_cliques_select on public.grupos_cliques for select using (public.is_operator());
