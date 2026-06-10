-- Período de trabalho do especialista no dia (manhã, tarde ou dia todo)

ALTER TABLE public.company_eye_exam_day_specialists
  ADD COLUMN IF NOT EXISTS work_period text NOT NULL DEFAULT 'dia_todo';

ALTER TABLE public.company_eye_exam_day_specialists
  DROP CONSTRAINT IF EXISTS company_eye_exam_day_specialists_work_period_check;

ALTER TABLE public.company_eye_exam_day_specialists
  ADD CONSTRAINT company_eye_exam_day_specialists_work_period_check
  CHECK (work_period IN ('manha', 'tarde', 'dia_todo'));

COMMENT ON COLUMN public.company_eye_exam_day_specialists.work_period IS
  'Período de trabalho: manha, tarde ou dia_todo';
