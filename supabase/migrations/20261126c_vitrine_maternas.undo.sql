-- desfaz 20261126c_vitrine_maternas.sql (a página promoções do dia para de carregar)
drop function if exists public.vitrine_maternas(int);
alter table public.publication_queue drop column if exists links_postados;
