-- Webhook (service_role) precisa localizar cobrança pelo telefone ao vincular resposta ao gatilho.

GRANT EXECUTE ON FUNCTION public.find_cobrancas_by_phone(text, text, uuid, text) TO service_role;
