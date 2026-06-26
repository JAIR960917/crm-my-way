-- Leads que já vieram da Campanha Copa (origem_campanha = 'copa') ficaram
-- com a "Forma de captação" vazia, porque submit-campanha-copa e
-- campanha-copa-send-to-leads não preenchiam esse campo dinâmico. Toda
-- inscrição da campanha é divulgação por anúncio pago, então preenche
-- "Tráfego Pago" pra quem ainda está sem nada nesse campo.
DO $$
DECLARE
  v_field_id uuid;
  v_key text;
BEGIN
  SELECT id INTO v_field_id
  FROM public.crm_form_fields
  WHERE label ILIKE '%forma de capta%'
  LIMIT 1;

  IF v_field_id IS NULL THEN
    RAISE NOTICE 'Campo "Forma de captação" não encontrado — nada a fazer.';
    RETURN;
  END IF;

  v_key := 'field_' || v_field_id::text;

  UPDATE public.crm_leads
  SET data = jsonb_set(data, ARRAY[v_key], to_jsonb('Tráfego Pago'::text))
  WHERE data->>'origem_campanha' = 'copa'
    AND (data->>v_key IS NULL OR trim(data->>v_key) = '');
END;
$$;
