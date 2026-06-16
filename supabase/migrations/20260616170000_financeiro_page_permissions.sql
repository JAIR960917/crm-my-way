-- Registra as páginas do módulo Financeiro em role_page_permissions.
-- Liberadas por padrão apenas para admin e gerente.

DO $$
DECLARE
  page_keys text[] := ARRAY[
    'fin_contas_receber',
    'fin_contas_pagar',
    'fin_fluxo',
    'fin_recebimentos_cartao'
  ];
  pk text;
BEGIN
  FOREACH pk IN ARRAY page_keys LOOP
    INSERT INTO public.role_page_permissions (role_key, page_key, allowed)
    SELECT DISTINCT rp.role_key, pk, (rp.role_key IN ('admin', 'gerente'))
    FROM public.role_page_permissions rp
    WHERE NOT EXISTS (
      SELECT 1 FROM public.role_page_permissions x
      WHERE x.role_key = rp.role_key AND x.page_key = pk
    );

    UPDATE public.role_page_permissions
    SET allowed = (role_key IN ('admin', 'gerente'))
    WHERE page_key = pk;
  END LOOP;
END $$;
