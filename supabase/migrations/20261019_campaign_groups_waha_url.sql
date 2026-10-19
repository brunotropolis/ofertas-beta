-- Divisão fixa dos grupos entre os números (19/Out): cada grupo sai sempre pelo mesmo servidor WAHA.
-- null = qualquer servidor saudável (revezamento antigo). Se o servidor do grupo estiver fora, o dispatcher usa outro.
alter table public.campaign_groups add column if not exists waha_url text;
