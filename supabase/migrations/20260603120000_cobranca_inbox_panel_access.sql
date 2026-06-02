-- Inbox cobrança: usuários dedicados à cobrança veem cards pelo telefone + vínculo na conversa

CREATE OR REPLACE FUNCTION public.user_has_page_access(p_page_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN false
    WHEN has_role(auth.uid(), 'admin'::app_role) THEN true
    ELSE EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.role_page_permissions rpp
        ON rpp.role_key = COALESCE(ur.role_key, ur.role::text)
      WHERE ur.user_id = auth.uid()
        AND rpp.page_key = p_page_key
        AND rpp.allowed = true
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.user_is_cobranca_inbox_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    has_role(auth.uid(), 'financeiro'::app_role)
    OR (
      public.user_has_page_access('cobrancas')
      AND NOT public.user_has_page_access('leads')
      AND NOT public.user_has_page_access('clientes_ativos')
    );
$$;

CREATE OR REPLACE FUNCTION public.normalize_br_mobile_digits(p_raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  d text;
BEGIN
  d := public.normalize_br_phone_digits(p_raw);
  IF length(d) = 10 AND substring(d from 3 for 1) <> '9' THEN
    d := left(d, 2) || '9' || substring(d from 3);
  END IF;
  RETURN d;
END;
$$;

CREATE OR REPLACE FUNCTION public.br_phones_match(p_a text, p_b text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  a text;
  b text;
  a8 text;
  b8 text;
BEGIN
  a := public.normalize_br_mobile_digits(p_a);
  b := public.normalize_br_mobile_digits(p_b);
  IF length(a) < 8 OR length(b) < 8 THEN
    RETURN false;
  END IF;
  IF a = b THEN
    RETURN true;
  END IF;
  a8 := right(a, 8);
  b8 := right(b, 8);
  RETURN a8 = b8;
END;
$$;

CREATE OR REPLACE FUNCTION public.cobranca_data_matches_phone(p_data jsonb, p_last8 text, p_full text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  kv record;
  d text;
  primary_phone text;
  full_mobile text;
BEGIN
  IF p_last8 IS NULL OR length(p_last8) < 8 THEN
    RETURN false;
  END IF;

  full_mobile := public.normalize_br_mobile_digits(p_full);

  primary_phone := public.cobranca_data_phone_digits(p_data);
  IF length(primary_phone) >= 8 THEN
    IF public.br_phones_match(primary_phone, p_full) THEN
      RETURN true;
    END IF;
  END IF;

  FOR kv IN SELECT key, value FROM jsonb_each_text(coalesce(p_data, '{}'::jsonb)) LOOP
    IF kv.value IS NULL OR kv.value !~ '\d{8,}' THEN
      CONTINUE;
    END IF;
    d := public.normalize_br_phone_digits(kv.value);
    IF length(d) < 8 THEN
      CONTINUE;
    END IF;
    IF public.br_phones_match(d, p_full) THEN
      RETURN true;
    END IF;
  END LOOP;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.user_can_view_cobranca_by_id(p_cobranca_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.crm_cobrancas c
    WHERE c.id = p_cobranca_id
      AND (
        has_role(auth.uid(), 'admin'::app_role)
        OR has_role(auth.uid(), 'financeiro'::app_role)
        OR has_role(auth.uid(), 'gerente'::app_role)
        OR c.assigned_to = auth.uid()
        OR c.created_by = auth.uid()
        OR public.is_same_company(c.assigned_to)
        OR public.is_same_company(c.created_by)
        OR public.user_is_cobranca_inbox_user()
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.find_cobranca_by_phone(p_phone text)
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
  v_last8 text;
BEGIN
  v_digits := public.normalize_br_mobile_digits(p_phone);
  IF length(v_digits) < 8 THEN
    RETURN;
  END IF;
  v_last8 := right(v_digits, 8);

  RETURN QUERY
  SELECT c.id, c.data, c.status, c.valor, c.company_id
  FROM public.crm_cobrancas c
  WHERE public.cobranca_data_matches_phone(c.data, v_last8, v_digits)
    AND public.user_can_view_cobranca_by_id(c.id)
  ORDER BY c.updated_at DESC
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.link_whatsapp_conversation_cobranca(
  p_conversation_id uuid,
  p_cobranca_id uuid,
  p_contact_name text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_instance_id uuid;
BEGIN
  IF NOT public.user_can_view_cobranca_by_id(p_cobranca_id) THEN
    RAISE EXCEPTION 'Sem permissão para vincular esta cobrança';
  END IF;

  SELECT instance_id INTO v_instance_id
  FROM public.whatsapp_conversations
  WHERE id = p_conversation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conversa não encontrada';
  END IF;

  IF NOT public.user_has_whatsapp_inbox_access(v_instance_id) THEN
    RAISE EXCEPTION 'Sem permissão para esta conversa';
  END IF;

  UPDATE public.whatsapp_conversations
  SET
    card_id = p_cobranca_id,
    module = 'cobrancas',
    contact_name = COALESCE(nullif(trim(p_contact_name), ''), contact_name),
    updated_at = now()
  WHERE id = p_conversation_id;
END;
$$;

DROP POLICY IF EXISTS "Users can view cobrancas scoped" ON public.crm_cobrancas;

CREATE POLICY "Users can view cobrancas scoped"
ON public.crm_cobrancas
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'financeiro'::app_role)
  OR has_role(auth.uid(), 'gerente'::app_role)
  OR assigned_to = auth.uid()
  OR created_by = auth.uid()
  OR public.user_is_cobranca_inbox_user()
);

DROP POLICY IF EXISTS "View cobranca notes scoped" ON public.crm_cobranca_notes;

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
        OR public.user_is_cobranca_inbox_user()
      )
  )
);

CREATE OR REPLACE FUNCTION public.user_has_whatsapp_inbox_access(p_instance_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN has_role(auth.uid(), 'admin'::app_role) THEN true
    WHEN has_role(auth.uid(), 'gerente'::app_role) THEN true
    WHEN has_role(auth.uid(), 'financeiro'::app_role) THEN true
    WHEN p_instance_id IS NULL THEN false
    ELSE EXISTS (
      SELECT 1 FROM public.whatsapp_instance_assignments a
      WHERE a.user_id = auth.uid() AND a.instance_id = p_instance_id
    )
  END;
$$;

COMMENT ON FUNCTION public.user_is_cobranca_inbox_user() IS
  'Usuário dedicado à cobrança (função financeiro ou permissões só de cobrança).';

COMMENT ON FUNCTION public.link_whatsapp_conversation_cobranca(uuid, uuid, text) IS
  'Inbox: vincula conversa WhatsApp ao card de cobrança (staff com acesso ao inbox).';

GRANT EXECUTE ON FUNCTION public.user_has_page_access(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_is_cobranca_inbox_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.link_whatsapp_conversation_cobranca(uuid, uuid, text) TO authenticated;
