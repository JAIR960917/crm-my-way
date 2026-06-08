-- Exclusão definitiva de leads na coluna Excluídos (somente admin).

CREATE OR REPLACE FUNCTION public.hard_delete_lead(_lead_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _lead public.crm_leads%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Apenas administradores podem excluir leads definitivamente';
  END IF;

  SELECT * INTO _lead
  FROM public.crm_leads
  WHERE id = _lead_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead não encontrado';
  END IF;

  IF _lead.status <> 'excluidos' THEN
    RAISE EXCEPTION 'Só é possível excluir definitivamente leads na coluna Excluídos';
  END IF;

  DELETE FROM public.crm_leads WHERE id = _lead_id;
END;
$$;

REVOKE ALL ON FUNCTION public.hard_delete_lead(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hard_delete_lead(uuid) TO authenticated;
