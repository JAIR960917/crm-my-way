-- whatsapp_completion_logs: a política de INSERT "TO authenticated WITH CHECK (true)"
-- permite que qualquer usuário autenticado grave registros de conclusão de
-- campanha/gatilho com source_id/contadores arbitrários (forjar logs).
-- O único gravador real é a edge function send-whatsapp, que usa o
-- service_role (bypassa RLS) — a política para "authenticated" não é usada
-- por nenhum fluxo legítimo e pode ser removida sem impacto.
DROP POLICY IF EXISTS "Service role and authenticated can insert completion logs" ON public.whatsapp_completion_logs;
