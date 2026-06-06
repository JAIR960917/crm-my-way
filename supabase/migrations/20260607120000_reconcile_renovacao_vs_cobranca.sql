-- Remove cards de Renovação quando o mesmo cliente já tem cobrança em aberto.
-- Complementa a reconciliação por ssotica_cliente_id com match por telefone/CPF.

CREATE OR REPLACE FUNCTION public.reconcile_renovacao_vs_cobranca(p_company_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ren record;
  cob_id uuid;
  cob_status text;
  removed_count integer := 0;
  ren_phone text;
  ren_cpf text;
  cliente_nome text;
BEGIN
  FOR ren IN
    SELECT r.id, r.ssotica_cliente_id, r.ssotica_company_id, r.data, r.status
    FROM public.crm_renovacoes r
    WHERE coalesce(r.status, '') <> 'excluidos'
      AND (p_company_id IS NULL OR r.ssotica_company_id = p_company_id)
  LOOP
    ren_phone := public.cobranca_data_phone_digits(ren.data);
    ren_cpf := regexp_replace(coalesce(ren.data->>'documento', ren.data->>'cpf', ''), '\D', '', 'g');
    cob_id := NULL;
    cob_status := NULL;

    SELECT c.id, c.status
    INTO cob_id, cob_status
    FROM public.crm_cobrancas c
    WHERE coalesce(c.status, '') NOT IN ('pago', 'cancelado')
      AND (
        p_company_id IS NULL
        OR c.ssotica_company_id = p_company_id
        OR c.company_id = p_company_id
      )
      AND (
        (
          ren.ssotica_cliente_id IS NOT NULL
          AND c.ssotica_cliente_id = ren.ssotica_cliente_id
        )
        OR (
          length(ren_phone) >= 10
          AND public.cobranca_matches_inbox_phone(c.data, ren_phone)
        )
        OR (
          length(ren_cpf) >= 11
          AND length(regexp_replace(coalesce(c.data->>'documento', c.data->>'cpf', ''), '\D', '', 'g')) >= 11
          AND regexp_replace(coalesce(c.data->>'documento', c.data->>'cpf', ''), '\D', '', 'g') = ren_cpf
        )
      )
    ORDER BY c.updated_at DESC
    LIMIT 1;

    IF cob_id IS NULL THEN
      CONTINUE;
    END IF;

    cliente_nome := coalesce(nullif(trim(ren.data->>'nome'), ''), 'Cliente');

    DELETE FROM public.crm_renovacoes WHERE id = ren.id;

    INSERT INTO public.crm_module_transition_logs (
      cliente_nome,
      from_module,
      to_module,
      to_status_key,
      to_status_label,
      source_record_id,
      target_record_id,
      ssotica_cliente_id,
      company_id,
      triggered_by,
      trigger_source
    ) VALUES (
      cliente_nome,
      'renovacao',
      'none',
      NULL,
      NULL,
      ren.id,
      NULL,
      ren.ssotica_cliente_id,
      coalesce(ren.ssotica_company_id, p_company_id),
      auth.uid(),
      'auto_reconcile'
    );

    INSERT INTO public.crm_module_transition_logs (
      cliente_nome,
      from_module,
      to_module,
      to_status_key,
      to_status_label,
      source_record_id,
      target_record_id,
      ssotica_cliente_id,
      company_id,
      triggered_by,
      trigger_source
    ) VALUES (
      cliente_nome,
      'renovacao',
      'cobranca',
      cob_status,
      NULL,
      ren.id,
      cob_id,
      ren.ssotica_cliente_id,
      coalesce(ren.ssotica_company_id, p_company_id),
      auth.uid(),
      'auto_reconcile'
    );

    removed_count := removed_count + 1;
  END LOOP;

  RETURN removed_count;
END;
$$;

COMMENT ON FUNCTION public.reconcile_renovacao_vs_cobranca(uuid) IS
  'Remove renovações duplicadas quando o cliente tem cobrança em aberto (match por SSótica, telefone ou CPF).';

REVOKE ALL ON FUNCTION public.reconcile_renovacao_vs_cobranca(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconcile_renovacao_vs_cobranca(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_renovacao_vs_cobranca(uuid) TO service_role;
