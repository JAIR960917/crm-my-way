-- S8: Restringe gerente de cobranças ao escopo da loja (paridade com crm_renovacoes).
-- Financeiro mantém visão/edição global (regra de negócio da área financeira central).

CREATE OR REPLACE FUNCTION public.user_cobranca_gerente_scoped(
  p_assigned_to uuid,
  p_created_by uuid,
  p_company_id uuid,
  p_ssotica_company_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    has_role(auth.uid(), 'gerente'::app_role)
    AND (
      (p_assigned_to IS NOT NULL AND p_assigned_to IN (SELECT public.get_company_user_ids()))
      OR (p_created_by IS NOT NULL AND p_created_by IN (SELECT public.get_company_user_ids()))
      OR (p_company_id IS NOT NULL AND public.is_my_company(p_company_id))
      OR (p_ssotica_company_id IS NOT NULL AND public.is_my_company(p_ssotica_company_id))
    );
$$;

CREATE OR REPLACE FUNCTION public.user_can_view_cobranca(
  p_assigned_to uuid,
  p_created_by uuid,
  p_company_id uuid,
  p_ssotica_company_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN false
    WHEN has_role(auth.uid(), 'admin'::app_role) THEN true
    WHEN has_role(auth.uid(), 'financeiro'::app_role) THEN true
    WHEN public.user_is_cobranca_inbox_user() THEN true
    WHEN p_assigned_to = auth.uid() THEN true
    WHEN p_created_by = auth.uid() THEN true
    WHEN public.user_cobranca_gerente_scoped(
      p_assigned_to, p_created_by, p_company_id, p_ssotica_company_id
    ) THEN true
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.user_can_modify_cobranca(
  p_assigned_to uuid,
  p_created_by uuid,
  p_company_id uuid,
  p_ssotica_company_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN false
    WHEN has_role(auth.uid(), 'admin'::app_role) THEN true
    WHEN has_role(auth.uid(), 'financeiro'::app_role) THEN true
    WHEN public.user_is_cobranca_inbox_user() THEN true
    WHEN p_assigned_to = auth.uid() THEN true
    WHEN p_created_by = auth.uid() THEN true
    WHEN public.user_cobranca_gerente_scoped(
      p_assigned_to, p_created_by, p_company_id, p_ssotica_company_id
    ) THEN true
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.user_can_view_cobranca_by_id(p_cobranca_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.crm_cobrancas c
    WHERE c.id = p_cobranca_id
      AND public.user_can_view_cobranca(
        c.assigned_to,
        c.created_by,
        c.company_id,
        c.ssotica_company_id
      )
  );
$$;

-- ---------- crm_cobrancas ----------
DROP POLICY IF EXISTS "Users can view cobrancas scoped" ON public.crm_cobrancas;

CREATE POLICY "Users can view cobrancas scoped"
ON public.crm_cobrancas
FOR SELECT
TO authenticated
USING (
  public.user_can_view_cobranca(assigned_to, created_by, company_id, ssotica_company_id)
);

DROP POLICY IF EXISTS "Users can update cobrancas" ON public.crm_cobrancas;

CREATE POLICY "Users can update cobrancas"
ON public.crm_cobrancas
FOR UPDATE
TO authenticated
USING (
  public.user_can_modify_cobranca(assigned_to, created_by, company_id, ssotica_company_id)
)
WITH CHECK (
  public.user_can_modify_cobranca(assigned_to, created_by, company_id, ssotica_company_id)
);

DROP POLICY IF EXISTS "Admins can delete cobrancas" ON public.crm_cobrancas;

CREATE POLICY "Users can delete cobrancas scoped"
ON public.crm_cobrancas
FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'financeiro'::app_role)
  OR public.user_cobranca_gerente_scoped(assigned_to, created_by, company_id, ssotica_company_id)
);

-- ---------- crm_cobranca_notes ----------
DROP POLICY IF EXISTS "View cobranca notes scoped" ON public.crm_cobranca_notes;
DROP POLICY IF EXISTS "View notes of accessible cobrancas" ON public.crm_cobranca_notes;
DROP POLICY IF EXISTS "Insert notes on accessible cobrancas" ON public.crm_cobranca_notes;

CREATE POLICY "View cobranca notes scoped"
ON public.crm_cobranca_notes
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR user_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.crm_cobrancas c
    WHERE c.id = crm_cobranca_notes.cobranca_id
      AND public.user_can_view_cobranca(
        c.assigned_to, c.created_by, c.company_id, c.ssotica_company_id
      )
  )
);

CREATE POLICY "Insert notes on accessible cobrancas"
ON public.crm_cobranca_notes
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1
    FROM public.crm_cobrancas c
    WHERE c.id = crm_cobranca_notes.cobranca_id
      AND public.user_can_modify_cobranca(
        c.assigned_to, c.created_by, c.company_id, c.ssotica_company_id
      )
  )
);

-- ---------- cobranca_activities ----------
DROP POLICY IF EXISTS "View activities of accessible cobrancas" ON public.cobranca_activities;
DROP POLICY IF EXISTS "Insert activities on accessible cobrancas" ON public.cobranca_activities;

CREATE POLICY "View activities of accessible cobrancas"
ON public.cobranca_activities
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.crm_cobrancas c
    WHERE c.id = cobranca_activities.cobranca_id
      AND public.user_can_view_cobranca(
        c.assigned_to, c.created_by, c.company_id, c.ssotica_company_id
      )
  )
);

CREATE POLICY "Insert activities on accessible cobrancas"
ON public.cobranca_activities
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = created_by
  AND EXISTS (
    SELECT 1
    FROM public.crm_cobrancas c
    WHERE c.id = cobranca_activities.cobranca_id
      AND public.user_can_modify_cobranca(
        c.assigned_to, c.created_by, c.company_id, c.ssotica_company_id
      )
  )
);

-- ---------- crm_cobranca_flow_events ----------
DROP POLICY IF EXISTS "View cobranca flow events scoped" ON public.crm_cobranca_flow_events;
DROP POLICY IF EXISTS "Insert flow events on accessible cobrancas" ON public.crm_cobranca_flow_events;

CREATE POLICY "View cobranca flow events scoped"
ON public.crm_cobranca_flow_events
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.crm_cobrancas c
    WHERE c.id = crm_cobranca_flow_events.cobranca_id
      AND public.user_can_view_cobranca(
        c.assigned_to, c.created_by, c.company_id, c.ssotica_company_id
      )
  )
);

CREATE POLICY "Insert flow events on accessible cobrancas"
ON public.crm_cobranca_flow_events
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.crm_cobrancas c
    WHERE c.id = crm_cobranca_flow_events.cobranca_id
      AND public.user_can_modify_cobranca(
        c.assigned_to, c.created_by, c.company_id, c.ssotica_company_id
      )
  )
);

COMMENT ON FUNCTION public.user_cobranca_gerente_scoped(uuid, uuid, uuid, uuid) IS
  'Gerente só acessa cobranças da própria loja/equipe (paridade com crm_renovacoes).';

COMMENT ON FUNCTION public.user_can_view_cobranca(uuid, uuid, uuid, uuid) IS
  'SELECT em crm_cobrancas: admin/financeiro/inbox global; gerente por loja; vendedor só atribuídos.';

COMMENT ON FUNCTION public.user_can_modify_cobranca(uuid, uuid, uuid, uuid) IS
  'UPDATE/INSERT correlatos: mesmas regras de escopo que user_can_view_cobranca.';

GRANT EXECUTE ON FUNCTION public.user_cobranca_gerente_scoped(uuid, uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_view_cobranca(uuid, uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_modify_cobranca(uuid, uuid, uuid, uuid) TO authenticated;
