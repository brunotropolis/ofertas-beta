-- Plataformas por campanha: coluna tag (não-secreta) + RPCs de save/read com cripto
alter table public.campaign_platforms add column if not exists tag text;
create unique index if not exists uq_campaign_platform on public.campaign_platforms(campaign_id, platform);

-- Salva/atualiza credenciais de UMA plataforma.
-- Segredo NULL = mantém o atual; '' = limpa; valor = criptografa e grava.
create or replace function public.save_platform_creds(
  p_campaign_id uuid,
  p_platform text,
  p_api_key text default null,
  p_api_secret text default null,
  p_cookie text default null,
  p_tag text default null,
  p_keywords text[] default null,
  p_categories text[] default null,
  p_is_active boolean default null,
  p_cookie_expires_at timestamptz default null
) returns void
language plpgsql
security definer
set search_path = public, vault, extensions
as $func$
begin
  insert into public.campaign_platforms as cp
    (campaign_id, platform, api_key_enc, api_secret_enc, cookie_enc, tag, keywords, categories, is_active, cookie_expires_at)
  values (
    p_campaign_id, p_platform,
    case when p_api_key is not null and p_api_key <> '' then encrypt_credential(p_api_key) end,
    case when p_api_secret is not null and p_api_secret <> '' then encrypt_credential(p_api_secret) end,
    case when p_cookie is not null and p_cookie <> '' then encrypt_credential(p_cookie) end,
    p_tag, coalesce(p_keywords, '{}'), coalesce(p_categories, '{}'), coalesce(p_is_active, false), p_cookie_expires_at
  )
  on conflict (campaign_id, platform) do update set
    api_key_enc = case when p_api_key is null then cp.api_key_enc when p_api_key = '' then null else encrypt_credential(p_api_key) end,
    api_secret_enc = case when p_api_secret is null then cp.api_secret_enc when p_api_secret = '' then null else encrypt_credential(p_api_secret) end,
    cookie_enc = case when p_cookie is null then cp.cookie_enc when p_cookie = '' then null else encrypt_credential(p_cookie) end,
    tag = coalesce(p_tag, cp.tag),
    keywords = coalesce(p_keywords, cp.keywords),
    categories = coalesce(p_categories, cp.categories),
    is_active = coalesce(p_is_active, cp.is_active),
    cookie_expires_at = coalesce(p_cookie_expires_at, cp.cookie_expires_at),
    updated_at = now();
end
$func$;

-- Lista plataformas SEM segredos (só flags has_*). Seguro pra mostrar no painel.
create or replace function public.get_platforms_masked(p_campaign_id uuid)
returns table (
  platform text,
  has_api_key boolean,
  has_api_secret boolean,
  has_cookie boolean,
  tag text,
  keywords text[],
  categories text[],
  is_active boolean,
  cookie_expires_at timestamptz
)
language sql
security definer
set search_path = public
as $func$
  select platform,
         api_key_enc is not null,
         api_secret_enc is not null,
         cookie_enc is not null,
         tag, keywords, categories, is_active, cookie_expires_at
  from public.campaign_platforms
  where campaign_id = p_campaign_id
$func$;

-- Retorna segredos DECRIPTOGRAFADOS (uso server-side: testar conexão / coletor).
create or replace function public.get_platform_secrets(p_campaign_id uuid, p_platform text)
returns table (api_key text, api_secret text, cookie text, tag text, keywords text[], categories text[], is_active boolean)
language sql
security definer
set search_path = public, vault, extensions
as $func$
  select
    case when api_key_enc is not null then decrypt_credential(api_key_enc) end,
    case when api_secret_enc is not null then decrypt_credential(api_secret_enc) end,
    case when cookie_enc is not null then decrypt_credential(cookie_enc) end,
    tag, keywords, categories, is_active
  from public.campaign_platforms
  where campaign_id = p_campaign_id and platform = p_platform
$func$;

-- Trava: essas RPCs só via service_role (as rotas do painel usam service role após checar auth)
revoke all on function public.save_platform_creds(uuid, text, text, text, text, text, text[], text[], boolean, timestamptz) from anon, authenticated;
revoke all on function public.get_platforms_masked(uuid) from anon, authenticated;
revoke all on function public.get_platform_secrets(uuid, text) from anon, authenticated;
