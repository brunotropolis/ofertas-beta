-- Trickle auto-enqueue: a campanha posta sozinha um teto de ofertas/dia,
-- puxando as mais novas da caixa (drafts prontos do perfil), respeitando
-- o timer normal do dispatcher e uma janela de horário (BRT).
alter table public.campaigns add column if not exists auto_enqueue boolean not null default false;
alter table public.campaigns add column if not exists auto_daily_cap int not null default 10;
alter table public.campaigns add column if not exists auto_window_start int not null default 8;   -- hora BRT (inclusive)
alter table public.campaigns add column if not exists auto_window_end int not null default 21;    -- hora BRT (exclusive)
