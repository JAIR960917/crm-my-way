-- Colunas existiam na produção atual (provavelmente adicionadas manualmente
-- ou esquecidas de uma renomeação para company_id) mas nunca tinham sido
-- registradas numa migration deste repo. Não são usadas em nenhuma tela
-- hoje; mantidas só para compatibilidade com os dados já existentes na
-- migração de dados da produção atual.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS cidade text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS empresa_id uuid;
