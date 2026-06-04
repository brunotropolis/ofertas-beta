-- =====================================================
-- ENCRYPT CREDENTIALS — 04-Jun-2026
-- Aplicar via Supabase Dashboard > SQL Editor
--
-- Resolve: campaign_platforms armazenava api_key/api_secret/cookie em texto plano.
-- Se Supabase DB vazasse, todas as credenciais Amazon/Shopee/ML vazariam junto.
--
-- Estratégia:
-- 1. Habilita pgcrypto
-- 2. Cria chave de criptografia em vault.secrets (Supabase Vault — managed pelo Supabase)
-- 3. Adiciona colunas *_enc (bytea) lado a lado com as antigas
-- 4. Cria funções RPC encrypt_credential() e decrypt_credential()
-- 5. Dropa colunas antigas em texto plano (tabela vazia, sem dados a migrar)
--
-- Como usar no backend:
-- - INSERT: SELECT encrypt_credential('valor') AS enc; → guarda enc em api_key_enc
-- - SELECT: SELECT decrypt_credential(api_key_enc) FROM campaign_platforms (só service_role)
-- =====================================================

BEGIN;

-- 1. pgcrypto pra funções criptográficas
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Guardar chave em vault.secrets (mantido encriptado pelo próprio Supabase)
-- Idempotente: se já existir secret 'credential_encryption_key', não recria.
DO $$
DECLARE
  v_secret_id uuid;
BEGIN
  SELECT id INTO v_secret_id FROM vault.secrets WHERE name = 'credential_encryption_key';
  IF v_secret_id IS NULL THEN
    -- gen_random_bytes retorna bytea; encode pra hex e usa como secret string
    PERFORM vault.create_secret(
      encode(gen_random_bytes(32), 'hex'),
      'credential_encryption_key',
      'Chave de criptografia simétrica pras credentials de campaign_platforms'
    );
  END IF;
END $$;

-- 3. Função encrypt_credential — chamada pelo backend ao inserir/atualizar
CREATE OR REPLACE FUNCTION public.encrypt_credential(plaintext text)
RETURNS bytea
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_key text;
BEGIN
  IF plaintext IS NULL OR plaintext = '' THEN
    RETURN NULL;
  END IF;
  SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets WHERE name = 'credential_encryption_key';
  IF v_key IS NULL THEN
    RAISE EXCEPTION 'credential_encryption_key não encontrada em vault.secrets';
  END IF;
  RETURN pgp_sym_encrypt(plaintext, v_key);
END;
$$;

-- 4. Função decrypt_credential — RESTRITA. Só admin pode descriptografar.
CREATE OR REPLACE FUNCTION public.decrypt_credential(ciphertext bytea)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_key text;
BEGIN
  IF ciphertext IS NULL THEN
    RETURN NULL;
  END IF;
  -- Só admin (ou service_role bypass) pode descriptografar.
  IF NOT public.is_admin() AND auth.role() != 'service_role' THEN
    RAISE EXCEPTION 'Permissão negada: apenas admin pode descriptografar credenciais';
  END IF;
  SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets WHERE name = 'credential_encryption_key';
  RETURN pgp_sym_decrypt(ciphertext, v_key);
END;
$$;

-- Bloquear execução pra anon (só authenticated com role admin OU service_role)
REVOKE EXECUTE ON FUNCTION public.encrypt_credential(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.decrypt_credential(bytea) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.encrypt_credential(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.decrypt_credential(bytea) TO authenticated, service_role;

-- 5. Adicionar colunas *_enc na campaign_platforms (bytea)
ALTER TABLE public.campaign_platforms
  ADD COLUMN IF NOT EXISTS api_key_enc bytea,
  ADD COLUMN IF NOT EXISTS api_secret_enc bytea,
  ADD COLUMN IF NOT EXISTS cookie_enc bytea;

-- 6. Como tabela está VAZIA hoje (count=0), dropar as antigas em texto plano sem migrar
-- Se um dia tiver dados, mudar este passo pra UPDATE migrate + drop
ALTER TABLE public.campaign_platforms
  DROP COLUMN IF EXISTS api_key,
  DROP COLUMN IF EXISTS api_secret,
  DROP COLUMN IF EXISTS cookie;

COMMIT;
