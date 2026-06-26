-- aprovacao_admin é um status em texto ("pendente"/"aprovada"/"rejeitada"),
-- não uma referência a usuário — erro de design na migration original
-- (20260619020000), descoberto ao migrar os dados reais do Crediário.
ALTER TABLE public.crediario_vendas
  DROP CONSTRAINT IF EXISTS crediario_vendas_aprovacao_admin_fkey;

ALTER TABLE public.crediario_vendas
  ALTER COLUMN aprovacao_admin TYPE text USING aprovacao_admin::text;
