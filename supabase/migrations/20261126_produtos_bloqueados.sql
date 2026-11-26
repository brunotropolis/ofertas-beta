-- Lista de produtos que o robô NÃO posta (26/Nov/2026, Bruno: "consegue fazer no sistema uma blacklist para que possa
-- adicionar caso encontre outros itens?"). Vale pra grupos, canais e o envio final do dispatcher.
-- termo e excecao comparados sem acento e sem maiúscula, como pedaço do título. excecao aceita várias separadas por "|".
-- perfil_id nulo = vale pra todos os perfis.
create table if not exists public.produtos_bloqueados (
  id uuid primary key default gen_random_uuid(),
  termo text not null check (length(trim(termo)) >= 3),
  excecao text,
  perfil_id uuid references public.perfis(id) on delete cascade,
  motivo text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  criado_por uuid default auth.uid()
);
create index if not exists produtos_bloqueados_ativo on public.produtos_bloqueados (ativo);
alter table public.produtos_bloqueados enable row level security;
drop policy if exists produtos_bloqueados_operador on public.produtos_bloqueados;
create policy produtos_bloqueados_operador on public.produtos_bloqueados for all to authenticated
  using (public.is_operator()) with check (public.is_operator());
revoke all on public.produtos_bloqueados from anon;

-- itens do Bruno (26/11) no perfil Ofertas Maternas
insert into public.produtos_bloqueados (termo, excecao, perfil_id, motivo)
select v.termo, v.excecao, p.id, v.motivo
from (values
  ('kit berço', null, 'kit berço'),
  ('kit de berço', null, 'kit berço'),
  ('travesseiro', 'amamenta', 'travesseiro de berço / antirrefluxo'),
  ('almofada', 'amamenta|bebe conforto|assento|cadeir|carrinho|banho', 'almofada de berço'),
  ('complemento alimentar', null, 'complemento alimentar'),
  ('bico de silicone', null, 'bico de silicone'),
  ('protetor de mamilo', null, 'protetor de mamilo'),
  ('protetor para mamilo', null, 'protetor de mamilo'),
  ('protetor mamilo', null, 'protetor de mamilo'),
  ('concha', null, 'concha para seios'),
  ('protetor de grade', 'tela|respir', 'protetor de grade (só tela respirável pode)'),
  ('protetor para grade', 'tela|respir', 'protetor de grade (só tela respirável pode)'),
  ('protetor de berço', 'tela|respir', 'protetor de grade (só tela respirável pode)'),
  ('protetor para berço', 'tela|respir', 'protetor de grade (só tela respirável pode)'),
  ('protetor berço', 'tela|respir', 'protetor de grade (só tela respirável pode)'),
  ('pelúcia', null, 'bichinho de pelúcia'),
  ('pelucia', null, 'bichinho de pelúcia')
) as v(termo, excecao, motivo)
cross join public.perfis p where p.slug = 'ofertas-maternas'
and not exists (select 1 from public.produtos_bloqueados b where b.termo = v.termo and b.perfil_id = p.id);
