-- ============================================================================
-- Sistema de funções customizadas + permissões por página
-- ============================================================================

-- 1. Catálogo de funções (system + custom)
CREATE TABLE public.role_definitions (
  key text PRIMARY KEY,
  label text NOT NULL,
  is_system boolean NOT NULL DEFAULT false,
  base_role app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.role_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated view role definitions"
ON public.role_definitions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage role definitions"
ON public.role_definitions FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_role_definitions_updated_at
BEFORE UPDATE ON public.role_definitions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed: funções nativas
INSERT INTO public.role_definitions (key, label, is_system, base_role) VALUES
  ('admin',      'Admin',      true, 'admin'),
  ('gerente',    'Gerente',    true, 'gerente'),
  ('financeiro', 'Financeiro', true, 'financeiro'),
  ('vendedor',   'Vendedor',   true, 'vendedor');

-- 2. Permissões de página por função
CREATE TABLE public.role_page_permissions (
  role_key text NOT NULL REFERENCES public.role_definitions(key) ON DELETE CASCADE,
  page_key text NOT NULL,
  allowed boolean NOT NULL DEFAULT true,
  PRIMARY KEY (role_key, page_key)
);

ALTER TABLE public.role_page_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated view role permissions"
ON public.role_page_permissions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage role permissions"
ON public.role_page_permissions FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Seed permissões iniciais (replica comportamento atual)
-- Admin: tudo liberado
INSERT INTO public.role_page_permissions (role_key, page_key, allowed)
SELECT 'admin', page_key, true
FROM (VALUES
  ('leads'),('usuarios'),('empresas'),('colunas'),
  ('formulario'),('formulario_renovacao'),('novo_lead'),
  ('configuracoes'),('whatsapp'),('agendamentos'),
  ('clientes_ativos'),('importar'),('cobrancas'),('cobrancas_fluxo'),
  ('integracoes_ssotica'),('status_ssotica'),('logs_movimentacao'),
  ('dashboard'),('relatorio_vendas')
) AS p(page_key);

-- Gerente: tudo exceto dashboard, relatorio_vendas, configuracoes, integracoes/status SSOtica
INSERT INTO public.role_page_permissions (role_key, page_key, allowed)
SELECT 'gerente', page_key, allowed
FROM (VALUES
  ('leads',true),('usuarios',true),('empresas',true),('colunas',true),
  ('formulario',true),('formulario_renovacao',true),('novo_lead',true),
  ('configuracoes',false),('whatsapp',true),('agendamentos',true),
  ('clientes_ativos',true),('importar',true),('cobrancas',true),('cobrancas_fluxo',true),
  ('integracoes_ssotica',false),('status_ssotica',false),('logs_movimentacao',true),
  ('dashboard',false),('relatorio_vendas',false)
) AS p(page_key, allowed);

-- Vendedor: páginas operacionais básicas
INSERT INTO public.role_page_permissions (role_key, page_key, allowed)
SELECT 'vendedor', page_key, allowed
FROM (VALUES
  ('leads',true),('usuarios',false),('empresas',false),('colunas',false),
  ('formulario',false),('formulario_renovacao',false),('novo_lead',true),
  ('configuracoes',false),('whatsapp',false),('agendamentos',true),
  ('clientes_ativos',true),('importar',false),('cobrancas',false),('cobrancas_fluxo',false),
  ('integracoes_ssotica',false),('status_ssotica',false),('logs_movimentacao',false),
  ('dashboard',false),('relatorio_vendas',false)
) AS p(page_key, allowed);

-- Financeiro: só cobranças
INSERT INTO public.role_page_permissions (role_key, page_key, allowed)
SELECT 'financeiro', page_key, allowed
FROM (VALUES
  ('leads',false),('usuarios',false),('empresas',false),('colunas',false),
  ('formulario',false),('formulario_renovacao',false),('novo_lead',false),
  ('configuracoes',false),('whatsapp',false),('agendamentos',false),
  ('clientes_ativos',false),('importar',false),('cobrancas',true),('cobrancas_fluxo',true),
  ('integracoes_ssotica',false),('status_ssotica',false),('logs_movimentacao',false),
  ('dashboard',false),('relatorio_vendas',false)
) AS p(page_key, allowed);

-- 3. user_roles ganha role_key
ALTER TABLE public.user_roles
  ADD COLUMN role_key text REFERENCES public.role_definitions(key) ON DELETE SET NULL;

-- Backfill: copia o nome do enum para role_key
UPDATE public.user_roles SET role_key = role::text WHERE role_key IS NULL;