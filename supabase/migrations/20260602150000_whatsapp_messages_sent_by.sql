-- Inbox: identificar o atendente nas mensagens enviadas manualmente

ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS sent_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sent_by_name text;

COMMENT ON COLUMN public.whatsapp_messages.sent_by IS 'Usuário CRM que enviou a mensagem (inbox manual).';
COMMENT ON COLUMN public.whatsapp_messages.sent_by_name IS 'Nome exibido no inbox no momento do envio.';

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_sent_by
  ON public.whatsapp_messages (sent_by)
  WHERE sent_by IS NOT NULL;
