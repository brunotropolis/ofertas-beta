-- 25/Nov: campanhas de CANAL de WhatsApp (Manual do Recém-Nascido, Achados da Day, Manual dos Adultos).
-- categoria 'canal' = escolhe pela regra do canal (campaigns.niche, ver lib/auto-categorias.ts escolherCanal) e não muda offers.status.
-- E a etiqueta Amazon: perfis Lar e Mãe são da conta do Manual (antes caíam na buscadorgeek-20 por não serem 'ofertas-maternas').
alter table public.campaigns drop constraint if exists campaigns_categoria_check;
alter table public.campaigns add constraint campaigns_categoria_check
  check (categoria in ('geral','fraldas','cupons','enxoval','canal'));

create or replace function public.amazon_tag_campanha(p_campaign uuid)
returns text language sql stable security definer set search_path = public as $$
  select case
    when pf.slug is null or pf.slug not in ('ofertas-maternas','ofertas-lar','ofertas-mae') then 'buscadorgeek-20'
    when c.categoria = 'fraldas' then 'mrnoffraldas-20'
    when c.categoria = 'cupons'  then 'mrnofcupons-20'
    when c.categoria = 'enxoval' then 'mrnofenxoval-20'
    else 'mrnofmaternas-20' end
  from public.campaigns c left join public.perfis pf on pf.id = c.perfil_id
  where c.id = p_campaign;
$$;
revoke execute on function public.amazon_tag_campanha(uuid) from public, anon, authenticated;
