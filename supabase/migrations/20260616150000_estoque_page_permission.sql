-- Registra a página "Estoque" (controle de estoque via SSótica) em
-- role_page_permissions, liberada por padrão apenas para admin.

INSERT INTO public.role_page_permissions (role_key, page_key, allowed)
SELECT DISTINCT rp.role_key, 'estoque', (rp.role_key = 'admin')
FROM public.role_page_permissions rp
WHERE NOT EXISTS (
  SELECT 1 FROM public.role_page_permissions x
  WHERE x.role_key = rp.role_key AND x.page_key = 'estoque'
);

UPDATE public.role_page_permissions
SET allowed = (role_key = 'admin')
WHERE page_key = 'estoque';
