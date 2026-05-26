-- Permitir admins reagendarem o cron de envio WhatsApp via RPC
GRANT EXECUTE ON FUNCTION public.manage_whatsapp_cron() TO authenticated;

-- Trigger automático: sempre que whatsapp_cron_interval mudar, reagenda o cron
CREATE OR REPLACE FUNCTION public.trg_reschedule_whatsapp_cron()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.setting_key = 'whatsapp_cron_interval'
     AND (TG_OP = 'INSERT' OR NEW.setting_value IS DISTINCT FROM OLD.setting_value) THEN
    PERFORM public.manage_whatsapp_cron();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reschedule_whatsapp_cron_on_change ON public.system_settings;
CREATE TRIGGER reschedule_whatsapp_cron_on_change
AFTER INSERT OR UPDATE ON public.system_settings
FOR EACH ROW
EXECUTE FUNCTION public.trg_reschedule_whatsapp_cron();

-- Reagenda agora com o valor atual
SELECT public.manage_whatsapp_cron();