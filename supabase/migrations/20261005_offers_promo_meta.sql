-- Detalhes da promoção pra montar a legenda no padrão do grupo (Prime, programe e poupe, por unidade, vendido por…).
-- Preenchido pelo leitor Telegram (texto do post) e pelo refresh Amazon (API). Só coluna nova; RLS de offers já vigente.
alter table public.offers add column if not exists promo_meta jsonb;
comment on column public.offers.promo_meta is 'promo: {prime_exclusive, badge, deal_end, unit_price, unit_label, vendido_por, amazon_seller, programe_poupe, adicione_n, confira_pagamento, checked_at}';
