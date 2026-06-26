-- ============================================================
-- Coluna "Participando da campanha atual": leads do jogo ATUAL da Campanha
-- Copa entram aqui (em vez de cair direto em "Campanha Copa", que passa a
-- representar os leads de jogos anteriores). Quando o admin troca o time
-- do proximo jogo (system_settings.campanha_copa_jogo_config), os leads que
-- estavam em "participando" voltam automaticamente para "Campanha Copa".
-- ============================================================

INSERT INTO public.crm_statuses (key, label, color, position, is_system_excluded)
SELECT
  'participando_campanha_atual',
  'Participando da campanha atual',
  '#16a34a',
  (SELECT COALESCE(MIN(position), 0) - 1 FROM public.crm_statuses),
  false
WHERE NOT EXISTS (
  SELECT 1 FROM public.crm_statuses WHERE key = 'participando_campanha_atual'
);

CREATE OR REPLACE FUNCTION public.campanha_copa_reset_participando_on_jogo_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.setting_key <> 'campanha_copa_jogo_config' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.setting_value IS NOT DISTINCT FROM OLD.setting_value THEN
    RETURN NEW;
  END IF;

  UPDATE public.crm_leads
  SET status = 'campanha_copa'
  WHERE status = 'participando_campanha_atual';

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_campanha_copa_reset_participando ON public.system_settings;

CREATE TRIGGER trg_campanha_copa_reset_participando
  AFTER INSERT OR UPDATE ON public.system_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.campanha_copa_reset_participando_on_jogo_change();
