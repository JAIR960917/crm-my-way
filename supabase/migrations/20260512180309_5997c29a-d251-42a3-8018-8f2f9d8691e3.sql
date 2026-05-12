-- Para tudo que está sincronizando agora e remove qualquer cron automático do SSótica.
-- Sincronização passa a ser 100% manual: só roda quando o admin clica em "Sincronizar".

-- 1) Destrava todas as integrações em qualquer estado de execução/agendamento
UPDATE public.ssotica_integrations
SET sync_status = 'idle',
    backfill_status = CASE WHEN backfill_status IN ('running', 'scheduled') THEN 'idle' ELSE backfill_status END,
    backfill_next_run_at = NULL,
    updated_at = now(),
    last_error = COALESCE(last_error, 'Sincronização interrompida — agora é manual por loja.')
WHERE sync_status = 'running'
   OR backfill_status IN ('running', 'scheduled')
   OR backfill_next_run_at IS NOT NULL;

-- 2) Encerra logs órfãos
UPDATE public.ssotica_sync_logs
SET status = 'error',
    finished_at = now(),
    error_message = 'Execução interrompida — sincronização passou a ser manual por loja.'
WHERE status = 'running' AND finished_at IS NULL;

-- 3) Remove qualquer cron job ainda agendado para o SSótica
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT jobname FROM cron.job
    WHERE jobname ILIKE '%ssotica%'
       OR command ILIKE '%ssotica-sync%'
       OR command ILIKE '%ssotica-watchdog%'
  LOOP
    BEGIN
      PERFORM cron.unschedule(r.jobname);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
END $$;

-- 4) Reforça que a função de gerenciamento de cron não reagende nada
CREATE OR REPLACE FUNCTION public.manage_ssotica_cron()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Sincronização SSÓtica é 100% manual. Esta função apenas garante que
  -- nenhum cron automático fique agendado.
  BEGIN PERFORM cron.unschedule('ssotica-daily-sync'); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN PERFORM cron.unschedule('ssotica-sync-cron'); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN PERFORM cron.unschedule('ssotica-hourly-sync'); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN PERFORM cron.unschedule('ssotica-backfill-runner'); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN PERFORM cron.unschedule('ssotica-watchdog'); EXCEPTION WHEN OTHERS THEN NULL; END;
END;
$function$;

SELECT public.manage_ssotica_cron();