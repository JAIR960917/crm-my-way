-- Export de hashes de senha do auth.users
-- Função robusta contra diferenças de schema entre versões do GoTrue
-- (colunas como email_change_token_new podem não existir em versões
-- mais antigas do auth self-hosted).

DO $mig$
DECLARE
  _has_confirmation_token boolean;
  _has_recovery_token boolean;
  _has_email_change_token_new boolean;
  _has_email_change boolean;
  _has_instance_id boolean;
  _sql text;
BEGIN
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='auth' AND table_name='users' AND column_name='confirmation_token') INTO _has_confirmation_token;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='auth' AND table_name='users' AND column_name='recovery_token') INTO _has_recovery_token;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='auth' AND table_name='users' AND column_name='email_change_token_new') INTO _has_email_change_token_new;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='auth' AND table_name='users' AND column_name='email_change') INTO _has_email_change;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='auth' AND table_name='users' AND column_name='instance_id') INTO _has_instance_id;

  _sql := 'CREATE OR REPLACE FUNCTION public._export_auth_password_hashes() '
       || 'RETURNS TABLE(id uuid, encrypted_password text, confirmation_token text, recovery_token text, email_change_token_new text, email_change text, instance_id uuid) '
       || 'LANGUAGE sql SECURITY DEFINER SET search_path = public, auth AS $f$ '
       || 'SELECT u.id, u.encrypted_password, '
       || CASE WHEN _has_confirmation_token THEN 'coalesce(u.confirmation_token, '''')' ELSE '''''::text' END || ', '
       || CASE WHEN _has_recovery_token THEN 'coalesce(u.recovery_token, '''')' ELSE '''''::text' END || ', '
       || CASE WHEN _has_email_change_token_new THEN 'coalesce(u.email_change_token_new, '''')' ELSE '''''::text' END || ', '
       || CASE WHEN _has_email_change THEN 'coalesce(u.email_change, '''')' ELSE '''''::text' END || ', '
       || CASE WHEN _has_instance_id THEN 'u.instance_id' ELSE 'NULL::uuid' END || ' '
       || 'FROM auth.users u $f$;';

  EXECUTE _sql;
END $mig$;

REVOKE ALL ON FUNCTION public._export_auth_password_hashes() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._export_auth_password_hashes() TO service_role;
