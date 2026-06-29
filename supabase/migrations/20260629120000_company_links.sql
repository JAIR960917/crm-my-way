-- Página pública "link na bio" (estilo Linktree) com os links oficiais da
-- empresa (Instagram, WhatsApp, site, Campanha Copa, etc). Gerenciada pelo
-- admin em Configurações; exibida publicamente via edge function
-- (get-company-links) usando a service role — sem precisar de policy pública.
CREATE TABLE IF NOT EXISTS public.company_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  url text NOT NULL,
  icon text NOT NULL DEFAULT 'link',
  color text,
  position integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS company_links_position_idx ON public.company_links (position);

CREATE TRIGGER update_company_links_updated_at
  BEFORE UPDATE ON public.company_links
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.company_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins full access company_links" ON public.company_links;
CREATE POLICY "Admins full access company_links" ON public.company_links
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
