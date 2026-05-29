-- Garante bucket logos público e políticas de leitura/escrita consistentes.

INSERT INTO storage.buckets (id, name, public)
VALUES ('logos', 'logos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Anyone can view logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can read logos" ON storage.objects;
DROP POLICY IF EXISTS "Admins can upload logos" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update logos" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete logos" ON storage.objects;

CREATE POLICY "Anyone can view logos"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'logos');

CREATE POLICY "Admins can upload logos"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'logos' AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update logos"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'logos' AND public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (bucket_id = 'logos' AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete logos"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'logos' AND public.has_role(auth.uid(), 'admin'::app_role));
