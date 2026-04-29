
-- 1) Corrige mapeamento atual
UPDATE public.crm_cobranca_situacao_mapping
SET status_id = (SELECT id FROM public.crm_cobranca_statuses WHERE key = '31_dias_de_atraso_ligao'),
    updated_at = now()
WHERE situacao = 'em_atraso';

UPDATE public.crm_cobranca_situacao_mapping
SET status_id = (SELECT id FROM public.crm_cobranca_statuses WHERE key = '61_negativao'),
    updated_at = now()
WHERE situacao = 'negativado_serasa';

UPDATE public.crm_cobranca_situacao_mapping
SET status_id = (SELECT id FROM public.crm_cobranca_statuses WHERE key = 'ajuizados_manual'),
    updated_at = now()
WHERE situacao IN ('ajuizado_saniely','ajuizado_navde');

-- 2) Função que reclassifica cards conforme mapeamento
CREATE OR REPLACE FUNCTION public.reclassify_cobrancas_by_situacao()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _updated integer := 0;
  _em_atraso uuid;
  _negativado uuid;
  _ajuizado_saniely uuid;
  _ajuizado_navde uuid;
BEGIN
  SELECT status_id INTO _em_atraso FROM public.crm_cobranca_situacao_mapping WHERE situacao = 'em_atraso';
  SELECT status_id INTO _negativado FROM public.crm_cobranca_situacao_mapping WHERE situacao = 'negativado_serasa';
  SELECT status_id INTO _ajuizado_saniely FROM public.crm_cobranca_situacao_mapping WHERE situacao = 'ajuizado_saniely';
  SELECT status_id INTO _ajuizado_navde FROM public.crm_cobranca_situacao_mapping WHERE situacao = 'ajuizado_navde';

  -- Ajuizado Saniely
  IF _ajuizado_saniely IS NOT NULL THEN
    UPDATE public.crm_cobrancas c
    SET status = (SELECT key FROM public.crm_cobranca_statuses WHERE id = _ajuizado_saniely),
        updated_at = now()
    WHERE lower(coalesce(c.data#>>'{ssotica_raw,situacao}','')) LIKE '%ajuizad%saniely%'
      AND c.status <> (SELECT key FROM public.crm_cobranca_statuses WHERE id = _ajuizado_saniely);
    GET DIAGNOSTICS _updated = ROW_COUNT;
  END IF;

  -- Ajuizado Návde
  IF _ajuizado_navde IS NOT NULL THEN
    UPDATE public.crm_cobrancas c
    SET status = (SELECT key FROM public.crm_cobranca_statuses WHERE id = _ajuizado_navde),
        updated_at = now()
    WHERE (lower(coalesce(c.data#>>'{ssotica_raw,situacao}','')) LIKE '%ajuizad%návde%'
        OR lower(coalesce(c.data#>>'{ssotica_raw,situacao}','')) LIKE '%ajuizad%navde%')
      AND c.status <> (SELECT key FROM public.crm_cobranca_statuses WHERE id = _ajuizado_navde);
  END IF;

  -- Negativado Serasa
  IF _negativado IS NOT NULL THEN
    UPDATE public.crm_cobrancas c
    SET status = (SELECT key FROM public.crm_cobranca_statuses WHERE id = _negativado),
        updated_at = now()
    WHERE lower(coalesce(c.data#>>'{ssotica_raw,situacao}','')) LIKE '%negativ%serasa%'
      AND c.status <> (SELECT key FROM public.crm_cobranca_statuses WHERE id = _negativado);
  END IF;

  -- Em atraso (apenas se não cair em outro caso mais específico)
  IF _em_atraso IS NOT NULL THEN
    UPDATE public.crm_cobrancas c
    SET status = (SELECT key FROM public.crm_cobranca_statuses WHERE id = _em_atraso),
        updated_at = now()
    WHERE lower(coalesce(c.data#>>'{ssotica_raw,situacao}','')) = 'em atraso'
      AND c.status <> (SELECT key FROM public.crm_cobranca_statuses WHERE id = _em_atraso);
  END IF;

  RETURN 1;
END;
$$;

-- 3) Trigger: ao alterar mapeamento, reclassifica
CREATE OR REPLACE FUNCTION public._trg_reclassify_on_mapping_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.reclassify_cobrancas_by_situacao();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reclassify_cobrancas ON public.crm_cobranca_situacao_mapping;
CREATE TRIGGER trg_reclassify_cobrancas
AFTER INSERT OR UPDATE ON public.crm_cobranca_situacao_mapping
FOR EACH STATEMENT
EXECUTE FUNCTION public._trg_reclassify_on_mapping_change();

-- 4) Reclassifica agora
SELECT public.reclassify_cobrancas_by_situacao();
