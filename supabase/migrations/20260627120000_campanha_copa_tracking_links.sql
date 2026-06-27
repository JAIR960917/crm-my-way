-- Links de rastreamento para a campanha copa
-- Permite criar URLs únicas (?ref=SLUG) para rastrear de qual campanha/fonte
-- o participante veio.

CREATE TABLE IF NOT EXISTS public.campanha_copa_tracking_links (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL,
  slug       text        NOT NULL UNIQUE,
  created_by uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS campanha_copa_tracking_links_slug_idx
  ON public.campanha_copa_tracking_links (slug);

ALTER TABLE public.campanha_copa_tracking_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins full access tracking_links" ON public.campanha_copa_tracking_links;
CREATE POLICY "Admins full access tracking_links" ON public.campanha_copa_tracking_links
  FOR ALL TO authenticated
  USING  (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Gerentes view tracking_links" ON public.campanha_copa_tracking_links;
CREATE POLICY "Gerentes view tracking_links" ON public.campanha_copa_tracking_links
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'gerente'));

-- Coluna que registra qual link originou cada inscrição
ALTER TABLE public.campanha_copa_submissions
  ADD COLUMN IF NOT EXISTS tracking_slug text;

CREATE INDEX IF NOT EXISTS campanha_copa_submissions_tracking_slug_idx
  ON public.campanha_copa_submissions (tracking_slug);

NOTIFY pgrst, 'reload schema';
