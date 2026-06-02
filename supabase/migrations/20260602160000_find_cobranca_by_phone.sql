-- Busca card de cobrança pelo telefone (dígitos nacionais, sem +55)

CREATE OR REPLACE FUNCTION public.normalize_br_phone_digits(p_raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN length(d) >= 12 AND left(d, 2) = '55' THEN substring(d from 3)
    ELSE d
  END
  FROM (
    SELECT regexp_replace(coalesce(p_raw, ''), '\D', '', 'g') AS d
  ) s;
$$;

CREATE OR REPLACE FUNCTION public.cobranca_data_phone_digits(p_data jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT public.normalize_br_phone_digits(
    coalesce(
      nullif(trim(p_data->>'telefone'), ''),
      nullif(trim(p_data->>'celular'), ''),
      nullif(trim(p_data->>'whatsapp'), ''),
      nullif(trim(p_data->>'telefone_principal'), ''),
      ''
    )
  );
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
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_digits text;
  v_last8 text;
BEGIN
  v_digits := public.normalize_br_phone_digits(p_phone);
  IF length(v_digits) < 8 THEN
    RETURN;
  END IF;
  v_last8 := right(v_digits, 8);

  RETURN QUERY
  SELECT c.id, c.data, c.status, c.valor, c.company_id
  FROM public.crm_cobrancas c
  WHERE length(public.cobranca_data_phone_digits(c.data)) >= 8
    AND right(public.cobranca_data_phone_digits(c.data), 8) = v_last8
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'financeiro'::app_role)
      OR has_role(auth.uid(), 'gerente'::app_role)
      OR c.assigned_to = auth.uid()
      OR c.created_by = auth.uid()
      OR public.is_same_company(c.assigned_to)
      OR public.is_same_company(c.created_by)
    )
  ORDER BY c.updated_at DESC
  LIMIT 1;
END;
$$;

COMMENT ON FUNCTION public.find_cobranca_by_phone(text) IS
  'Localiza card de cobrança pelo telefone (WhatsApp/inbox), comparando só dígitos nacionais.';

GRANT EXECUTE ON FUNCTION public.find_cobranca_by_phone(text) TO authenticated;
