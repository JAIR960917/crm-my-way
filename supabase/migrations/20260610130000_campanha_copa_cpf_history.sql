-- CPF, jogo único por palpite e histórico de inscrições Campanha Copa

ALTER TABLE public.campanha_copa_submissions
  ADD COLUMN IF NOT EXISTS cpf text,
  ADD COLUMN IF NOT EXISTS jogo text NOT NULL DEFAULT 'brasil_x_marrocos';

CREATE UNIQUE INDEX IF NOT EXISTS campanha_copa_submissions_cpf_jogo_uidx
  ON public.campanha_copa_submissions (cpf, jogo)
  WHERE cpf IS NOT NULL AND btrim(cpf) <> '';

CREATE TABLE IF NOT EXISTS public.campanha_copa_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.campanha_copa_submissions(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  summary text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS campanha_copa_history_submission_idx
  ON public.campanha_copa_history (submission_id, created_at DESC);

ALTER TABLE public.campanha_copa_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins full access campanha_copa_history" ON public.campanha_copa_history;
CREATE POLICY "Admins full access campanha_copa_history" ON public.campanha_copa_history
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Gerentes view campanha_copa_history" ON public.campanha_copa_history;
CREATE POLICY "Gerentes view campanha_copa_history" ON public.campanha_copa_history
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'gerente'));

DROP POLICY IF EXISTS "Gerentes insert campanha_copa_history" ON public.campanha_copa_history;
CREATE POLICY "Gerentes insert campanha_copa_history" ON public.campanha_copa_history
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'gerente'));

DROP POLICY IF EXISTS "Vendedores view assigned campanha_copa_history" ON public.campanha_copa_history;
CREATE POLICY "Vendedores view assigned campanha_copa_history" ON public.campanha_copa_history
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'vendedor')
    AND EXISTS (
      SELECT 1 FROM public.campanha_copa_submissions s
      WHERE s.id = submission_id AND s.assigned_to = auth.uid()
    )
  );
