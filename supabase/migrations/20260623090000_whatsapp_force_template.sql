-- Permite marcar uma campanha/passo de gatilho para SEMPRE enviar como
-- template aprovado da Meta (preserva botões/quick-replies do template),
-- em vez de cair em texto livre quando a janela de 24h está aberta.
-- Sem isso, templates com botão configurados pelo admin perdiam o botão
-- sempre que o cliente já tinha uma conversa recente (janela aberta).
ALTER TABLE public.whatsapp_campaigns
  ADD COLUMN IF NOT EXISTS force_template boolean NOT NULL DEFAULT false;

ALTER TABLE public.whatsapp_trigger_steps
  ADD COLUMN IF NOT EXISTS force_template boolean NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
