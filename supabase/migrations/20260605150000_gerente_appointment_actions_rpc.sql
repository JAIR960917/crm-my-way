-- Gerente: marcar consulta paga, excluir e editar campos de agendamentos da equipe.

CREATE OR REPLACE FUNCTION public.set_crm_appointment_consulta_paga(
  p_appointment_id uuid,
  p_paga boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  appt public.crm_appointments%ROWTYPE;
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
    RAISE EXCEPTION 'Sem permissão para alterar este agendamento';
  END IF;

  IF appt.consulta_paga IS TRUE
     AND p_paga IS DISTINCT FROM TRUE
     AND NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Somente administradores podem alterar consulta paga após marcada';
  END IF;

  IF p_paga IS TRUE THEN
    UPDATE public.crm_appointments
    SET
      consulta_paga = true,
      consulta_paga_em = now(),
      consulta_paga_por = auth.uid(),
      updated_at = now()
    WHERE id = p_appointment_id;
  ELSE
    UPDATE public.crm_appointments
    SET
      consulta_paga = false,
      consulta_paga_em = NULL,
      consulta_paga_por = NULL,
      updated_at = now()
    WHERE id = p_appointment_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_crm_appointment_consulta_paga(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_crm_appointment_consulta_paga(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.soft_delete_crm_appointment(p_appointment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  appt public.crm_appointments%ROWTYPE;
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
    SET status = appt.previous_status
    WHERE id = appt.lead_id;
  END IF;

  UPDATE public.crm_appointments
  SET
    deleted_at = now(),
    deleted_by = auth.uid(),
    updated_at = now()
  WHERE id = p_appointment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.soft_delete_crm_appointment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.soft_delete_crm_appointment(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_crm_appointment_field(
  p_appointment_id uuid,
  p_field text,
  p_value text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF p_field NOT IN ('confirmacao', 'comparecimento', 'venda', 'resumo') THEN
    RAISE EXCEPTION 'Campo não permitido';
  END IF;

  IF NOT public.can_manage_crm_appointment(p_appointment_id) THEN
    RAISE EXCEPTION 'Sem permissão para alterar este agendamento';
  END IF;

  UPDATE public.crm_appointments
  SET
    confirmacao = CASE WHEN p_field = 'confirmacao' THEN p_value ELSE confirmacao END,
    comparecimento = CASE WHEN p_field = 'comparecimento' THEN p_value ELSE comparecimento END,
    venda = CASE WHEN p_field = 'venda' THEN p_value ELSE venda END,
    resumo = CASE WHEN p_field = 'resumo' THEN p_value ELSE resumo END,
    updated_at = now()
  WHERE id = p_appointment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_crm_appointment_field(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_crm_appointment_field(uuid, text, text) TO authenticated;

-- Garante policy de UPDATE para gerente (idempotente).
DROP POLICY IF EXISTS "Gerentes can manage company appointments" ON public.crm_appointments;

DROP POLICY IF EXISTS "Gerentes can update company appointments" ON public.crm_appointments;
CREATE POLICY "Gerentes can update company appointments"
ON public.crm_appointments FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'gerente'::app_role) AND is_same_company(scheduled_by))
WITH CHECK (has_role(auth.uid(), 'gerente'::app_role) AND is_same_company(scheduled_by));
