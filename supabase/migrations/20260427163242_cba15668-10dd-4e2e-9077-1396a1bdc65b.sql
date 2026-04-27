
-- ============================================================
-- Fortalecimento de RLS para crm_renovacoes e crm_cobrancas
-- Vendedores só veem registros atribuídos a eles ou criados por eles.
-- Admin / Gerente / Financeiro continuam com visão ampla.
-- Isso também restringe os eventos Realtime (postgres_changes)
-- para que vendedores não recebam eventos de registros alheios.
-- ============================================================

-- ---------- crm_renovacoes ----------
DROP POLICY IF EXISTS "Users can view renovacoes from same company" ON public.crm_renovacoes;

CREATE POLICY "Users can view renovacoes scoped"
ON public.crm_renovacoes
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'gerente'::app_role)
  OR assigned_to = auth.uid()
  OR created_by = auth.uid()
);

-- ---------- crm_cobrancas ----------
DROP POLICY IF EXISTS "Users can view cobrancas" ON public.crm_cobrancas;

CREATE POLICY "Users can view cobrancas scoped"
ON public.crm_cobrancas
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'financeiro'::app_role)
  OR has_role(auth.uid(), 'gerente'::app_role)
  OR assigned_to = auth.uid()
  OR created_by = auth.uid()
);

-- ---------- Notes correlatas (também no realtime) ----------
-- Garante que notas só apareçam para quem pode ver a renovação/cobrança pai.

-- crm_renovacao_notes
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies
           WHERE schemaname='public' AND tablename='crm_renovacao_notes' AND cmd='SELECT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.crm_renovacao_notes', r.policyname);
  END LOOP;
END$$;

CREATE POLICY "View renovacao notes scoped"
ON public.crm_renovacao_notes
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.crm_renovacoes r
    WHERE r.id = crm_renovacao_notes.renovacao_id
      AND (
        has_role(auth.uid(), 'admin'::app_role)
        OR has_role(auth.uid(), 'gerente'::app_role)
        OR r.assigned_to = auth.uid()
        OR r.created_by = auth.uid()
      )
  )
);

-- crm_cobranca_notes
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies
           WHERE schemaname='public' AND tablename='crm_cobranca_notes' AND cmd='SELECT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.crm_cobranca_notes', r.policyname);
  END LOOP;
END$$;

CREATE POLICY "View cobranca notes scoped"
ON public.crm_cobranca_notes
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.crm_cobrancas c
    WHERE c.id = crm_cobranca_notes.cobranca_id
      AND (
        has_role(auth.uid(), 'admin'::app_role)
        OR has_role(auth.uid(), 'financeiro'::app_role)
        OR has_role(auth.uid(), 'gerente'::app_role)
        OR c.assigned_to = auth.uid()
        OR c.created_by = auth.uid()
      )
  )
);
