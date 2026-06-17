-- ==========================================================
-- A correcao anterior (20260617010000) adicionou
-- user_has_whatsapp_inbox_access() na politica de SELECT de
-- whatsapp_messages, mas manteve a exigencia de is_my_company(),
-- herdada de 20260617000000_security_rls_fixes.sql.
--
-- is_my_company() compara o company_id do PERFIL do usuario com o
-- company_id da instancia. Isso e independente da atribuicao explicita
-- de numero (whatsapp_instance_assignments), que e o mecanismo real de
-- acesso usado pela politica de whatsapp_conversations (sem is_my_company).
-- Resultado: usuarios com numero atribuido mas de empresa "diferente" do
-- cadastro da instancia continuavam sem ver as mensagens, mesmo vendo a
-- conversa normalmente.
--
-- Esta migration alinha a politica de whatsapp_messages com a de
-- whatsapp_conversations: admin tem acesso total; demais dependem apenas
-- de user_has_whatsapp_inbox_access() + (pendente ou atribuida a si).
-- ==========================================================

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
        AND c.instance_id IS NOT NULL
        AND public.user_has_whatsapp_inbox_access(c.instance_id)
        AND (c.status = 'pending' OR c.assigned_to = auth.uid())
    )
  );
