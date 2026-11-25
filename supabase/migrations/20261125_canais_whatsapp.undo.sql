-- desfaz 20261125_canais_whatsapp.sql (apagar antes as campanhas com categoria='canal')
alter table public.campaigns drop constraint if exists campaigns_categoria_check;
alter table public.campaigns add constraint campaigns_categoria_check check (categoria in ('geral','fraldas','cupons','enxoval'));
create or replace function public.amazon_tag_campanha(p_campaign uuid)
returns text language sql stable security definer set search_path = public as $$
  select case
    when pf.slug is distinct from 'ofertas-maternas' then 'buscadorgeek-20'
    when c.categoria = 'fraldas' then 'mrnoffraldas-20'
    when c.categoria = 'cupons'  then 'mrnofcupons-20'
    when c.categoria = 'enxoval' then 'mrnofenxoval-20'
    else 'mrnofmaternas-20' end
  from public.campaigns c left join public.perfis pf on pf.id = c.perfil_id
  where c.id = p_campaign;
$$;
revoke execute on function public.amazon_tag_campanha(uuid) from public, anon, authenticated;
