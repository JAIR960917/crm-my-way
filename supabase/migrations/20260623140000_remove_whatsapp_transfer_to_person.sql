-- Remove a transferência de conversa para uma PESSOA específica — agora só
-- existe o encaminhamento para EMPRESA (route_whatsapp_conversation_to_company).
DROP FUNCTION IF EXISTS public.transfer_whatsapp_conversation(uuid, uuid);
DROP FUNCTION IF EXISTS public.list_whatsapp_inbox_assignable_users(uuid);

NOTIFY pgrst, 'reload schema';
