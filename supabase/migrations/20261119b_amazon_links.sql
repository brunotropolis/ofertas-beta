-- amzn.to gerado DENTRO do Chrome do Bruno pela extensão "Buscador Geek" (19/Nov, Bruno via Mr. Ocean: "vamos de 1").
-- Era: cópia do cookie da Amazon no servidor (a Amazon derruba a cópia usada de outro IP em 20-40 min).
-- Virou: o banco pede o link quando a oferta Amazon entra na fila (gatilho em publication_queue), a extensão busca os
-- pendentes a cada 1 min, chama o SiteStripe no navegador logado e devolve. amzn.to não vence: cache permanente.
-- RLS: leitura só operador (is_operator); escrita só service_role (rotas do painel) e o gatilho.

create table if not exists public.amazon_links (
  asin       text        not null,
  tag        text        not null,
  curto      text,
  status     text        not null default 'pendente' check (status in ('pendente', 'ok', 'erro')),
  tentativas int         not null default 0,
  erro       text,
  pedido_em  timestamptz not null default now(),
  gerado_em  timestamptz,
  primary key (asin, tag)
);
comment on table public.amazon_links is 'Cache ASIN+tag > amzn.to gerado pela extensao Buscador Geek no Chrome logado (19/Nov). Leitura so operador; escrita service_role e gatilho.';
create index if not exists amazon_links_pendente_idx on public.amazon_links (pedido_em) where status <> 'ok';
alter table public.amazon_links enable row level security;
drop policy if exists amazon_links_select on public.amazon_links;
create policy amazon_links_select on public.amazon_links for select using (public.is_operator());

-- etiqueta da campanha: igual ao dispatcher (encurtar.ts AMAZON_TAG_CAMPANHA + CAMPANHA_CODIGO)
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

create or replace function public.trg_queue_amazon_links()
returns trigger language plpgsql security definer set search_path = public as $$
declare o record; asin text; cid uuid; tg text;
begin
  begin
    select platform, source_ref, url, affiliate_url, kind into o from public.offers where id = new.offer_id;
    if o.platform is distinct from 'amazon' then return new; end if;
    asin := split_part(coalesce(public.produto_codigo('amazon', o.source_ref, o.url, o.affiliate_url), ''), ':', 2);
    if asin = '' then return new; end if;
    foreach cid in array coalesce(new.campaign_ids, '{}') loop
      tg := public.amazon_tag_campanha(cid);
      if tg is not null then
        insert into public.amazon_links (asin, tag) values (asin, tg) on conflict (asin, tag) do nothing;
      end if;
    end loop;
  exception when others then
    raise warning 'amazon_links: %', sqlerrm; -- nunca trava a fila
  end;
  return new;
end $$;
revoke execute on function public.trg_queue_amazon_links() from public, anon, authenticated;
drop trigger if exists queue_amazon_links on public.publication_queue;
create trigger queue_amazon_links after insert on public.publication_queue
  for each row execute function public.trg_queue_amazon_links();

-- o que já está na fila agora
insert into public.amazon_links (asin, tag)
select distinct split_part(public.produto_codigo('amazon', o.source_ref, o.url, o.affiliate_url), ':', 2), public.amazon_tag_campanha(cid)
from public.publication_queue q join public.offers o on o.id = q.offer_id, unnest(q.campaign_ids) cid
where q.status in ('pending', 'processing') and o.platform = 'amazon'
  and public.produto_codigo('amazon', o.source_ref, o.url, o.affiliate_url) is not null
  and public.amazon_tag_campanha(cid) is not null
on conflict do nothing;
