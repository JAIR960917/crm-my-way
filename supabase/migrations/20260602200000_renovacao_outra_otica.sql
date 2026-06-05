-- Renovação em outra ótica: data de referência para colunas + tarefa de retorno.

ALTER TABLE public.crm_renovacoes
  ADD COLUMN IF NOT EXISTS renovou_outra_otica boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS data_exame_outra_otica date;

COMMENT ON COLUMN public.crm_renovacoes.renovou_outra_otica IS
  'Cliente renovou consulta de vista em outra ótica.';
COMMENT ON COLUMN public.crm_renovacoes.data_exame_outra_otica IS
  'Data do último exame feito na outra ótica; redefine a coluna do fluxo e gera tarefa +320 dias.';
