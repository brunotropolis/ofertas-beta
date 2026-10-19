drop function if exists public.inicio_resumo(uuid[], timestamptz);
drop function if exists public.historico_posts(timestamptz, timestamptz);
drop index if exists public.publication_log_queue_idx;
drop index if exists public.publication_log_sent_at_idx;
