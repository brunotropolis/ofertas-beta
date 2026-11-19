-- Histórico de preço por produto (19/Nov, Bruno: "uma aba com a nossa base de valores de um produto, pra saber
-- se ele está caro ou barato comparado às últimas semanas"). offers.price_current é sobrescrito, então o banco
-- anota sozinho: 1 linha por produto por dia (menor, maior e último preço visto). Alimentado por gatilho em
-- offers (coleta, Amazon Refresh, conferência antes de postar, leitores Telegram/WhatsApp) e em
-- fraldas.historico_preco (coletor de fraldas). O gatilho NUNCA trava a gravação da oferta (erro é engolido).
-- RLS: leitura só operador/admin (is_operator); escrita só pelos gatilhos (security definer) e service_role.

create table if not exists public.preco_historico (
  produto       text          not null,   -- "amazon:B0CT922NH7" | "ml:MLB17336378" | "shopee:58208515475"
  dia           date          not null,   -- dia em horário de Brasília
  platform      text,
  titulo        text,
  imagem        text,
  preco_min     numeric(12,2) not null,
  preco_max     numeric(12,2) not null,
  preco_ultimo  numeric(12,2) not null,
  leituras      int           not null default 1,
  atualizado_em timestamptz   not null default now(),
  primary key (produto, dia)
);
create index if not exists preco_historico_dia_idx on public.preco_historico (dia desc);
alter table public.preco_historico enable row level security;
drop policy if exists preco_historico_select on public.preco_historico;
create policy preco_historico_select on public.preco_historico for select using (public.is_operator());

-- código do produto a partir da oferta (ASIN / MLB / itemId da Shopee)
create or replace function public.produto_codigo(p_platform text, p_ref text, p_url text, p_aff text)
returns text language sql immutable set search_path = public as $$
  select case p_platform
    when 'amazon' then 'amazon:' || (regexp_match(coalesce(p_ref,'') || ' ' || coalesce(p_url,'') || ' ' || coalesce(p_aff,''),
                                     '(?:/dp/|/gp/product/|amazon_)([A-Z0-9]{10})'))[1]
    when 'ml'     then 'ml:MLB' || (regexp_match(coalesce(p_ref,'') || ' ' || coalesce(p_url,'') || ' ' || coalesce(p_aff,''),
                                     'MLB-?([0-9]{6,})'))[1]
    when 'shopee' then 'shopee:' || (regexp_match(coalesce(p_ref,'') || ' ' || coalesce(p_url,'') || ' ' || coalesce(p_aff,''),
                                     '(?:shopee_|/product/[0-9]+/|-i\.[0-9]+\.|shp:[0-9]+\.)([0-9]{5,})'))[1]
  end;
$$;

create or replace function public.preco_historico_anotar(p_produto text, p_platform text, p_titulo text, p_imagem text,
                                                         p_preco numeric, p_quando timestamptz)
returns void language sql security definer set search_path = public as $$
  insert into public.preco_historico as h (produto, dia, platform, titulo, imagem, preco_min, preco_max, preco_ultimo, leituras, atualizado_em)
  values (p_produto, (p_quando at time zone 'America/Sao_Paulo')::date, p_platform, p_titulo, p_imagem, p_preco, p_preco, p_preco, 1, p_quando)
  on conflict (produto, dia) do update set
    preco_min     = least(h.preco_min, excluded.preco_min),
    preco_max     = greatest(h.preco_max, excluded.preco_max),
    preco_ultimo  = case when excluded.atualizado_em >= h.atualizado_em then excluded.preco_ultimo else h.preco_ultimo end,
    titulo        = coalesce(excluded.titulo, h.titulo),
    imagem        = coalesce(excluded.imagem, h.imagem),
    leituras      = h.leituras + 1,
    atualizado_em = greatest(h.atualizado_em, excluded.atualizado_em);
$$;
revoke execute on function public.preco_historico_anotar(text, text, text, text, numeric, timestamptz) from public, anon, authenticated;

create or replace function public.trg_offers_preco_historico()
returns trigger language plpgsql security definer set search_path = public as $$
declare cod text;
begin
  if new.kind is distinct from 'produto' or new.price_current is null or new.price_current <= 0 then return new; end if;
  if tg_op = 'UPDATE' and new.price_current is not distinct from old.price_current then return new; end if;
  begin
    cod := public.produto_codigo(new.platform, new.source_ref, new.url, new.affiliate_url);
    if cod is not null then
      perform public.preco_historico_anotar(cod, new.platform, new.title, new.image_url, new.price_current, now());
    end if;
  exception when others then
    raise warning 'preco_historico: %', sqlerrm;  -- nunca trava a oferta
  end;
  return new;
end $$;
revoke execute on function public.trg_offers_preco_historico() from public, anon, authenticated;
drop trigger if exists offers_preco_historico on public.offers;
create trigger offers_preco_historico after insert or update of price_current on public.offers
  for each row execute function public.trg_offers_preco_historico();

create or replace function public.trg_fraldas_preco_historico()
returns trigger language plpgsql security definer set search_path = public, fraldas as $$
declare cod text; plat text; tit text; img text;
begin
  begin
    plat := case split_part(new.produto_id, ':', 1) when 'amz' then 'amazon' when 'shp' then 'shopee' when 'ml' then 'ml' end;
    cod := case plat when 'amazon' then 'amazon:' || split_part(new.produto_id, ':', 2)
                     when 'shopee' then 'shopee:' || regexp_replace(split_part(new.produto_id, ':', 2), '^.*\.', '')
                     when 'ml' then new.produto_id end;
    if cod is not null and new.preco > 0 then
      select titulo, imagem_url into tit, img from fraldas.produtos where id = new.produto_id;
      perform public.preco_historico_anotar(cod, plat, tit, img, new.preco, coalesce(new.registrado_em, now()));
    end if;
  exception when others then
    raise warning 'preco_historico (fraldas): %', sqlerrm;
  end;
  return new;
end $$;
revoke execute on function public.trg_fraldas_preco_historico() from public, anon, authenticated;
drop trigger if exists fraldas_preco_historico on fraldas.historico_preco;
create trigger fraldas_preco_historico after insert on fraldas.historico_preco
  for each row execute function public.trg_fraldas_preco_historico();

-- Termômetro: preço de hoje x últimas p_dias (menor, mediana e maior do preço do dia), pra tela /precos.
-- SECURITY INVOKER: respeita o RLS (só operador vê).
create or replace function public.preco_termometro(p_dias int default 28, p_busca text default null,
                                                   p_platform text default null, p_limite int default 300)
returns table(produto text, platform text, titulo text, imagem text, preco_atual numeric, dia_atual date,
              menor numeric, mediana numeric, maior numeric, dias int, menor_dia date)
language sql stable security invoker set search_path = public as $$
  with janela as (
    select * from public.preco_historico h
    where h.dia >= ((now() at time zone 'America/Sao_Paulo')::date - p_dias)
      and (p_platform is null or h.platform = p_platform)
      and (p_busca is null or h.titulo ilike '%' || p_busca || '%' or h.produto ilike '%' || p_busca || '%')
  ), ult as (
    select distinct on (j.produto) j.produto, j.platform, j.titulo, j.imagem, j.preco_ultimo, j.dia
    from janela j order by j.produto, j.dia desc
  ), est as (
    select j.produto, min(j.preco_min) menor, max(j.preco_max) maior,
           percentile_cont(0.5) within group (order by j.preco_ultimo)::numeric(12,2) mediana,
           count(*)::int dias,
           (array_agg(j.dia order by j.preco_min, j.dia desc))[1] menor_dia
    from janela j group by j.produto
  )
  select u.produto, u.platform, u.titulo, u.imagem, u.preco_ultimo, u.dia, e.menor, e.mediana, e.maior, e.dias, e.menor_dia
  from ult u join est e using (produto)
  order by e.dias desc, u.dia desc
  limit greatest(1, least(p_limite, 1000));
$$;
revoke execute on function public.preco_termometro(int, text, text, int) from public, anon;
grant execute on function public.preco_termometro(int, text, text, int) to authenticated, service_role;

-- ── Preenchimento inicial ──────────────────────────────────────────────────────────────────────────────
-- (1) ofertas já gravadas (cada vez que o produto voltou num dia = 1 leitura daquele dia)
insert into public.preco_historico as h (produto, dia, platform, titulo, imagem, preco_min, preco_max, preco_ultimo, leituras, atualizado_em)
select cod, dia, max(platform), (array_agg(title order by created_at desc))[1], (array_agg(image_url order by created_at desc))[1],
       min(price_current), max(price_current), (array_agg(price_current order by created_at desc))[1], count(*), max(created_at)
from (
  select public.produto_codigo(platform, source_ref, url, affiliate_url) cod,
         (created_at at time zone 'America/Sao_Paulo')::date dia, platform, title, image_url, price_current, created_at
  from public.offers where kind = 'produto' and price_current > 0
) x where cod is not null
group by cod, dia
on conflict (produto, dia) do nothing;

-- (2) histórico das fraldas (desde 08/10)
insert into public.preco_historico as h (produto, dia, platform, titulo, imagem, preco_min, preco_max, preco_ultimo, leituras, atualizado_em)
select hp.cod, hp.dia, max(plat), max(p.titulo), max(p.imagem_url), min(hp.preco), max(hp.preco),
       (array_agg(hp.preco order by hp.registrado_em desc))[1], count(*), max(hp.registrado_em)
from (
  select hp.produto_id, hp.preco, hp.registrado_em, case split_part(produto_id, ':', 1) when 'amz' then 'amazon' when 'shp' then 'shopee' when 'ml' then 'ml' end plat,
         case split_part(produto_id, ':', 1) when 'amz' then 'amazon:' || split_part(produto_id, ':', 2)
              when 'shp' then 'shopee:' || regexp_replace(split_part(produto_id, ':', 2), '^.*\.', '')
              when 'ml' then produto_id end cod,
         (registrado_em at time zone 'America/Sao_Paulo')::date dia
  from fraldas.historico_preco hp where preco > 0
) hp left join fraldas.produtos p on p.id = hp.produto_id
where hp.cod is not null
group by hp.cod, hp.dia
on conflict (produto, dia) do update set
  preco_min = least(h.preco_min, excluded.preco_min),
  preco_max = greatest(h.preco_max, excluded.preco_max),
  leituras  = h.leituras + excluded.leituras,
  titulo    = coalesce(h.titulo, excluded.titulo),
  imagem    = coalesce(h.imagem, excluded.imagem);
