-- Desfaz o lote 2 de campeões (29/Out, Tio Patinhas item 1): volta as 16 ofertas pra campeao=false.
update public.offers set campeao = false where id in (
  '9fce9a51-55f8-48a8-9bba-d43bfed842ee',
  'aca73254-6517-413a-943c-fdb5f82f93da',
  '301608f0-e914-4f99-a8fc-5808e09057c4',
  '0463f0e3-fd60-44d9-ac47-560886e42402',
  'dcaaa3ec-ce17-4cdf-9ae2-05a4a5af20ae',
  '487da97a-fa17-4626-a9ca-b20439d19244',
  '4c8dc10d-4213-48ea-ad4f-547767110ab7',
  '28f44426-7b73-44d2-b825-1390c3859427',
  'ec8d4676-dfd5-47ed-803f-ca46c9a422c8',
  '0b4e429f-466f-482e-bec9-13b9e29d67e7',
  '7b2e8675-e395-4be6-8a5e-012881951852',
  'd160414a-2940-4a2c-a7e2-7b54580e824d',
  'cf45e1b7-7c57-42e4-9713-e8933644348a',
  '2be6cfa5-64a2-4895-b502-79c55c15169b',
  '7065efcf-470a-44f7-9849-1a65997c17ba',
  '5e5dbb63-b184-4cb0-87cd-1499c5d2c51d'
);
