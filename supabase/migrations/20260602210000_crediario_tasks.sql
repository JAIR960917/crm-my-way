-- Tarefas do crediário (usuário financeiro): agendamentos manuais por lead.

CREATE TABLE public.crediario_tasks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scheduled_date date NOT NULL,
  lead_name text NOT NULL,
  phone text,
  cpf text,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.crediario_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access on crediario_tasks"
ON public.crediario_tasks FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users manage own crediario_tasks"
ON public.crediario_tasks FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE INDEX idx_crediario_tasks_user_date
  ON public.crediario_tasks (user_id, scheduled_date);

CREATE TRIGGER update_crediario_tasks_updated_at
  BEFORE UPDATE ON public.crediario_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.crediario_tasks IS
  'Agendamentos manuais do crediário (financeiro): nome, data, telefone, CPF e observação.';

-- Permissão da nova página em Funções e Permissões.
INSERT INTO public.role_page_permissions (role_key, page_key, allowed)
SELECT DISTINCT rp.role_key, 'tarefas_crediario', (rp.role_key IN ('admin', 'financeiro'))
FROM public.role_page_permissions rp
WHERE NOT EXISTS (
  SELECT 1
  FROM public.role_page_permissions x
  WHERE x.role_key = rp.role_key
    AND x.page_key = 'tarefas_crediario'
);
