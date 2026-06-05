-- Gerente precisa poder reagendar agendamentos dos vendedores da equipe.
-- O WITH CHECK anterior exigia auth.uid() = scheduled_by no registro principal.

DROP POLICY IF EXISTS "Gerentes can update company appointments" ON public.crm_appointments;

CREATE POLICY "Gerentes can update company appointments"
ON public.crm_appointments FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'gerente'::app_role) AND is_same_company(scheduled_by))
WITH CHECK (has_role(auth.uid(), 'gerente'::app_role) AND is_same_company(scheduled_by));
