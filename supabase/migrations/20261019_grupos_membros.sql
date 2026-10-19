-- =====================================================
-- Membros dos grupos — 19/Out/2026
-- Contagem de pessoas por grupo + quem entrou/saiu por dia, pro card "Grupos" do Início.
-- Alimentado por POST /api/cron/grupos (n8n, de hora em hora 8h-20h + 23h), que lê os
-- participantes pela WAHA do perfil e compara com o último retrato.
--
-- Telefone NÃO é gravado: membro_hash = HMAC-SHA256(telefone, CRON_SECRET) cortado em 24 hex.
-- Sem o segredo não dá pra voltar ao número (nem por força bruta na faixa de telefones BR).
--
-- RLS: leitura só admin/operator (is_operator()); escrita só service_role (rota do cron).
-- Desfazer: 20261019_grupos_membros.undo.sql
-- =====================================================

BEGIN;

-- Retrato atual: quem está em cada grupo (hash)
CREATE TABLE IF NOT EXISTS public.grupos_membros (
  group_jid    text        NOT NULL,
  membro_hash  text        NOT NULL,
  visto_em     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_jid, membro_hash)
);

-- Por grupo por dia (BRT): tamanho no último retrato do dia + entradas/saídas somadas no dia
CREATE TABLE IF NOT EXISTS public.grupos_diario (
  dia           date        NOT NULL,
  group_jid     text        NOT NULL,
  perfil_id     uuid,
  group_name    text,
  membros       integer     NOT NULL DEFAULT 0,
  entraram      integer     NOT NULL DEFAULT 0,
  sairam        integer     NOT NULL DEFAULT 0,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (dia, group_jid)
);
CREATE INDEX IF NOT EXISTS grupos_diario_perfil_dia_idx ON public.grupos_diario (perfil_id, dia);

-- Resumo do perfil por dia: grupos, vagas (soma), pessoas únicas, entradas/saídas
CREATE TABLE IF NOT EXISTS public.grupos_resumo_diario (
  dia            date        NOT NULL,
  perfil_id      uuid        NOT NULL,
  grupos         integer     NOT NULL DEFAULT 0,
  vagas          integer     NOT NULL DEFAULT 0,
  pessoas_unicas integer     NOT NULL DEFAULT 0,
  entraram       integer     NOT NULL DEFAULT 0,
  sairam         integer     NOT NULL DEFAULT 0,
  atualizado_em  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (dia, perfil_id)
);

ALTER TABLE public.grupos_membros       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grupos_diario        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grupos_resumo_diario ENABLE ROW LEVEL SECURITY;

-- grupos_membros: nenhuma policy → só service_role lê/escreve (o painel não precisa dos hashes)
DROP POLICY IF EXISTS grupos_diario_select ON public.grupos_diario;
CREATE POLICY grupos_diario_select ON public.grupos_diario
  FOR SELECT USING (public.is_operator());

DROP POLICY IF EXISTS grupos_resumo_diario_select ON public.grupos_resumo_diario;
CREATE POLICY grupos_resumo_diario_select ON public.grupos_resumo_diario
  FOR SELECT USING (public.is_operator());

COMMIT;
