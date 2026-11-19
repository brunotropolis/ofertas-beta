drop trigger if exists offers_preco_historico on public.offers;
drop trigger if exists fraldas_preco_historico on fraldas.historico_preco;
drop function if exists public.trg_offers_preco_historico();
drop function if exists public.trg_fraldas_preco_historico();
drop function if exists public.preco_termometro(int, text, text, int);
drop function if exists public.preco_historico_anotar(text, text, text, text, numeric, timestamptz);
drop function if exists public.produto_codigo(text, text, text, text);
drop table if exists public.preco_historico;
