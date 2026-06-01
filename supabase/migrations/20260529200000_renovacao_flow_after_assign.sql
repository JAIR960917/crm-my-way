-- Renovação: ao vincular responsável, sair da coluna "fazer direcionamento" para o fluxo por data da última compra.

CREATE OR REPLACE FUNCTION public.crm_renovacao_flow_status_key(p_data_ultima_compra date)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN p_data_ultima_compra IS NULL THEN 'novo'
    WHEN (CURRENT_DATE - p_data_ultima_compra) < 365 THEN 'em_contato'
    WHEN (CURRENT_DATE - p_data_ultima_compra) < 730 THEN 'agendado'
    WHEN (CURRENT_DATE - p_data_ultima_compra) < 1095 THEN 'renovado'
    ELSE 'mais_de_3_anos'
  END;
$$;

CREATE OR REPLACE FUNCTION public.crm_renovacao_sync_status_with_assignee()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  _manual text[] := ARRAY['em_atendimento', 'nunca_fez_exame', 'excluidos'];
BEGIN
  IF NEW.status = ANY (_manual) THEN
    RETURN NEW;
  END IF;

  IF NEW.assigned_to IS NULL THEN
    NEW.status := 'fazer_direcionamento_para_o_vendedor';
    RETURN NEW;
  END IF;

  IF NEW.status = 'fazer_direcionamento_para_o_vendedor' THEN
    NEW.status := public.crm_renovacao_flow_status_key(NEW.data_ultima_compra::date);
  ELSIF TG_OP = 'UPDATE'
    AND OLD.assigned_to IS NULL
    AND NEW.assigned_to IS NOT NULL
    AND (OLD.status = 'fazer_direcionamento_para_o_vendedor' OR NEW.status = 'fazer_direcionamento_para_o_vendedor') THEN
    NEW.status := public.crm_renovacao_flow_status_key(NEW.data_ultima_compra::date);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crm_renovacao_sync_status_assignee ON public.crm_renovacoes;
CREATE TRIGGER trg_crm_renovacao_sync_status_assignee
  BEFORE INSERT OR UPDATE OF assigned_to, status, data_ultima_compra
  ON public.crm_renovacoes
  FOR EACH ROW
  EXECUTE FUNCTION public.crm_renovacao_sync_status_with_assignee();

-- Corrige cards já presos na coluna de direcionamento com responsável vinculado.
UPDATE public.crm_renovacoes
SET status = public.crm_renovacao_flow_status_key(data_ultima_compra::date)
WHERE status = 'fazer_direcionamento_para_o_vendedor'
  AND assigned_to IS NOT NULL;
