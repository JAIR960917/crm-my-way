-- Mesmo caso de profiles.cidade/empresa_id (ver 20260625120000): colunas que
-- existem na produção atual mas nunca foram registradas numa migration
-- deste repo. Não são usadas em nenhuma tela hoje; mantidas só para
-- compatibilidade com os dados já existentes na migração de dados.
ALTER TABLE public.whatsapp_conversations
  ADD COLUMN IF NOT EXISTS routed_to_company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;

ALTER TABLE public.whatsapp_campaigns
  ADD COLUMN IF NOT EXISTS force_template boolean NOT NULL DEFAULT false;

ALTER TABLE public.whatsapp_trigger_steps
  ADD COLUMN IF NOT EXISTS force_template boolean NOT NULL DEFAULT false;
