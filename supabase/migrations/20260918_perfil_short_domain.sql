-- Domínio do encurtador por PERFIL (a marca que aparece no link curto da Amazon).
-- Null = usa o padrão manualdorecemnascido.com.br. O worker utm-redirector é o mesmo
-- (KV global de slugs), então basta a zona ter a rota /l/* apontando pro worker.
alter table public.perfis add column if not exists short_domain text;
