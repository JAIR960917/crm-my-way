-- Seção "Geral" do Relatório Campanha Copa: lançamentos de despesa/investimento
-- da campanha (ex.: investimento em anúncio), usados para calcular CAC, CPL
-- e ticket médio. Lista de lançamentos (não um valor único) — soma de todos
-- os lançamentos = "Despesas".
CREATE TABLE IF NOT EXISTS public.campanha_copa_despesas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  valor numeric NOT NULL CHECK (valor >= 0),
  descricao text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.campanha_copa_despesas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manages campanha_copa_despesas"
  ON public.campanha_copa_despesas FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

NOTIFY pgrst, 'reload schema';
