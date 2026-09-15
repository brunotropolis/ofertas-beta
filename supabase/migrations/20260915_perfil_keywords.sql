-- Palavras-chave de produto do nicho, no nível do PERFIL (compartilhadas por
-- todas as plataformas/campanhas do perfil). Os coletores leem daqui.
alter table public.perfis add column if not exists keywords text[] not null default '{}';
