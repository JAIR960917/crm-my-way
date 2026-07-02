-- Remove duplicatas do campo telefone no formulário de renovação.
-- A migration 20260701160000 já corrigiu nome/CPF/data-última-consulta, mas
-- deixou telefone de fora por engano (assumindo que dois campos de telefone
-- seriam intencionais). Na prática eram duplicatas da mesma seed rodando
-- mais de uma vez via deploy.sh, causando dois campos "Telefone" no formulário
-- de edição (um preenchido e não-obrigatório, outro vazio e obrigatório).

DELETE FROM public.crm_renovacao_form_fields a
USING public.crm_renovacao_form_fields b
WHERE a.is_phone_field = true
  AND b.is_phone_field = true
  AND (a.parent_field_id IS NULL AND b.parent_field_id IS NULL)
  AND a.ctid > b.ctid;
