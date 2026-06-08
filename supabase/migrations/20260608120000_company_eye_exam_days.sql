-- Dias de exame de vista por empresa (destaque no calendário de agendamentos)

CREATE TABLE public.company_eye_exam_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  exam_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, exam_date)
);

CREATE INDEX idx_company_eye_exam_days_lookup
  ON public.company_eye_exam_days (company_id, exam_date);

ALTER TABLE public.company_eye_exam_days ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read company eye exam days"
  ON public.company_eye_exam_days FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins manage company eye exam days"
  ON public.company_eye_exam_days FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
