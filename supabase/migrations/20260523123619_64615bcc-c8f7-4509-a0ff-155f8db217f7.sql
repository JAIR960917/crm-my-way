DROP POLICY IF EXISTS "Creators can update own leads" ON public.crm_leads;
CREATE POLICY "Creators can update own leads"
ON public.crm_leads
FOR UPDATE
TO authenticated
USING (
  created_by = auth.uid()
  AND status <> 'excluidos'
)
WITH CHECK (
  created_by = auth.uid()
  OR status = 'excluidos'
);

DROP POLICY IF EXISTS "Vendedores can update assigned leads" ON public.crm_leads;
CREATE POLICY "Vendedores can update assigned leads"
ON public.crm_leads
FOR UPDATE
TO authenticated
USING (
  assigned_to = auth.uid()
  AND status <> 'excluidos'
)
WITH CHECK (
  assigned_to = auth.uid()
  OR status = 'excluidos'
);

DROP POLICY IF EXISTS "Gerentes can update company leads" ON public.crm_leads;
CREATE POLICY "Gerentes can update company leads"
ON public.crm_leads
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'gerente'::app_role)
  AND status <> 'excluidos'
  AND (is_same_company(assigned_to) OR is_same_company(created_by))
)
WITH CHECK (
  (
    has_role(auth.uid(), 'gerente'::app_role)
    AND ((assigned_to IS NULL) OR is_same_company(assigned_to))
  )
  OR status = 'excluidos'
);

DROP POLICY IF EXISTS "Users can update renovacoes" ON public.crm_renovacoes;
CREATE POLICY "Users can update renovacoes"
ON public.crm_renovacoes
FOR UPDATE
TO authenticated
USING (
  status <> 'excluidos'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR assigned_to = auth.uid()
    OR created_by = auth.uid()
    OR (
      has_role(auth.uid(), 'gerente'::app_role)
      AND (
        assigned_to IN (SELECT get_company_user_ids())
        OR created_by IN (SELECT get_company_user_ids())
        OR (ssotica_company_id IS NOT NULL AND is_my_company(ssotica_company_id))
      )
    )
  )
)
WITH CHECK (
  (
    has_role(auth.uid(), 'admin'::app_role)
    OR assigned_to = auth.uid()
    OR created_by = auth.uid()
    OR (
      has_role(auth.uid(), 'gerente'::app_role)
      AND (
        assigned_to IN (SELECT get_company_user_ids())
        OR created_by IN (SELECT get_company_user_ids())
        OR (ssotica_company_id IS NOT NULL AND is_my_company(ssotica_company_id))
      )
    )
  )
  OR status = 'excluidos'
);