-- Agendamentos: soft delete, histórico, rastreio de consulta paga
ALTER TABLE public.crm_appointments
  ADD COLUMN IF NOT EXISTS consulta_paga_em timestamptz,
  ADD COLUMN IF NOT EXISTS consulta_paga_por uuid,
  ADD COLUMN IF NOT EXISTS consulta_paga_no_agendamento boolean,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid;

CREATE TABLE IF NOT EXISTS public.crm_appointment_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  appointment_id uuid NOT NULL REFERENCES public.crm_appointments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  action text NOT NULL,
  summary text NOT NULL DEFAULT '',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_appointment_history_appt
  ON public.crm_appointment_history(appointment_id, created_at DESC);

ALTER TABLE public.crm_appointment_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access on appointment_history"
ON public.crm_appointment_history FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Staff can insert appointment history"
ON public.crm_appointment_history FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Staff can view history of accessible appointments"
ON public.crm_appointment_history FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.crm_appointments a
    WHERE a.id = crm_appointment_history.appointment_id
    AND (
      a.scheduled_by = auth.uid()
      OR (has_role(auth.uid(), 'gerente'::app_role) AND is_same_company(a.scheduled_by))
    )
  )
);
