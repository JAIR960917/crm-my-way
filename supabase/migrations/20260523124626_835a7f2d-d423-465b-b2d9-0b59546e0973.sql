CREATE OR REPLACE FUNCTION public.soft_delete_lead(_lead_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _lead public.crm_leads%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT * INTO _lead
  FROM public.crm_leads
  WHERE id = _lead_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead não encontrado';
  END IF;

  IF _lead.status = 'excluidos' THEN
    RETURN;
  END IF;

  IF NOT (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR _lead.assigned_to = auth.uid()
    OR _lead.created_by = auth.uid()
    OR (
      public.has_role(auth.uid(), 'gerente'::app_role)
      AND (
        public.is_same_company(_lead.assigned_to)
        OR public.is_same_company(_lead.created_by)
      )
    )
  ) THEN
    RAISE EXCEPTION 'Sem permissão para excluir este lead';
  END IF;

  UPDATE public.crm_leads
  SET status = 'excluidos',
      previous_status_before_exclude = _lead.status,
      previous_assigned_before_exclude = _lead.assigned_to,
      excluded_at = now(),
      excluded_by = auth.uid()
  WHERE id = _lead_id;
END;
$$;

REVOKE ALL ON FUNCTION public.soft_delete_lead(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.soft_delete_lead(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.soft_delete_renovacao(_renovacao_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _renovacao public.crm_renovacoes%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT * INTO _renovacao
  FROM public.crm_renovacoes
  WHERE id = _renovacao_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Renovação não encontrada';
  END IF;

  IF _renovacao.status = 'excluidos' THEN
    RETURN;
  END IF;

  IF NOT (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR _renovacao.assigned_to = auth.uid()
    OR _renovacao.created_by = auth.uid()
    OR (
      public.has_role(auth.uid(), 'gerente'::app_role)
      AND (
        _renovacao.assigned_to IN (SELECT public.get_company_user_ids())
        OR _renovacao.created_by IN (SELECT public.get_company_user_ids())
        OR (_renovacao.ssotica_company_id IS NOT NULL AND public.is_my_company(_renovacao.ssotica_company_id))
      )
    )
  ) THEN
    RAISE EXCEPTION 'Sem permissão para excluir esta renovação';
  END IF;

  UPDATE public.crm_renovacoes
  SET status = 'excluidos',
      previous_status_before_exclude = _renovacao.status,
      previous_assigned_before_exclude = _renovacao.assigned_to,
      excluded_at = now(),
      excluded_by = auth.uid()
  WHERE id = _renovacao_id;
END;
$$;

REVOKE ALL ON FUNCTION public.soft_delete_renovacao(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.soft_delete_renovacao(uuid) TO authenticated;