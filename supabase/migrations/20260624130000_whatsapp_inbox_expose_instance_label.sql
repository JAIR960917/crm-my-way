-- Inbox WhatsApp: expõe nome/telefone da instância direto na listagem.
--
-- Quando uma conversa é ENCAMINHADA para outra empresa (routed_to_company_id)
-- ou pertence a uma instância de pool sem empresa, o frontend não consegue
-- resolver o nome da instância via list_whatsapp_instances_for_inbox() (essa
-- RPC só retorna instâncias da PRÓPRIA empresa do usuário) e mostra "Número
-- não identificado" mesmo a conversa estando correta. Resolver isso expondo
-- name/display_phone direto na RPC de listagem (mesmo join que já existe
-- aqui para ai_enabled), sem precisar de acesso geral à lista de instâncias.
--
-- Adicionar colunas novas é "mudar o tipo de retorno" pro Postgres — precisa
-- DROP antes do CREATE.
DROP FUNCTION IF EXISTS public.list_whatsapp_inbox_conversations(int);

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
  status text,
  ai_active boolean,
  ai_enabled boolean,
  routed_to_company_id uuid,
  instance_name text,
  instance_display_phone text
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
    c.status,
    c.ai_active,
    COALESCE(i.ai_enabled, false) AS ai_enabled,
    c.routed_to_company_id,
    i.name AS instance_name,
    i.display_phone AS instance_display_phone
  FROM public.whatsapp_conversations c
  LEFT JOIN LATERAL (
    SELECT m.direction, m.created_at
    FROM public.whatsapp_messages m
    WHERE m.conversation_id = c.id
    ORDER BY m.created_at DESC
    LIMIT 1
  ) lm ON true
  LEFT JOIN public.profiles p ON p.user_id = c.assigned_to
  LEFT JOIN public.whatsapp_instances i ON i.id = c.instance_id
  WHERE
    has_role(auth.uid(), 'admin'::app_role)
    OR c.assigned_to = auth.uid()
    OR (c.status = 'pending' AND public.can_act_on_pending_conversation(c.id))
  ORDER BY c.last_message_at DESC NULLS LAST
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 200), 5000));
$$;

REVOKE ALL ON FUNCTION public.list_whatsapp_inbox_conversations(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_whatsapp_inbox_conversations(int) TO authenticated;

NOTIFY pgrst, 'reload schema';
