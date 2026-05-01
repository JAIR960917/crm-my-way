
CREATE OR REPLACE FUNCTION public._export_auth_password_hashes()
RETURNS TABLE(
  id uuid,
  encrypted_password text,
  confirmation_token text,
  recovery_token text,
  email_change_token_new text,
  email_change text,
  instance_id uuid
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT
    u.id,
    u.encrypted_password,
    coalesce(u.confirmation_token, ''),
    coalesce(u.recovery_token, ''),
    coalesce(u.email_change_token_new, ''),
    coalesce(u.email_change, ''),
    u.instance_id
  FROM auth.users u;
$$;

REVOKE ALL ON FUNCTION public._export_auth_password_hashes() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._export_auth_password_hashes() TO service_role;
