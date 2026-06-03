-- S9–S11: criptografia SSótica sem fallback na escrita; cron lê segredos de GUC; limpa secrets do system_settings.

CREATE OR REPLACE FUNCTION public._get_encryption_key()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _secret text;
BEGIN
  _secret := NULLIF(trim(current_setting('app.settings.jwt_secret', true)), '');
  IF _secret IS NULL THEN
    RAISE EXCEPTION
      'app.settings.jwt_secret não configurado — impossível criptografar tokens SSótica com segurança';
  END IF;
  RETURN encode(
    extensions.digest('ssotica_token_key_' || _secret, 'sha256'),
    'hex'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public._get_legacy_encryption_key()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT encode(
    extensions.digest('ssotica_token_key_fallback_salt', 'sha256'),
    'hex'
  );
$$;

CREATE OR REPLACE FUNCTION public.decrypt_secret(_ciphertext text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _secret text;
  _key text;
  _legacy text;
  _payload bytea;
  _plain text;
BEGIN
  IF _ciphertext IS NULL OR _ciphertext = '' THEN RETURN _ciphertext; END IF;
  IF _ciphertext NOT LIKE 'enc:%' THEN RETURN _ciphertext; END IF;
  _payload := decode(substring(_ciphertext FROM 5), 'base64');
  _secret := NULLIF(trim(current_setting('app.settings.jwt_secret', true)), '');
  IF _secret IS NOT NULL THEN
    _key := encode(extensions.digest('ssotica_token_key_' || _secret, 'sha256'), 'hex');
    BEGIN
      _plain := convert_from(extensions.decrypt(_payload, _key::bytea, 'aes'), 'UTF8');
      RETURN _plain;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;
  _legacy := public._get_legacy_encryption_key();
  RETURN convert_from(extensions.decrypt(_payload, _legacy::bytea, 'aes'), 'UTF8');
END;
$$;

REVOKE EXECUTE ON FUNCTION public._get_legacy_encryption_key() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.manage_whatsapp_cron()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _interval_minutes int;
  _cron_expression text;
  _job_command text;
  _base_url text;
  _service_key text;
  _cron_secret text;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Apenas administradores podem gerenciar o cron de WhatsApp';
  END IF;

  _base_url := COALESCE(
    NULLIF(current_setting('app.settings.supabase_url', true), ''),
    (SELECT setting_value FROM public.system_settings WHERE setting_key = 'backend_public_url' LIMIT 1)
  );
  _service_key := NULLIF(current_setting('app.settings.supabase_service_role_key', true), '');
  _cron_secret := NULLIF(current_setting('app.settings.cron_secret', true), '');

  IF _base_url IS NULL OR _service_key IS NULL OR _cron_secret IS NULL THEN
    RAISE NOTICE 'backend_public_url, app.settings.supabase_service_role_key ou app.settings.cron_secret ausentes; cron whatsapp não agendado';
    RETURN;
  END IF;

  SELECT COALESCE(setting_value, '5')::int INTO _interval_minutes
  FROM public.system_settings
  WHERE setting_key = 'whatsapp_cron_interval';

  IF _interval_minutes IS NULL OR _interval_minutes < 1 THEN
    _interval_minutes := 5;
  END IF;

  _cron_expression := '*/' || _interval_minutes || ' * * * *';

  BEGIN PERFORM cron.unschedule('whatsapp-send-cron'); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN PERFORM cron.unschedule('send-whatsapp-campaigns'); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN PERFORM cron.unschedule('send-whatsapp-messages'); EXCEPTION WHEN OTHERS THEN NULL; END;

  _job_command := format(
    'SELECT net.http_post(url := %L, headers := %L::jsonb, body := ''{}''::jsonb)',
    _base_url || '/functions/v1/send-whatsapp',
    json_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _service_key,
      'x-cron-secret', _cron_secret
    )::text
  );

  PERFORM cron.schedule('whatsapp-send-cron', _cron_expression, _job_command);
END;
$function$;

DELETE FROM public.system_settings
WHERE setting_key IN ('backend_service_role_key', 'backend_cron_secret');

COMMENT ON FUNCTION public._get_encryption_key() IS
  'Deriva chave AES dos tokens SSótica a partir de app.settings.jwt_secret (sem fallback).';
