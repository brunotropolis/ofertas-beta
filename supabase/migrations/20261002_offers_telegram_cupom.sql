-- Telegram (leitor de canais públicos) + cupom como tipo próprio de oferta.
-- Só adiciona colunas em public.offers (RLS da tabela já vigente; nada de policy nova).
alter table public.offers
  add column if not exists kind text not null default 'produto' check (kind in ('produto','cupom')),
  add column if not exists coupon_code text,
  add column if not exists coupon_meta jsonb,
  add column if not exists source_channel text;

comment on column public.offers.kind is 'produto | cupom (cupom = código de desconto da loja, sem produto)';
comment on column public.offers.coupon_meta is 'cupom: {codes[], loja, regra} extraído do post';
comment on column public.offers.source_channel is 'origem detalhada, ex.: canal do Telegram (@promocaozinha)';
