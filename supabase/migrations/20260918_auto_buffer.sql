-- Quantos itens automáticos manter pré-carregados na fila (lookahead), pra a tela
-- da Fila mostrar a lista dos próximos produtos + horários. Não fura o teto/dia:
-- o auto-enqueue só enfileira respeitando (auto_daily_cap - publicados - pendentes).
alter table public.campaigns add column if not exists auto_buffer int not null default 6;
