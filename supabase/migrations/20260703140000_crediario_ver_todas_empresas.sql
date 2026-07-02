-- Permite marcar um usuário individual para ver os CONTRATOS do Crediário de
-- TODAS as empresas, em vez de só da empresa que ele é responsável/dono.
-- Por padrão ninguém tem esse flag (comportamento igual a hoje); o admin já
-- vê tudo de qualquer forma. Afeta só leitura — inserir/editar/excluir
-- continua exigindo ser dono, gerente da empresa ou admin (sem mudança).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS crediario_ver_todas_empresas boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.crediario_pode_ver_todas_empresas()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT crediario_ver_todas_empresas FROM public.profiles WHERE user_id = auth.uid()),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.crediario_pode_ver_todas_empresas() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crediario_pode_ver_todas_empresas() TO authenticated;

-- Substitui a política única (FOR ALL) por políticas separadas: leitura
-- ampliada pelo novo flag, escrita sem nenhuma mudança de escopo.
DROP POLICY IF EXISTS "crediario_contracts_rw" ON public.crediario_contracts;

CREATE POLICY "crediario_contracts_select" ON public.crediario_contracts
  FOR SELECT TO authenticated
  USING (
    public.crediario_can_read(user_id, company_id)
    OR public.crediario_pode_ver_todas_empresas()
  );

CREATE POLICY "crediario_contracts_insert" ON public.crediario_contracts
  FOR INSERT TO authenticated
  WITH CHECK (public.crediario_can_write(user_id, company_id));

CREATE POLICY "crediario_contracts_update" ON public.crediario_contracts
  FOR UPDATE TO authenticated
  USING (public.crediario_can_write(user_id, company_id))
  WITH CHECK (public.crediario_can_write(user_id, company_id));

CREATE POLICY "crediario_contracts_delete" ON public.crediario_contracts
  FOR DELETE TO authenticated
  USING (public.crediario_can_write(user_id, company_id));
