-- Campeões (29/Out, Bruno: "faz"): produtos que mais vendiam na operação manual voltam a ser repostados
-- em dia útil. Oferta marcada campeao=true não é apagada quando esgota (só fica marcada em promo_meta.esgotado)
-- e o Amazon Refresh atualiza o preço dela mesmo depois de publicada. RLS da tabela offers continua valendo.
alter table public.offers add column if not exists campeao boolean not null default false;
create index if not exists offers_campeao_idx on public.offers (perfil_id) where campeao;
comment on column public.offers.campeao is 'Produto campeão de venda: repostado em dia útil (auto-enqueue), preço mantido pelo Amazon Refresh.';
