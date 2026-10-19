-- Categoria da campanha (19/Out): o que o automático escolhe pra ela.
--   geral   = mix do Ofertas Maternas (metas fralda/Amazon, @promocaozinha + coletores)
--   fraldas = fraldas em promoção do Fralda Barata (schema fraldas.produtos)
--   cupons  = cupons do Telegram com o nosso link (sem código repetido no dia)
--   enxoval = produtos de enxoval por palavra-chave (coletores + Telegram)
-- Campanhas de categoria NÃO tiram a oferta do Ofertas Maternas (status só muda pela campanha geral).
alter table public.campaigns add column if not exists categoria text not null default 'geral'
  check (categoria in ('geral','fraldas','cupons','enxoval'));

-- ofertas vindas do Fralda Barata (campanha de fraldas) — origem nova
alter table public.offers drop constraint if exists offers_source_check;
alter table public.offers add constraint offers_source_check
  check (source = any (array['manual','telegram','whatsapp','auto','fraldabarata']));
