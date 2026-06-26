-- Mesma regra de unicidade do CPF, agora também pelo telefone: um telefone
-- só pode registrar um palpite por jogo. Índice único (não só checagem na
-- aplicação) cobre o caso de duas requisições concorrentes (ex.: clique
-- duplo) passarem pela checagem antes de qualquer uma das duas inserir.
--
-- Antes de criar o índice, remove duplicatas (telefone, jogo) que já
-- existem hoje — senão a criação do índice falha. Mantém a inscrição mais
-- recente de cada par; o lead vinculado (se houver) não é tocado aqui, só
-- a linha de inscrição duplicada.
DELETE FROM public.campanha_copa_submissions s
WHERE telefone IS NOT NULL AND btrim(telefone) <> ''
  AND s.id NOT IN (
    SELECT DISTINCT ON (telefone, jogo) id
    FROM public.campanha_copa_submissions
    WHERE telefone IS NOT NULL AND btrim(telefone) <> ''
    ORDER BY telefone, jogo, created_at DESC
  );

CREATE UNIQUE INDEX IF NOT EXISTS campanha_copa_submissions_telefone_jogo_uidx
  ON public.campanha_copa_submissions (telefone, jogo)
  WHERE telefone IS NOT NULL AND btrim(telefone) <> '';
