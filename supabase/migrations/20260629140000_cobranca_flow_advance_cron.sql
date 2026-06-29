-- A edge function cobranca-flow-advance (gatilho + avanço automático de
-- coluna na tela de Cobranças) existe desde sempre, mas nunca foi agendada
-- via pg_cron nem é chamada de nenhum outro lugar — por isso cards com
-- gatilho/tratativa já vencidos (ex.: "Avança em 0 dia(s)") nunca avançavam
-- de coluna sozinhos. Agenda nos mesmos moldes de manage_whatsapp_cron /
-- manage_ssotica_cron.
CREATE OR REPLACE FUNCTION public.manage_cobranca_flow_cron()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _cron_expression text := '*/10 * * * *';
  _job_command text;
  _base_url text;
  _service_key text;
  _cron_secret text;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Apenas administradores podem gerenciar o cron de cobrança';
  END IF;

  _base_url := COALESCE(
    NULLIF(current_setting('app.settings.supabase_url', true), ''),
    (SELECT setting_value FROM public.system_settings WHERE setting_key = 'backend_public_url' LIMIT 1)
  );
  _service_key := COALESCE(
    NULLIF(current_setting('app.settings.supabase_service_role_key', true), ''),
    (SELECT setting_value FROM public.system_settings WHERE setting_key = 'backend_service_role_key' LIMIT 1)
  );
  _cron_secret := (
    SELECT setting_value FROM public.system_settings WHERE setting_key = 'backend_cron_secret' LIMIT 1
  );

  IF _base_url IS NULL OR _service_key IS NULL OR _cron_secret IS NULL THEN
    RAISE NOTICE 'backend_public_url, backend_service_role_key ou backend_cron_secret ausentes; cron cobranca-flow-advance não agendado';
    RETURN;
  END IF;

  BEGIN PERFORM cron.unschedule('cobranca-flow-advance-cron'); EXCEPTION WHEN OTHERS THEN NULL; END;

  _job_command := format(
    'SELECT net.http_post(url := %L, headers := %L::jsonb, body := ''{}''::jsonb)',
    _base_url || '/functions/v1/cobranca-flow-advance',
    json_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _service_key,
      'x-cron-secret', _cron_secret
    )::text
  );

  PERFORM cron.schedule('cobranca-flow-advance-cron', _cron_expression, _job_command);
END;
$function$;

REVOKE ALL ON FUNCTION public.manage_cobranca_flow_cron() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manage_cobranca_flow_cron() TO authenticated;
GRANT EXECUTE ON FUNCTION public.manage_cobranca_flow_cron() TO service_role;

-- Ativa agora (auth.uid() é NULL durante a migration, passa pelo bloqueio de
-- admin). Se os secrets de backend ainda não estiverem configurados, a
-- função só faz RAISE NOTICE e não agenda nada.
SELECT public.manage_cobranca_flow_cron();
