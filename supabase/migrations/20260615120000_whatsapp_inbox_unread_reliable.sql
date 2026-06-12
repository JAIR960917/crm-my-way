-- Controle confiável de não-lidas: direção da última mensagem + leitura pelo atendente.

ALTER TABLE public.whatsapp_conversations
  ADD COLUMN IF NOT EXISTS last_message_direction text
    CHECK (last_message_direction IS NULL OR last_message_direction IN ('in', 'out')),
  ADD COLUMN IF NOT EXISTS last_read_at timestamptz;

CREATE OR REPLACE FUNCTION public._whatsapp_message_preview(p_row public.whatsapp_messages)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT left(
    coalesce(
      nullif(trim(p_row.body), ''),
      nullif(trim(p_row.caption), ''),
      CASE p_row.media_type
        WHEN 'audio' THEN '🎤 Áudio'
        WHEN 'image' THEN '📷 Imagem'
        WHEN 'video' THEN '🎬 Vídeo'
        ELSE '📎 Anexo'
      END,
      'Nova mensagem'
    ),
    200
  );
$$;

CREATE OR REPLACE FUNCTION public.on_whatsapp_message_insert_sync_conversation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_preview text;
BEGIN
  v_preview := public._whatsapp_message_preview(NEW);

  UPDATE public.whatsapp_conversations
  SET
    last_message_at = NEW.created_at,
    last_preview = v_preview,
    last_message_direction = NEW.direction,
    unread_count = CASE
      WHEN NEW.direction = 'in' THEN unread_count + 1
      ELSE unread_count
    END,
    updated_at = now()
  WHERE id = NEW.conversation_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_whatsapp_message_sync_conversation ON public.whatsapp_messages;
CREATE TRIGGER trg_whatsapp_message_sync_conversation
  AFTER INSERT ON public.whatsapp_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.on_whatsapp_message_insert_sync_conversation();

CREATE OR REPLACE FUNCTION public.mark_whatsapp_conversation_read(p_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_instance_id uuid;
BEGIN
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
  SET unread_count = 0, last_read_at = now(), updated_at = now()
  WHERE id = p_conversation_id;
END;
$$;

-- Backfill direção da última mensagem.
UPDATE public.whatsapp_conversations c
SET last_message_direction = m.direction
FROM (
  SELECT DISTINCT ON (conversation_id)
    conversation_id,
    direction
  FROM public.whatsapp_messages
  ORDER BY conversation_id, created_at DESC
) m
WHERE c.id = m.conversation_id;

-- Backfill não-lidas: última mensagem inbound ainda não lida.
UPDATE public.whatsapp_conversations c
SET unread_count = GREATEST(COALESCE(c.unread_count, 0), 1)
FROM (
  SELECT DISTINCT ON (conversation_id)
    conversation_id,
    direction,
    created_at
  FROM public.whatsapp_messages
  ORDER BY conversation_id, created_at DESC
) m
WHERE c.id = m.conversation_id
  AND m.direction = 'in'
  AND (c.last_read_at IS NULL OR c.last_read_at < m.created_at);
