-- S1: credenciais de backend não podem ser lidas por usuários autenticados (apenas service_role / SECURITY DEFINER).

DROP POLICY IF EXISTS "Authenticated users can view settings" ON public.system_settings;

CREATE POLICY "Authenticated users can view non-sensitive settings"
  ON public.system_settings
  FOR SELECT
  TO authenticated
  USING (
    setting_key NOT IN (
      'backend_service_role_key',
      'backend_cron_secret',
      'backend_anon_key'
    )
  );

-- service_role e funções SECURITY DEFINER continuam lendo via bypass RLS / owner.
