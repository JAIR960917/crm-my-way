-- ============================================================
-- Horario de funcionamento por empresa (por dia da semana).
-- Usado para calcular horarios disponiveis de agendamento (ex.: agente de
-- IA consultando vagas de exame de vista por loja).
-- ============================================================

CREATE TABLE public.company_business_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=domingo ... 6=sabado
  is_open boolean NOT NULL DEFAULT true,
  start_time time NOT NULL DEFAULT '09:00',
  end_time time NOT NULL DEFAULT '18:00',
  slot_duration_minutes integer NOT NULL DEFAULT 30 CHECK (slot_duration_minutes > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, day_of_week)
);

CREATE INDEX idx_company_business_hours_company ON public.company_business_hours (company_id);

ALTER TABLE public.company_business_hours ENABLE ROW LEVEL SECURITY;

-- Leitura: qualquer usuario autenticado (necessario para o fluxo de
-- agendamento e para a function que o agente de IA vai consultar).
CREATE POLICY "Authenticated read company_business_hours"
  ON public.company_business_hours FOR SELECT
  TO authenticated
  USING (true);

-- Escrita: admin sempre; gerente apenas da(s) sua(s) empresa(s).
CREATE POLICY "Admin manage company_business_hours"
  ON public.company_business_hours FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Gerente manage own company_business_hours"
  ON public.company_business_hours FOR ALL
  TO authenticated
  USING (
    has_role(auth.uid(), 'gerente'::app_role)
    AND (
      EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND p.company_id = company_business_hours.company_id)
      OR EXISTS (SELECT 1 FROM public.manager_companies mc WHERE mc.user_id = auth.uid() AND mc.company_id = company_business_hours.company_id)
    )
  )
  WITH CHECK (
    has_role(auth.uid(), 'gerente'::app_role)
    AND (
      EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND p.company_id = company_business_hours.company_id)
      OR EXISTS (SELECT 1 FROM public.manager_companies mc WHERE mc.user_id = auth.uid() AND mc.company_id = company_business_hours.company_id)
    )
  );

CREATE OR REPLACE FUNCTION public.touch_company_business_hours_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_company_business_hours_updated_at
  BEFORE UPDATE ON public.company_business_hours
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_company_business_hours_updated_at();
