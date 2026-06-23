-- Leads antigos ficaram com a resposta legada "Recomendação/Indicação" na
-- "Forma de captação" (campo dinâmico do formulário), que não existe mais
-- como opção — por isso eles não entram nas contagens/relatórios filtrados
-- por "Recomendação". Reescreve o valor em todos os campos do JSON `data`,
-- cobrindo tanto campos de resposta única (string) quanto múltipla (array).
UPDATE public.crm_leads
SET data = (
  SELECT jsonb_object_agg(
    kv.key,
    CASE
      WHEN jsonb_typeof(kv.value) = 'string' AND kv.value = '"Recomendação/Indicação"'::jsonb
        THEN '"Recomendação"'::jsonb
      WHEN jsonb_typeof(kv.value) = 'array' THEN (
        SELECT jsonb_agg(
          CASE WHEN elem = '"Recomendação/Indicação"'::jsonb THEN '"Recomendação"'::jsonb ELSE elem END
        )
        FROM jsonb_array_elements(kv.value) AS elem
      )
      ELSE kv.value
    END
  )
  FROM jsonb_each(data) AS kv
)
WHERE data::text LIKE '%Recomendação/Indicação%';
