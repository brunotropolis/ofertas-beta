-- Resumos somados no banco (19/Out) — com 170 grupos por post o publication_log passou de 30 mil linhas
-- por semana e o painel lia linha a linha (Início ~7s; Histórico cortava em 1.000 envios ≈ 6 posts).
-- SECURITY INVOKER: respeitam o RLS de quem chama. Sem execução pra anon/public.
-- Desfazer: 20261019_resumos_rapidos.undo.sql

create index if not exists publication_log_sent_at_idx on public.publication_log (sent_at desc);
create index if not exists publication_log_queue_idx on public.publication_log (queue_id);

-- Início: posts/envios/erros por dia (BRT) e plataforma, das campanhas pedidas, desde p_since
create or replace function public.inicio_resumo(p_campaigns uuid[], p_since timestamptz)
returns table(dia date, plataforma text, posts bigint, envios bigint, erros bigint, ultimo timestamptz)
language sql stable security invoker set search_path = public as $$
  select (l.sent_at at time zone 'America/Sao_Paulo')::date,
         coalesce(o.platform, 'outro'),
         count(distinct l.queue_id) filter (where l.status = 'success'),
         count(*) filter (where l.status = 'success'),
         count(*) filter (where l.status = 'error'),
         max(l.sent_at) filter (where l.status = 'success')
  from public.publication_log l
  left join public.publication_queue q on q.id = l.queue_id
  left join public.offers o on o.id = q.offer_id
  where l.campaign_id = any(p_campaigns) and l.sent_at >= p_since
  group by 1, 2;
$$;

-- Histórico: 1 linha por post (queue × campanha) no período, com quantos grupos receberam/erraram e por quais números
create or replace function public.historico_posts(p_since timestamptz, p_until timestamptz)
returns table(queue_id uuid, campaign_id uuid, primeiro timestamptz, ultimo timestamptz,
              sucesso bigint, erros bigint, numeros text[], erro_exemplo text)
language sql stable security invoker set search_path = public as $$
  select l.queue_id, l.campaign_id, min(l.sent_at), max(l.sent_at),
         count(*) filter (where l.status = 'success'),
         count(*) filter (where l.status = 'error'),
         array_agg(distinct l.phone_used) filter (where l.phone_used is not null),
         (array_agg(l.error_message order by l.sent_at desc) filter (where l.status = 'error'))[1]
  from public.publication_log l
  where l.sent_at >= p_since and l.sent_at <= p_until
  group by l.queue_id, l.campaign_id
  order by min(l.sent_at) desc;
$$;

revoke execute on function public.inicio_resumo(uuid[], timestamptz) from public, anon;
revoke execute on function public.historico_posts(timestamptz, timestamptz) from public, anon;
grant execute on function public.inicio_resumo(uuid[], timestamptz) to authenticated, service_role;
grant execute on function public.historico_posts(timestamptz, timestamptz) to authenticated, service_role;
