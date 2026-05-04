CREATE OR REPLACE FUNCTION public.find_lead_by_phone(_phone text)
RETURNS TABLE(lead_id uuid, owner_user_id uuid, owner_name text, is_mine boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _digits text := regexp_replace(coalesce(_phone, ''), '\D', '', 'g');
  _suffix text;
BEGIN
  IF _digits = '' OR length(_digits) < 8 THEN
    RETURN;
  END IF;
  _suffix := right(_digits, 8);

  RETURN QUERY
  SELECT
    l.id,
    COALESCE(l.assigned_to, l.created_by) AS owner_user_id,
    COALESCE(NULLIF(p.full_name, ''), p.email, 'Desconhecido') AS owner_name,
    (COALESCE(l.assigned_to, l.created_by) = auth.uid()) AS is_mine
  FROM public.crm_leads l
  LEFT JOIN public.profiles p ON p.user_id = COALESCE(l.assigned_to, l.created_by)
  WHERE EXISTS (
    SELECT 1
    FROM jsonb_each_text(l.data) AS e(k, v)
    WHERE length(regexp_replace(e.v, '\D', '', 'g')) >= 8
      AND regexp_replace(e.v, '\D', '', 'g') LIKE '%' || _suffix
  )
  ORDER BY l.created_at DESC
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.find_lead_by_phone(text) TO authenticated;