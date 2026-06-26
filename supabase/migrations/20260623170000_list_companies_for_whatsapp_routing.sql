-- A tabela companies tem RLS restrita à própria empresa do usuário
-- (Scoped company visibility), então o seletor de "Encaminhar p/ empresa"
-- só mostrava a empresa do próprio atendente. Esta function permite que
-- qualquer usuário autenticado veja a lista completa de empresas só para
-- esse fim específico (escolher destino do encaminhamento), sem afetar a
-- visibilidade geral da tabela companies.
CREATE OR REPLACE FUNCTION public.list_companies_for_whatsapp_routing()
RETURNS TABLE (id uuid, name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.name
  FROM public.companies c
  ORDER BY c.name;
$$;

REVOKE ALL ON FUNCTION public.list_companies_for_whatsapp_routing() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_companies_for_whatsapp_routing() TO authenticated;

NOTIFY pgrst, 'reload schema';
