-- Ao excluir/retornar agendamento, limpa snapshots de reagendamento e scheduled_date do lead.

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

-- Snapshots órfãos (agendamento principal já retornado/excluído) não devem ocultar o lead no Kanban.
UPDATE public.crm_appointments snap
SET
  deleted_at = COALESCE(main.deleted_at, main.returned_at, now()),
  deleted_by = COALESCE(main.deleted_by, main.returned_by),
  returned_at = COALESCE(main.returned_at, main.deleted_at, now()),
  returned_by = COALESCE(main.returned_by, main.deleted_by),
  updated_at = now()
FROM public.crm_appointments main
WHERE snap.snapshot_of_appointment_id = main.id
  AND COALESCE(snap.is_reschedule_snapshot, false) = true
  AND snap.deleted_at IS NULL
  AND (main.deleted_at IS NOT NULL OR main.returned_at IS NOT NULL);
