-- Reagendamento: snapshot na data original (admin) + rastreio da data original
ALTER TABLE public.crm_appointments
  ADD COLUMN IF NOT EXISTS original_scheduled_datetime timestamptz,
  ADD COLUMN IF NOT EXISTS rescheduled_from_datetime timestamptz,
  ADD COLUMN IF NOT EXISTS rescheduled_to_datetime timestamptz,
  ADD COLUMN IF NOT EXISTS is_reschedule_snapshot boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS snapshot_of_appointment_id uuid REFERENCES public.crm_appointments(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_crm_appointments_snapshot
  ON public.crm_appointments (snapshot_of_appointment_id)
  WHERE is_reschedule_snapshot = true;

CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_appointments_one_snapshot_per_appt
  ON public.crm_appointments (snapshot_of_appointment_id)
  WHERE is_reschedule_snapshot = true AND snapshot_of_appointment_id IS NOT NULL;

-- Snapshots só visíveis para administradores
DROP POLICY IF EXISTS "Users can view company appointments" ON public.crm_appointments;
CREATE POLICY "Users can view company appointments"
ON public.crm_appointments FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    COALESCE(is_reschedule_snapshot, false) = false
    AND (
      scheduled_by = auth.uid()
      OR is_same_company(scheduled_by)
    )
  )
);

-- Gerente pode inserir snapshot ao reagendar agendamento da equipe
DROP POLICY IF EXISTS "Gerentes can manage company appointments" ON public.crm_appointments;
CREATE POLICY "Gerentes can manage company appointments"
ON public.crm_appointments FOR ALL TO authenticated
USING (has_role(auth.uid(), 'gerente'::app_role) AND is_same_company(scheduled_by))
WITH CHECK (
  has_role(auth.uid(), 'gerente'::app_role)
  AND (
    auth.uid() = scheduled_by
    OR (
      COALESCE(is_reschedule_snapshot, false) = true
      AND is_same_company(scheduled_by)
    )
  )
);
