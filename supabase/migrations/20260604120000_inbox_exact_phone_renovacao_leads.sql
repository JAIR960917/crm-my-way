-- Inbox: renovação e leads pelo telefone nacional EXATO (evita falso positivo / sempre o mesmo cliente)

CREATE OR REPLACE FUNCTION public.find_renovacao_by_phone(p_phone text)
RETURNS TABLE (
  id uuid,
  data jsonb,
  status text,
  valor numeric,
  company_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_digits text;
BEGIN
  v_digits := public.normalize_br_mobile_digits(p_phone);
  IF length(v_digits) < 10 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT r.id, r.data, r.status, r.valor, r.ssotica_company_id AS company_id
  FROM public.crm_renovacoes r
  WHERE public.cobranca_matches_inbox_phone(r.data, v_digits)
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'gerente'::app_role)
      OR r.assigned_to = auth.uid()
      OR r.created_by = auth.uid()
      OR public.is_same_company(r.assigned_to)
      OR public.is_same_company(r.created_by)
    )
  ORDER BY r.updated_at DESC
  LIMIT 1;
END;
$$;

COMMENT ON FUNCTION public.find_renovacao_by_phone(text) IS
  'Inbox: renovação pelo telefone exato (sem match por últimos 8 dígitos).';

CREATE OR REPLACE FUNCTION public.find_lead_by_phone(_phone text)
RETURNS TABLE(lead_id uuid, owner_user_id uuid, owner_name text, is_mine boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_digits text;
BEGIN
  v_digits := public.normalize_br_mobile_digits(_phone);
  IF length(v_digits) < 10 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    l.id,
    COALESCE(l.assigned_to, l.created_by) AS owner_user_id,
    COALESCE(NULLIF(p.full_name, ''), p.email, 'Desconhecido') AS owner_name,
    (COALESCE(l.assigned_to, l.created_by) = auth.uid()) AS is_mine
  FROM public.crm_leads l
  LEFT JOIN public.profiles p ON p.user_id = COALESCE(l.assigned_to, l.created_by)
  WHERE public.cobranca_matches_inbox_phone(l.data, v_digits)
  ORDER BY l.updated_at DESC
  LIMIT 1;
END;
$$;

COMMENT ON FUNCTION public.find_lead_by_phone(text) IS
  'Inbox: lead pelo telefone exato no JSON (sem sufixo de 8 dígitos).';
