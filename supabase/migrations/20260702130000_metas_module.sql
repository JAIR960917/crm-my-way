-- Módulo de Metas de vendas (cotas por vendedor/gerente e por loja).
-- Cadastrado pelo admin em /metas-cadastro; visualizado por vendedores/gerentes em /metas,
-- com o progresso ("Atingido") calculado ao vivo a partir das vendas da SSótica no período.

CREATE TABLE public.sales_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL CHECK (scope IN ('user', 'company')),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  label TEXT,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  target_amount NUMERIC(12,2) NOT NULL CHECK (target_amount >= 0),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sales_goals_scope_user_check CHECK (
    (scope = 'user' AND user_id IS NOT NULL) OR (scope = 'company' AND user_id IS NULL)
  ),
  CONSTRAINT sales_goals_period_check CHECK (period_end >= period_start)
);

CREATE INDEX idx_sales_goals_company ON public.sales_goals(company_id);
CREATE INDEX idx_sales_goals_user ON public.sales_goals(user_id);
CREATE INDEX idx_sales_goals_period ON public.sales_goals(period_start, period_end);

ALTER TABLE public.sales_goals ENABLE ROW LEVEL SECURITY;

-- Leitura: admin vê tudo; qualquer usuário vê a própria meta individual e a meta
-- da(s) loja(s) a que pertence; gerente vê também as metas de toda a equipe das
-- lojas que administra (própria + manager_companies, via is_my_company()).
CREATE POLICY "select_sales_goals" ON public.sales_goals FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR user_id = auth.uid()
  OR (scope = 'company' AND public.is_my_company(company_id))
  OR (public.has_role(auth.uid(), 'gerente'::app_role) AND public.is_my_company(company_id))
);

-- Escrita: somente admin cadastra/edita/exclui metas.
CREATE POLICY "admin_insert_sales_goals" ON public.sales_goals FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "admin_update_sales_goals" ON public.sales_goals FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "admin_delete_sales_goals" ON public.sales_goals FOR DELETE
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_sales_goals_updated_at
BEFORE UPDATE ON public.sales_goals
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Registra as páginas "Metas" (vendedor/gerente) e "Metas (Cadastro)" (admin) em
-- role_page_permissions. "metas" liberada por padrão para admin/gerente/vendedor
-- (e funções customizadas baseadas neles); "metas_cadastro" só para admin.

INSERT INTO public.role_page_permissions (role_key, page_key, allowed)
SELECT DISTINCT rp.role_key, 'metas', (rp.role_key = 'admin')
FROM public.role_page_permissions rp
WHERE NOT EXISTS (
  SELECT 1 FROM public.role_page_permissions x
  WHERE x.role_key = rp.role_key AND x.page_key = 'metas'
);

INSERT INTO public.role_page_permissions (role_key, page_key, allowed)
SELECT DISTINCT rp.role_key, 'metas_cadastro', (rp.role_key = 'admin')
FROM public.role_page_permissions rp
WHERE NOT EXISTS (
  SELECT 1 FROM public.role_page_permissions x
  WHERE x.role_key = rp.role_key AND x.page_key = 'metas_cadastro'
);

UPDATE public.role_page_permissions rpp
SET allowed = true
FROM public.role_definitions rd
WHERE rpp.role_key = rd.key
  AND rpp.page_key = 'metas'
  AND (
    rd.key IN ('vendedor', 'gerente', 'admin')
    OR rd.base_role IN ('vendedor'::app_role, 'gerente'::app_role, 'admin'::app_role)
  );

UPDATE public.role_page_permissions
SET allowed = (role_key = 'admin')
WHERE page_key = 'metas_cadastro';
