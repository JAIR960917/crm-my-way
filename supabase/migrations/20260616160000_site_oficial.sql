-- ============================================================
-- Site Oficial: tabelas para o formulário e leads do site institucional
-- ============================================================

-- Campos configuráveis do formulário de franquia do site
CREATE TABLE IF NOT EXISTS public.site_form_fields (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  label        TEXT         NOT NULL,
  field_type   TEXT         NOT NULL DEFAULT 'text',
  placeholder  TEXT,
  options      TEXT[],
  is_required  BOOLEAN      NOT NULL DEFAULT true,
  position     INTEGER      NOT NULL DEFAULT 0,
  is_active    BOOLEAN      NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Leads (respostas do formulário público do site)
CREATE TABLE IF NOT EXISTS public.site_form_submissions (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  data         JSONB        NOT NULL DEFAULT '{}',
  nome         TEXT,
  email        TEXT,
  telefone     TEXT,
  status       TEXT         NOT NULL DEFAULT 'novo',
  assigned_to  UUID         REFERENCES auth.users(id),
  notes        TEXT,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.site_form_fields      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_form_submissions ENABLE ROW LEVEL SECURITY;

-- site_form_fields: anon lê os ativos (o site carrega os campos), auth faz tudo
CREATE POLICY "anon_select_site_form_fields"
  ON public.site_form_fields FOR SELECT
  USING (is_active = true);

CREATE POLICY "auth_all_site_form_fields"
  ON public.site_form_fields FOR ALL
  USING (auth.role() = 'authenticated');

-- site_form_submissions: anon insere (formulário público), auth faz tudo
CREATE POLICY "anon_insert_site_form_submissions"
  ON public.site_form_submissions FOR INSERT
  WITH CHECK (true);

CREATE POLICY "auth_all_site_form_submissions"
  ON public.site_form_submissions FOR ALL
  USING (auth.role() = 'authenticated');

-- Índices
CREATE INDEX IF NOT EXISTS idx_site_form_fields_position
  ON public.site_form_fields (position);
CREATE INDEX IF NOT EXISTS idx_site_form_submissions_created_at
  ON public.site_form_submissions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_site_form_submissions_status
  ON public.site_form_submissions (status);

-- Campos padrão (podem ser editados pelo admin no CRM)
INSERT INTO public.site_form_fields
  (label, field_type, placeholder, options, is_required, position)
VALUES
  ('Nome completo',                                     'text',     'Seu nome completo',                         NULL,                                                                                     true,  1),
  ('E-mail',                                            'email',    'seu@email.com',                             NULL,                                                                                     true,  2),
  ('Telefone / WhatsApp',                               'tel',      '(99) 99999-9999',                           NULL,                                                                                     true,  3),
  ('Cidade de interesse para abrir a franquia',          'text',     'Ex: São Paulo - SP',                        NULL,                                                                                     true,  4),
  ('Capital disponível para investimento',              'select',   NULL,                                        ARRAY['R$ 100.000 a R$ 200.000','R$ 200.000 a R$ 500.000','Acima de R$ 500.000'],         true,  5),
  ('Possui experiência no setor óptico?',               'select',   NULL,                                        ARRAY['Sim','Não, mas tenho interesse em aprender'],                                      false, 6),
  ('Por que deseja ser um franqueado?',                 'textarea', 'Conte um pouco sobre sua motivação...',     NULL,                                                                                     false, 7)
ON CONFLICT DO NOTHING;
