-- A sincronização automática do SSótica (horários configuráveis) precisa de um
-- cron que dispare o backfill_tick a cada minuto. manage_ssotica_cron() havia
-- sido reescrita como NO-OP (migration 20260511151210) e nunca foi religada
-- quando a configuração de horários foi introduzida — por isso os horários
-- configurados na UI nunca disparavam o ciclo automaticamente.

CREATE OR REPLACE FUNCTION public.manage_ssotica_cron()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _cron_expression text := '* * * * *';
  _job_command text;
  _base_url text;
  _service_key text;
  _cron_secret text;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Apenas administradores podem gerenciar o cron do SSótica';
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
    RAISE NOTICE 'backend_public_url, backend_service_role_key ou backend_cron_secret ausentes; cron ssotica não agendado';
    RETURN;
  END IF;

  BEGIN PERFORM cron.unschedule('ssotica-daily-sync'); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN PERFORM cron.unschedule('ssotica-sync-cron'); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN PERFORM cron.unschedule('ssotica-hourly-sync'); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN PERFORM cron.unschedule('ssotica-backfill-runner'); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN PERFORM cron.unschedule('ssotica-watchdog'); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN PERFORM cron.unschedule('ssotica-auto-sync-tick'); EXCEPTION WHEN OTHERS THEN NULL; END;

  _job_command := format(
    'SELECT net.http_post(url := %L, headers := %L::jsonb, body := %L::jsonb)',
    _base_url || '/functions/v1/ssotica-sync',
    json_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _service_key,
      'x-cron-secret', _cron_secret
    )::text,
    json_build_object('mode', 'backfill_tick')::text
  );

  PERFORM cron.schedule('ssotica-auto-sync-tick', _cron_expression, _job_command);
END;
$function$;

REVOKE ALL ON FUNCTION public.manage_ssotica_cron() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manage_ssotica_cron() TO authenticated;
GRANT EXECUTE ON FUNCTION public.manage_ssotica_cron() TO service_role;

-- Ativa o cron agora (auth.uid() é NULL durante a migration, então passa pelo
-- bloqueio de admin). Se os secrets de backend ainda não estiverem
-- configurados, a função apenas faz RAISE NOTICE e não agenda nada.
SELECT public.manage_ssotica_cron();
