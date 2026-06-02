-- Inbox cobrança: match EXATO de telefone (sem falso positivo por últimos 8 dígitos)

CREATE OR REPLACE FUNCTION public.cobranca_matches_inbox_phone(p_data jsonb, p_phone text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  target text;
  kv record;
  d text;
BEGIN
  target := public.normalize_br_mobile_digits(p_phone);
  IF length(target) < 10 THEN
    RETURN false;
  END IF;

  d := public.normalize_br_mobile_digits(public.cobranca_data_phone_digits(p_data));
  IF length(d) >= 10 AND d = target THEN
    RETURN true;
  END IF;

  FOR kv IN SELECT key, value FROM jsonb_each_text(coalesce(p_data, '{}'::jsonb)) LOOP
    IF kv.value IS NULL OR kv.value !~ '\d{10,}' THEN
      CONTINUE;
    END IF;
    d := public.normalize_br_mobile_digits(kv.value);
    IF length(d) >= 10 AND d = target THEN
      RETURN true;
    END IF;
  END LOOP;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.find_cobrancas_by_phone(
  p_phone text,
  p_contact_name text DEFAULT NULL,
  p_prefer_card_id uuid DEFAULT NULL,
  p_name_hint text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  data jsonb,
  status text,
  valor numeric,
  company_id uuid,
  match_score integer
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_digits text;
BEGIN
  v_digits := public.normalize_br_mobile_digits(p_phone);
  IF length(v_digits) < 10 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.data,
    c.status,
    c.valor,
    c.company_id,
    (
      CASE WHEN p_prefer_card_id IS NOT NULL AND c.id = p_prefer_card_id THEN 1000 ELSE 0 END
      + CASE WHEN public.cobranca_matches_inbox_phone(c.data, v_digits) THEN 300 ELSE 0 END
      + CASE WHEN p_name_hint IS NOT NULL AND public.cobranca_name_matches_hint(c.data, p_name_hint) THEN 200 ELSE 0 END
      + CASE
          WHEN p_name_hint IS NULL
            AND p_contact_name IS NOT NULL
            AND public.cobranca_name_matches_hint(c.data, p_contact_name)
          THEN 50
          ELSE 0
        END
      + CASE WHEN nullif(trim(c.data->>'gatilho_enviado_em'), '') IS NOT NULL THEN 25 ELSE 0 END
    )::integer AS match_score
  FROM public.crm_cobrancas c
  WHERE public.cobranca_matches_inbox_phone(c.data, v_digits)
  ORDER BY
    match_score DESC,
    nullif(trim(c.data->>'gatilho_enviado_em'), '')::timestamptz DESC NULLS LAST,
    c.updated_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.find_cobranca_by_phone(p_phone text)
RETURNS TABLE (
  id uuid,
  data jsonb,
  status text,
  valor numeric,
  company_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT r.id, r.data, r.status, r.valor, r.company_id
  FROM public.find_cobrancas_by_phone(p_phone) r
  LIMIT 1;
END;
$$;

COMMENT ON FUNCTION public.cobranca_matches_inbox_phone(jsonb, text) IS
  'Inbox: telefone nacional exato (sem +55), sem match por últimos 8 dígitos.';

GRANT EXECUTE ON FUNCTION public.cobranca_matches_inbox_phone(jsonb, text) TO authenticated;
