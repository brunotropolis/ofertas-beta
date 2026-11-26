-- Regras de produto por campanha, editáveis no painel (26/Nov/2026, Bruno: "quero a segunda opção, mas quero por campanha").
-- O auto-enqueue lê daqui as categorias com cota/teto, palavras, marcas boas e filtros (antes ficavam no código).
-- A tabela campaigns já tem RLS (operador/dono edita); a coluna herda as mesmas regras.
alter table public.campaigns add column if not exists regras jsonb;
comment on column public.campaigns.regras is 'Regras de produto da campanha (categorias com cota/teto, palavras, marcas boas, filtros). Editável na aba Regras do painel. Nulo = sem regra extra.';
