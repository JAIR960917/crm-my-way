-- Atualiza metadados da conversa e incrementa não-lidas em uma única operação (webhook).

ALTER TABLE public.whatsapp_conversations REPLICA IDENTITY FULL;

CREATE OR REPLACE FUNCTION public.apply_whatsapp_conversation_message_meta(
  p_conversation_id uuid,
  p_preview text,
  p_last_message_at timestamptz,
  p_phone_display text,
  p_wa_id text,
  p_window_expires_at timestamptz DEFAULT NULL,
  p_contact_name text DEFAULT NULL,
  p_instance_id uuid DEFAULT NULL,
  p_increment_unread boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.whatsapp_conversations
  SET
    last_message_at = p_last_message_at,
    last_preview = left(coalesce(p_preview, ''), 200),
    phone_display = p_phone_display,
    wa_id = p_wa_id,
    window_expires_at = COALESCE(p_window_expires_at, window_expires_at),
    contact_name = COALESCE(nullif(trim(p_contact_name), ''), contact_name),
    instance_id = COALESCE(p_instance_id, instance_id),
    unread_count = CASE
      WHEN p_increment_unread THEN unread_count + 1
      ELSE unread_count
    END,
    updated_at = now()
  WHERE id = p_conversation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conversa não encontrada';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_whatsapp_conversation_message_meta(
  uuid, text, timestamptz, text, text, timestamptz, text, uuid, boolean
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.apply_whatsapp_conversation_message_meta(
  uuid, text, timestamptz, text, text, timestamptz, text, uuid, boolean
) TO service_role;
