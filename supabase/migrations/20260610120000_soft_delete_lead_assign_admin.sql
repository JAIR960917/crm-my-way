-- Ao excluir lead, reatribui para um admin e desvincula do usuário que excluiu.

CREATE OR REPLACE FUNCTION public.pick_admin_assignee(p_exclude_user_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT ur.user_id
  FROM public.user_roles ur
  WHERE ur.role = 'admin'::app_role
    AND (p_exclude_user_id IS NULL OR ur.user_id <> p_exclude_user_id)
  ORDER BY ur.user_id
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.soft_delete_lead(_lead_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _lead public.crm_leads%ROWTYPE;
  _admin_id uuid;
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

  _admin_id := public.pick_admin_assignee(auth.uid());
  IF _admin_id IS NULL THEN
    _admin_id := public.pick_admin_assignee(NULL);
  END IF;

  IF _admin_id IS NULL THEN
    RAISE EXCEPTION 'Nenhum administrador disponível para receber o lead excluído';
  END IF;

  UPDATE public.crm_leads
  SET status = 'excluidos',
      previous_status_before_exclude = _lead.status,
      previous_assigned_before_exclude = _lead.assigned_to,
      assigned_to = _admin_id,
      excluded_at = now(),
      excluded_by = auth.uid()
  WHERE id = _lead_id;
END;
$$;

REVOKE ALL ON FUNCTION public.pick_admin_assignee(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pick_admin_assignee(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.soft_delete_lead(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.soft_delete_lead(uuid) TO authenticated;
