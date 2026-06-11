-- Admin exclui agendamento de forma definitiva; soft_delete restaura lead na coluna original.

CREATE OR REPLACE FUNCTION public.hard_delete_crm_appointment(p_appointment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  appt public.crm_appointments%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Apenas administradores podem excluir definitivamente';
  END IF;

  SELECT * INTO appt
  FROM public.crm_appointments
  WHERE id = p_appointment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agendamento não encontrado';
  END IF;

  IF appt.lead_id IS NOT NULL THEN
    UPDATE public.crm_leads
    SET
      status = COALESCE(NULLIF(appt.previous_status, ''), 'novo'),
      scheduled_date = NULL,
      updated_at = v_now
    WHERE id = appt.lead_id;
  END IF;

  IF appt.renovacao_id IS NOT NULL THEN
    UPDATE public.crm_renovacoes
    SET
      status = COALESCE(NULLIF(appt.previous_status, ''), 'novo'),
      scheduled_date = NULL,
      updated_at = v_now
    WHERE id = appt.renovacao_id;
  END IF;

  DELETE FROM public.crm_appointments
  WHERE id = p_appointment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.hard_delete_crm_appointment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hard_delete_crm_appointment(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.soft_delete_crm_appointment(p_appointment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  appt public.crm_appointments%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT * INTO appt
  FROM public.crm_appointments
  WHERE id = p_appointment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agendamento não encontrado';
  END IF;

  IF NOT public.can_manage_crm_appointment(p_appointment_id) THEN
    RAISE EXCEPTION 'Sem permissão para excluir este agendamento';
  END IF;

  IF appt.lead_id IS NOT NULL THEN
    UPDATE public.crm_leads
    SET
      status = COALESCE(NULLIF(appt.previous_status, ''), 'novo'),
      scheduled_date = NULL,
      updated_at = v_now
    WHERE id = appt.lead_id;
  END IF;

  IF appt.renovacao_id IS NOT NULL THEN
    UPDATE public.crm_renovacoes
    SET
      status = COALESCE(NULLIF(appt.previous_status, ''), 'novo'),
      scheduled_date = NULL,
      updated_at = v_now
    WHERE id = appt.renovacao_id;
  END IF;

  UPDATE public.crm_appointments
  SET
    deleted_at = v_now,
    deleted_by = auth.uid(),
    updated_at = v_now
  WHERE id = p_appointment_id;

  UPDATE public.crm_appointments
  SET
    deleted_at = v_now,
    deleted_by = auth.uid(),
    returned_at = v_now,
    returned_by = auth.uid(),
    updated_at = v_now
  WHERE snapshot_of_appointment_id = p_appointment_id
    AND COALESCE(is_reschedule_snapshot, false) = true
    AND deleted_at IS NULL;
END;
$$;
