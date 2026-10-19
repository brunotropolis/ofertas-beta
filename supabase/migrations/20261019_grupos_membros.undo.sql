-- Desfaz 20261019_grupos_membros.sql
BEGIN;
DROP TABLE IF EXISTS public.grupos_resumo_diario;
DROP TABLE IF EXISTS public.grupos_diario;
DROP TABLE IF EXISTS public.grupos_membros;
COMMIT;
