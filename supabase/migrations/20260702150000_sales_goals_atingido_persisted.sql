-- Persiste o valor "atingido" (calculado a partir da SSótica) diretamente na
-- meta, para que vendedores/gerentes vejam o progresso sem precisar puxar a
-- SSótica eles mesmos (essa chamada continua restrita a admin/gerente na
-- edge function ssotica-vendas-periodo). Só o admin atualiza (via botão
-- "Atualizar vendas"), e a escrita continua protegida pela mesma policy de
-- UPDATE (admin_update_sales_goals) já criada para a tabela.

ALTER TABLE public.sales_goals
  ADD COLUMN atingido_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN atingido_updated_at TIMESTAMPTZ;
