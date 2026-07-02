-- Corrige 3 vulnerabilidades de severidade alta encontradas em revisão de segurança:
--
-- 1) crediario_consultas_cache tinha SELECT/WRITE liberado a qualquer usuário
--    autenticado (USING (true)) — guarda relatório de crédito COMPLETO
--    (score, pendências, raw da Serasa) de qualquer CPF já consultado por
--    qualquer loja. Qualquer vendedor conseguia ler (ou forjar) o histórico
--    de crédito de todo mundo. Restringe a admin/gerente/financeiro — o
--    lookup pontual por CPF que vendedores usavam (Pagamento na Entrega/
--    Renegociação) passa a ir por uma edge function (crediario-checar-cache-cpf)
--    que devolve só o nome, via service role.
--
-- 2) crediario_vendas.aprovacao_admin podia ser alterado pelo próprio dono
--    da venda (RLS permite escrita ao "dono"), permitindo que um vendedor
--    aprovasse a própria venda abaixo da entrada mínima, sem admin nenhum.
--    Trigger bloqueia mudança nas colunas de aprovação por quem não é admin
--    (a via legítima por código de autorização usa service role, que passa
--    livre pelo trigger).
--
-- 3) crediario_codigos_autorizacao tinha SELECT/UPDATE liberado a qualquer
--    usuário autenticado — um vendedor conseguia ler um código não usado
--    direto da tabela e usá-lo pra aprovar a própria venda (segundo caminho
--    pro mesmo problema do item 2). Restringe a admin/gerente, mesmo padrão
--    já usado na política de INSERT/DELETE dessa tabela.

-- ---------- 1) crediario_consultas_cache ----------

DROP POLICY IF EXISTS "crediario_consultas_cache_select" ON public.crediario_consultas_cache;
DROP POLICY IF EXISTS "crediario_consultas_cache_write" ON public.crediario_consultas_cache;

CREATE POLICY "crediario_consultas_cache_select" ON public.crediario_consultas_cache
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'gerente'::app_role)
    OR has_role(auth.uid(), 'financeiro'::app_role)
  );

CREATE POLICY "crediario_consultas_cache_write" ON public.crediario_consultas_cache
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'gerente'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'gerente'::app_role));

-- ---------- 2) crediario_vendas: protege colunas de aprovação ----------

CREATE OR REPLACE FUNCTION public.crediario_vendas_protect_aprovacao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- auth.uid() é NULL quando a chamada vem de uma edge function usando a
  -- service role (ex.: autorizacao-validar-codigo) — sempre permitida, pois
  -- já valida a autorização por conta própria antes de escrever.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF (
    NEW.aprovacao_admin IS DISTINCT FROM OLD.aprovacao_admin
    OR NEW.aprovacao_por IS DISTINCT FROM OLD.aprovacao_por
    OR NEW.aprovacao_em IS DISTINCT FROM OLD.aprovacao_em
    OR NEW.aprovacao_motivo IS DISTINCT FROM OLD.aprovacao_motivo
  ) AND NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Apenas administradores podem aprovar ou rejeitar vendas diretamente.';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.crediario_vendas_protect_aprovacao() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_crediario_vendas_protect_aprovacao ON public.crediario_vendas;
CREATE TRIGGER trg_crediario_vendas_protect_aprovacao
BEFORE UPDATE ON public.crediario_vendas
FOR EACH ROW EXECUTE FUNCTION public.crediario_vendas_protect_aprovacao();

-- ---------- 3) crediario_codigos_autorizacao ----------

DROP POLICY IF EXISTS "crediario_codigos_autorizacao_select" ON public.crediario_codigos_autorizacao;
DROP POLICY IF EXISTS "crediario_codigos_autorizacao_update" ON public.crediario_codigos_autorizacao;

CREATE POLICY "crediario_codigos_autorizacao_select" ON public.crediario_codigos_autorizacao
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'gerente'::app_role));

CREATE POLICY "crediario_codigos_autorizacao_update" ON public.crediario_codigos_autorizacao
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'gerente'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'gerente'::app_role));
