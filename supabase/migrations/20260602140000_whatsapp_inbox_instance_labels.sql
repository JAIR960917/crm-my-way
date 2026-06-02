-- Inbox: permitir ler rótulos das instâncias (sem session/token) para quem tem acesso ao inbox

CREATE OR REPLACE FUNCTION public.list_whatsapp_instances_for_inbox()
RETURNS TABLE (
  id uuid,
  name text,
  display_phone text,
  phone_number_id text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT i.id, i.name, i.display_phone, i.phone_number_id
  FROM public.whatsapp_instances i
  WHERE i.is_active = true
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'gerente'::app_role)
      OR (i.company_id IS NOT NULL AND public.is_my_company(i.company_id))
      OR EXISTS (
        SELECT 1
        FROM public.whatsapp_instance_assignments a
        WHERE a.instance_id = i.id AND a.user_id = auth.uid()
      )
    );
$$;

COMMENT ON FUNCTION public.list_whatsapp_instances_for_inbox() IS
  'Retorna id/nome/telefone das instâncias WhatsApp visíveis no inbox, sem expor session.';

GRANT EXECUTE ON FUNCTION public.list_whatsapp_instances_for_inbox() TO authenticated;
