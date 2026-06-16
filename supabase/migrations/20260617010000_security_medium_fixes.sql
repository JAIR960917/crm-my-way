-- ==========================================================
-- Correções de segurança médias
-- ==========================================================

-- -------------------------------------------------------
-- 1. crm_module_transition_logs: impedir forja de logs automáticos
--    Usuários autenticados só podem inserir logs manuais atribuídos
--    a si mesmos. Logs automáticos (trigger_source != 'manual') devem
--    vir exclusivamente via service_role (edge functions), que bypassa RLS.
-- -------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated can insert module transition logs"
  ON public.crm_module_transition_logs;

CREATE POLICY "Authenticated can insert module transition logs"
  ON public.crm_module_transition_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    triggered_by = auth.uid()
    AND trigger_source = 'manual'
  );

-- -------------------------------------------------------
-- 2. company_eye_exam_day_specialists: filtrar por empresa do usuário
--    Vendedor/gerente de uma loja não deve ver a escala de exames de
--    vista de outras lojas da rede.
-- -------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated can read eye exam day specialists"
  ON public.company_eye_exam_day_specialists;

CREATE POLICY "Staff read own company eye exam day specialists"
  ON public.company_eye_exam_day_specialists
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1
      FROM public.company_eye_exam_days d
      WHERE d.id = company_eye_exam_day_specialists.eye_exam_day_id
        AND public.is_my_company(d.company_id)
    )
  );
