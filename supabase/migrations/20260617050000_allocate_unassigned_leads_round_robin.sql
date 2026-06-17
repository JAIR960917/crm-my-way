-- ============================================================
-- Aloca leads sem usuario (assigned_to IS NULL) para os vendedores de uma
-- empresa, distribuindo em round-robin. Se a empresa nao tiver nenhum
-- vendedor, usa os gerentes da empresa como destino.
-- ============================================================

CREATE OR REPLACE FUNCTION public.count_unassigned_leads()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT count(*)::integer
  FROM public.crm_leads l
  WHERE l.assigned_to IS NULL
    AND l.status <> 'excluidos';
$$;

CREATE OR REPLACE FUNCTION public.allocate_unassigned_leads_round_robin(
  p_company_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_pool uuid[];
  v_pool_size integer;
  v_assigned integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'gerente'::app_role)) THEN
    RAISE EXCEPTION 'Sem permissão para alocar leads';
  END IF;

  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'Empresa é obrigatória';
  END IF;

  IF NOT has_role(auth.uid(), 'admin'::app_role)
     AND p_company_id NOT IN (
       SELECT p.company_id FROM public.profiles p
       WHERE p.user_id IN (SELECT public.get_company_user_ids()) AND p.company_id IS NOT NULL
     )
  THEN
    RAISE EXCEPTION 'Empresa fora do seu acesso';
  END IF;

  SELECT array_agg(p.user_id ORDER BY p.full_name)
  INTO v_pool
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.user_id
  WHERE p.company_id = p_company_id AND ur.role = 'vendedor'::app_role;

  IF v_pool IS NULL OR array_length(v_pool, 1) = 0 THEN
    SELECT array_agg(p.user_id ORDER BY p.full_name)
    INTO v_pool
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.user_id
    WHERE p.company_id = p_company_id AND ur.role = 'gerente'::app_role;
  END IF;

  IF v_pool IS NULL OR array_length(v_pool, 1) = 0 THEN
    RAISE EXCEPTION 'Nenhum vendedor ou gerente encontrado para essa empresa';
  END IF;

  v_pool_size := array_length(v_pool, 1);

  WITH ordered AS (
    SELECT l.id, (row_number() OVER (ORDER BY l.created_at ASC) - 1) AS rn
    FROM public.crm_leads l
    WHERE l.assigned_to IS NULL
      AND l.status <> 'excluidos'
  ),
  updated AS (
    UPDATE public.crm_leads l
    SET assigned_to = v_pool[(ordered.rn % v_pool_size) + 1], updated_at = now()
    FROM ordered
    WHERE l.id = ordered.id
    RETURNING l.id
  )
  SELECT count(*)::integer INTO v_assigned FROM updated;

  RETURN jsonb_build_object('assigned', COALESCE(v_assigned, 0), 'vendedores', v_pool_size);
END;
$$;

GRANT EXECUTE ON FUNCTION public.count_unassigned_leads() TO authenticated;
GRANT EXECUTE ON FUNCTION public.allocate_unassigned_leads_round_robin(uuid) TO authenticated;
