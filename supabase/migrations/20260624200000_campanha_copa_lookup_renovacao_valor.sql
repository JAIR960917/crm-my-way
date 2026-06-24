-- Expõe o valor da última venda (crm_renovacoes.valor) no lookup usado pelo
-- relatório Campanha Copa, para calcular Faturamento na seção "Geral".
-- crm_renovacoes.valor já é o valor da venda mais recente do cliente (ver
-- ssotica-sync) — mesma venda que data_ultima_venda/data_ultima_compra
-- referenciam, então é o valor certo quando converteu_apos_campanha é true.
DROP FUNCTION IF EXISTS public.campanha_copa_lookup_renovacoes(text[], text[]);

CREATE FUNCTION public.campanha_copa_lookup_renovacoes(
  p_cpfs text[] DEFAULT '{}',
  p_phones text[] DEFAULT '{}'
)
RETURNS TABLE (
  id uuid,
  status text,
  data_ultima_compra date,
  data_ultima_venda date,
  valor numeric,
  ssotica_company_id uuid,
  cpf_digits text,
  phone_digits text,
  updated_at timestamptz,
  created_at timestamptz
)
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

  RETURN QUERY
  SELECT
    r.id,
    r.status,
    r.data_ultima_compra,
    CASE
      WHEN (r.data->>'data_ultima_venda') ~ '^\d{4}-\d{2}-\d{2}$'
      THEN (r.data->>'data_ultima_venda')::date
      ELSE NULL
    END AS data_ultima_venda,
    r.valor,
    r.ssotica_company_id,
    public.campanha_copa_renovacao_cpf_digits(r.data) AS cpf_digits,
    public.normalize_br_mobile_digits(public.cobranca_data_phone_digits(r.data)) AS phone_digits,
    r.updated_at,
    r.created_at
  FROM public.crm_renovacoes r
  WHERE coalesce(r.status, '') <> 'excluidos'
    AND r.ssotica_company_id IS NOT NULL
    AND (
      (
        coalesce(array_length(p_cpfs, 1), 0) > 0
        AND length(public.campanha_copa_renovacao_cpf_digits(r.data)) >= 11
        AND public.campanha_copa_renovacao_cpf_digits(r.data) = ANY(p_cpfs)
      )
      OR (
        coalesce(array_length(p_phones, 1), 0) > 0
        AND length(public.normalize_br_mobile_digits(public.cobranca_data_phone_digits(r.data))) >= 10
        AND public.normalize_br_mobile_digits(public.cobranca_data_phone_digits(r.data)) = ANY(p_phones)
      )
    );
END;
$$;

COMMENT ON FUNCTION public.campanha_copa_lookup_renovacoes(text[], text[]) IS
  'Busca renovações ativas por listas de CPF/telefone normalizados, incluindo valor da última venda (relatório Campanha Copa).';

REVOKE ALL ON FUNCTION public.campanha_copa_lookup_renovacoes(text[], text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.campanha_copa_lookup_renovacoes(text[], text[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
