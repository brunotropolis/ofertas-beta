-- 26/11 (Bruno: página "promoções do dia" no link da bio das Ofertas Maternas)
-- 1) publication_queue.links_postados: { "<campaign_id>": "<link que saiu no grupo>" }, gravado pelo dispatcher
--    na hora do post (o link com a etiqueta da campanha é montado na hora e não ficava salvo).
-- 2) public.vitrine_maternas(p_dias): ÚNICA leitura pública. Devolve só campos de vitrine (título, foto, preço,
--    cupom, loja, link, campanha, data) das 6 campanhas das Ofertas Maternas. Nenhuma tabela fica aberta:
--    a função roda como dono (security definer) e escolhe as colunas. ABERTA DE PROPÓSITO pra anon.
-- Desfazer: 20261126c_vitrine_maternas.undo.sql

alter table public.publication_queue add column if not exists links_postados jsonb not null default '{}'::jsonb;

create or replace function public.vitrine_maternas(p_dias int default 4)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
with camps(id, chave, cod) as (values
  ('c3fa658f-fb1d-4a65-a978-3576506e62a0'::uuid, 'gerais',  'mrnofmaternas-20'),
  ('f8a639da-e33b-484f-9f83-51e28f342fad'::uuid, 'cupons',  'mrnofcupons-20'),
  ('5a6c841c-064d-403d-8fc4-cbc01b9cea2f'::uuid, 'enxoval', 'mrnofenxoval-20'),
  ('e57e215a-ea44-4afb-a72d-573d9d7fc027'::uuid, 'fraldas', 'mrnoffraldas-20'),
  ('6ce489b0-dcfe-4726-a4a8-83eb6ba7ca21'::uuid, 'lar',     'mrnoflar-20'),
  ('ef8ac9bc-12eb-4a29-bc52-1514eff658ba'::uuid, 'beleza',  'mrnofmae-20')
),
base as (
  select q.id as qid, q.published_at, q.links_postados, c.id as cid, c.chave, c.cod, o.*
  from publication_queue q
  join offers o on o.id = q.offer_id
  join camps c on c.id = any(q.campaign_ids)
  where q.status = 'published'
    and q.published_at > now() - make_interval(days => least(greatest(coalesce(p_dias, 4), 1), 7))
    and not coalesce(o.promo_meta ? 'aviso', false)
    and coalesce(o.promo_meta->>'esgotado', 'false') <> 'true'
    and (o.coupon_meta->>'validade_fim' is null or (o.coupon_meta->>'validade_fim')::timestamptz > now())
    and exists (select 1 from publication_log l
                where l.queue_id = q.id and l.campaign_id = c.id and l.status = 'success')
),
rank as (
  select b.*, row_number() over (partition by b.chave order by b.published_at desc) as rn,
         substring(coalesce(b.url, '') from '/(?:dp|gp/product|gp/aw/d)/([A-Z0-9]{10})') as asin
  from base b
)
select jsonb_build_object(
  'gerado_em', now(),
  'itens', coalesce(jsonb_agg(jsonb_build_object(
      'id', r.qid,
      'campanha', r.chave,
      'em', r.published_at,
      'tipo', coalesce(r.kind, 'produto'),
      'loja', coalesce(r.platform, r.coupon_meta->>'loja'),
      'titulo', r.title,
      'curto', r.promo_meta->>'nome_curto',
      'foto', r.image_url,
      'preco', r.price_current,
      'de', r.price_original,
      'off', r.discount_pct,
      'cupom', coalesce(r.coupon_code, r.coupon_meta->'codes'->>0),
      'regra', r.coupon_meta->>'regra',
      'unidade', r.promo_meta->>'unit_price',
      'prime', (r.promo_meta->>'prime_exclusive') = 'true',
      'link', coalesce(
        r.links_postados->>(r.cid::text),
        case when r.asin is not null and coalesce(r.platform, '') = 'amazon'
             then 'https://www.amazon.com.br/dp/' || r.asin || '?tag=' || r.cod end,
        r.affiliate_url, r.url)
    ) order by r.published_at desc), '[]'::jsonb)
)
from rank r
where r.rn <= 80;
$$;

comment on function public.vitrine_maternas(int) is
  'ABERTA DE PROPÓSITO (anon): vitrine pública "promoções do dia" das Ofertas Maternas. Só campos de vitrine das 6 campanhas Maternas; nada de dado de pessoa. 26/11/2026.';

revoke all on function public.vitrine_maternas(int) from public;
grant execute on function public.vitrine_maternas(int) to anon, authenticated, service_role;
