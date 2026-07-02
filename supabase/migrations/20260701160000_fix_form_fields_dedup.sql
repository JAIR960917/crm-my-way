-- Remove duplicatas de campos de sistema no formulário de renovação.
-- Campos duplicados surgem quando o deploy.sh roda as seeds mais de uma vez.
-- Para cada flag de sistema (nome, data última consulta, CPF), mantém apenas
-- o registro com o menor ctid (primeiro inserido) sem parent_field_id.

-- Duplicatas de campo nome
DELETE FROM public.crm_renovacao_form_fields a
USING public.crm_renovacao_form_fields b
WHERE a.is_name_field = true
  AND b.is_name_field = true
  AND (a.parent_field_id IS NULL AND b.parent_field_id IS NULL)
  AND a.ctid > b.ctid;

-- Duplicatas de campo data última consulta
DELETE FROM public.crm_renovacao_form_fields a
USING public.crm_renovacao_form_fields b
WHERE a.is_last_visit_field = true
  AND b.is_last_visit_field = true
  AND (a.parent_field_id IS NULL AND b.parent_field_id IS NULL)
  AND a.ctid > b.ctid;

-- Duplicatas de campo CPF
DELETE FROM public.crm_renovacao_form_fields a
USING public.crm_renovacao_form_fields b
WHERE a.is_cpf_field = true
  AND b.is_cpf_field = true
  AND (a.parent_field_id IS NULL AND b.parent_field_id IS NULL)
  AND a.ctid > b.ctid;

-- Duplicatas de campo telefone
DELETE FROM public.crm_renovacao_form_fields a
USING public.crm_renovacao_form_fields b
WHERE a.is_phone_field = true
  AND b.is_phone_field = true
  AND (a.parent_field_id IS NULL AND b.parent_field_id IS NULL)
  AND a.ctid > b.ctid;
