-- ============================================================
-- Coluna gerada (somente digitos) para buscar agendamentos por telefone
-- independente de formatacao salva (igual ja fizemos para crm_renovacoes).
-- Usada pela nova ferramenta do agente de IA que consulta agendamentos
-- existentes pelo telefone/nome do cliente.
-- ============================================================

ALTER TABLE public.crm_appointments
  ADD COLUMN IF NOT EXISTS telefone_digits text
  GENERATED ALWAYS AS (regexp_replace(coalesce(telefone, ''), '\D', '', 'g')) STORED;

CREATE INDEX IF NOT EXISTS idx_crm_appointments_telefone_digits
  ON public.crm_appointments (telefone_digits);
