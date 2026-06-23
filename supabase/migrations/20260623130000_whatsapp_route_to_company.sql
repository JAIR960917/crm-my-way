-- Inbox WhatsApp: "Encaminhar para empresa" — manda a conversa para a fila de
-- PENDENTES de outra empresa (em vez de transferir para uma pessoa
-- específica). Qualquer usuário da empresa de destino pode aceitar, igual
-- já acontece com pendentes "nativos" da empresa da própria instância.
-- Quando roteada, a conversa some da fila de pendentes da empresa original
-- (mesma instância) até ser aceita ou re-roteada de volta.

ALTER TABLE public.whatsapp_conversations
  ADD COLUMN IF NOT EXISTS routed_to_company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_routed_to_company
  ON public.whatsapp_conversations(routed_to_company_id)
  WHERE routed_to_company_id IS NOT NULL;

-- Pode agir (aceitar/fechar/transferir/re-rotear) numa conversa PENDENTE:
-- admin, OU a empresa de destino do roteamento (se houver), OU — sem
-- roteamento — quem tem acesso normal à instância (atribuição manual ou
-- empresa da própria instância).
CREATE OR REPLACE FUNCTION public.can_act_on_pending_conversation(p_conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT
      has_role(auth.uid(), 'admin'::app_role)
      OR (
        c.routed_to_company_id IS NOT NULL
        AND public.is_my_company(c.routed_to_company_id)
      )
      OR (
        c.routed_to_company_id IS NULL
        AND c.instance_id IS NOT NULL
        AND public.user_has_whatsapp_inbox_access(c.instance_id)
      )
    FROM public.whatsapp_conversations c
    WHERE c.id = p_conversation_id AND c.status = 'pending'
  ), false);
$$;

-- 1) Visibilidade da conversa: admin, dono atual (assigned_to), ou pendente
--    que ela pode agir (instância dela, sem roteamento; ou roteada pra
--    empresa dela).
DROP POLICY IF EXISTS "Staff read whatsapp_conversations" ON public.whatsapp_conversations;

CREATE POLICY "Staff read whatsapp_conversations"
  ON public.whatsapp_conversations FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR assigned_to = auth.uid()
    OR (status = 'pending' AND public.can_act_on_pending_conversation(id))
  );

-- 2) Mesmo filtro na RPC de listagem do inbox.
CREATE OR REPLACE FUNCTION public.list_whatsapp_inbox_conversations(p_limit int DEFAULT 200)
RETURNS TABLE (
  id uuid,
  instance_id uuid,
  wa_id text,
  contact_name text,
  phone_display text,
  module text,
  card_id uuid,
  window_expires_at timestamptz,
  last_message_at timestamptz,
  last_preview text,
  unread_count int,
  last_message_direction text,
  last_read_at timestamptz,
  assigned_to uuid,
  assigned_to_name text,
  status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id,
    c.instance_id,
    c.wa_id,
    c.contact_name,
    c.phone_display,
    c.module,
    c.card_id,
    c.window_expires_at,
    c.last_message_at,
    c.last_preview,
    GREATEST(
      COALESCE(c.unread_count, 0),
      CASE
        WHEN lm.direction = 'in'
          AND (c.last_read_at IS NULL OR c.last_read_at < lm.created_at)
        THEN 1
        ELSE 0
      END
    )::int AS unread_count,
    COALESCE(c.last_message_direction, lm.direction) AS last_message_direction,
    c.last_read_at,
    c.assigned_to,
    p.full_name AS assigned_to_name,
    c.status
  FROM public.whatsapp_conversations c
  LEFT JOIN LATERAL (
    SELECT m.direction, m.created_at
    FROM public.whatsapp_messages m
    WHERE m.conversation_id = c.id
    ORDER BY m.created_at DESC
    LIMIT 1
  ) lm ON true
  LEFT JOIN public.profiles p ON p.user_id = c.assigned_to
  WHERE
    has_role(auth.uid(), 'admin'::app_role)
    OR c.assigned_to = auth.uid()
    OR (c.status = 'pending' AND public.can_act_on_pending_conversation(c.id))
  ORDER BY c.last_message_at DESC NULLS LAST
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 200), 500));
$$;

-- 3) Mensagens: alinhado com a mesma regra.
DROP POLICY IF EXISTS "Staff read whatsapp_messages" ON public.whatsapp_messages;

CREATE POLICY "Staff read whatsapp_messages"
  ON public.whatsapp_messages FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1
      FROM public.whatsapp_conversations c
      WHERE c.id = whatsapp_messages.conversation_id
        AND (
          c.assigned_to = auth.uid()
          OR (c.status = 'pending' AND public.can_act_on_pending_conversation(c.id))
        )
    )
  );

-- 4) Aceitar: usa a mesma regra de "pode agir num pendente".
CREATE OR REPLACE FUNCTION public.accept_whatsapp_conversation(p_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.whatsapp_conversations WHERE id = p_conversation_id) THEN
    RAISE EXCEPTION 'Conversa não encontrada';
  END IF;

  IF NOT public.can_act_on_pending_conversation(p_conversation_id) THEN
    RAISE EXCEPTION 'Sem permissão para esta conversa';
  END IF;

  UPDATE public.whatsapp_conversations
  SET status = 'open', assigned_to = auth.uid(), updated_at = now()
  WHERE id = p_conversation_id AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conversa já foi aceita por outro atendente';
  END IF;
END;
$$;

-- 5) Fechar: dono atual, admin, ou quem pode agir num pendente.
CREATE OR REPLACE FUNCTION public.close_whatsapp_conversation(p_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assigned_to uuid;
BEGIN
  SELECT assigned_to INTO v_assigned_to
  FROM public.whatsapp_conversations
  WHERE id = p_conversation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conversa não encontrada';
  END IF;

  IF NOT (
    v_assigned_to = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
    OR public.can_act_on_pending_conversation(p_conversation_id)
  ) THEN
    RAISE EXCEPTION 'Sem permissão para encerrar esta conversa';
  END IF;

  UPDATE public.whatsapp_conversations
  SET status = 'closed', updated_at = now()
  WHERE id = p_conversation_id;
END;
$$;

-- 6) Transferir para uma PESSOA: mesma regra de quem pode agir.
CREATE OR REPLACE FUNCTION public.transfer_whatsapp_conversation(p_conversation_id uuid, p_to_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assigned_to uuid;
  v_target_is_staff boolean;
BEGIN
  SELECT assigned_to INTO v_assigned_to
  FROM public.whatsapp_conversations
  WHERE id = p_conversation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conversa não encontrada';
  END IF;

  IF NOT (
    v_assigned_to = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
    OR public.can_act_on_pending_conversation(p_conversation_id)
  ) THEN
    RAISE EXCEPTION 'Sem permissão para transferir esta conversa';
  END IF;

  v_target_is_staff := EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p_to_user_id
      AND ur.role IN ('admin', 'gerente', 'vendedor', 'financeiro')
  );

  IF NOT v_target_is_staff THEN
    RAISE EXCEPTION 'Usuário de destino inválido';
  END IF;

  UPDATE public.whatsapp_conversations
  SET status = 'open', assigned_to = p_to_user_id, routed_to_company_id = NULL, updated_at = now()
  WHERE id = p_conversation_id;
END;
$$;

-- 7) Encaminhar para uma EMPRESA: volta pra "pendente", sem dono, marcada
--    para a empresa de destino — qualquer usuário dela pode aceitar.
CREATE OR REPLACE FUNCTION public.route_whatsapp_conversation_to_company(p_conversation_id uuid, p_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assigned_to uuid;
BEGIN
  SELECT assigned_to INTO v_assigned_to
  FROM public.whatsapp_conversations
  WHERE id = p_conversation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conversa não encontrada';
  END IF;

  IF NOT (
    v_assigned_to = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
    OR public.can_act_on_pending_conversation(p_conversation_id)
  ) THEN
    RAISE EXCEPTION 'Sem permissão para encaminhar esta conversa';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = p_company_id) THEN
    RAISE EXCEPTION 'Empresa de destino inválida';
  END IF;

  UPDATE public.whatsapp_conversations
  SET status = 'pending', assigned_to = NULL, routed_to_company_id = p_company_id, updated_at = now()
  WHERE id = p_conversation_id;
END;
$$;

REVOKE ALL ON FUNCTION public.route_whatsapp_conversation_to_company(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.route_whatsapp_conversation_to_company(uuid, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
