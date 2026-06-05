-- Horário do agendamento para exibição na visão Dia/Semana do calendário.

ALTER TABLE public.crediario_tasks
  ADD COLUMN IF NOT EXISTS scheduled_time time NOT NULL DEFAULT '09:00'::time;

COMMENT ON COLUMN public.crediario_tasks.scheduled_time IS
  'Horário local do agendamento (visão dia/semana do calendário).';
