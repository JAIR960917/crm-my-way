-- Garante que o webhook (service_role) incrementa não-lidas ao receber resposta do cliente.

REVOKE ALL ON FUNCTION public.increment_whatsapp_unread(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_whatsapp_unread(uuid) TO service_role;
