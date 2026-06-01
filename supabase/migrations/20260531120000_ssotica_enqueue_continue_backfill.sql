-- Propaga continue_backfill no dispatch pg_net do backfill SSótica.

DROP FUNCTION IF EXISTS public.ssotica_enqueue_sync(text, text, uuid, boolean);

CREATE OR REPLACE FUNCTION public.ssotica_enqueue_sync(
  _url text,
  _auth text,
  _integration_id uuid,
  _force_full boolean DEFAULT false,
  _continue_backfill boolean DEFAULT false
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _req_id bigint;
BEGIN
  SELECT net.http_post(
    url := _url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', _auth
    ),
    body := jsonb_build_object(
      'mode', 'incremental',
      'integration_id', _integration_id,
      'force_full', _force_full,
      'continue_backfill', _continue_backfill
    ),
    timeout_milliseconds := 600000
  ) INTO _req_id;
  RETURN _req_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ssotica_enqueue_sync(text, text, uuid, boolean, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ssotica_enqueue_sync(text, text, uuid, boolean, boolean) TO service_role;
