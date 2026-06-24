-- Relatório Campanha Copa: permite saber quantas inscrições (por telefone)
-- já existem como card na tela de Leads, igual já é feito para Renovação.
--
-- crm_leads não tem uma coluna fixa de telefone (o campo é dinâmico, criado
-- pelo formulário — ver crm_form_fields.is_phone_field), então varremos
-- data->>'telefone' (campo padrão) e qualquer chave "field_%" (campos
-- customizados), normalizando cada valor com normalize_br_mobile_digits
-- (mesma normalização já usada no relatório para telefone de Renovação).
CREATE OR REPLACE FUNCTION public.campanha_copa_lookup_leads(p_phones text[] DEFAULT '{}')
RETURNS TABLE (phone_digits text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '30s'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Sem permissão (apenas administradores)';
  END IF;

  IF coalesce(array_length(p_phones, 1), 0) = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT DISTINCT d.phone
  FROM public.crm_leads l
  CROSS JOIN LATERAL (
    SELECT public.normalize_br_mobile_digits(v.value) AS phone
    FROM (
      SELECT l.data->>'telefone' AS value
      UNION ALL
      SELECT kv.value FROM jsonb_each_text(l.data) kv WHERE kv.key LIKE 'field_%'
    ) v
    WHERE v.value IS NOT NULL AND v.value <> ''
  ) d
  WHERE coalesce(l.status, '') <> 'excluidos'
    AND length(d.phone) >= 10
    AND d.phone = ANY(p_phones);
END;
$$;

COMMENT ON FUNCTION public.campanha_copa_lookup_leads(text[]) IS
  'Retorna quais telefones (normalizados) de uma lista já existem como card na tela de Leads (relatório Campanha Copa).';

REVOKE ALL ON FUNCTION public.campanha_copa_lookup_leads(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.campanha_copa_lookup_leads(text[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
