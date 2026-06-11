-- Banner Campanha Copa: leitura pública de mídia e upload no bucket logos.

-- whatsapp-media: URLs em <img> e na API Meta precisam carregar sem login
DROP POLICY IF EXISTS "Authenticated can read whatsapp media" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view whatsapp media" ON storage.objects;
DROP POLICY IF EXISTS "Public read whatsapp media" ON storage.objects;

CREATE POLICY "Anyone can view whatsapp media"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'whatsapp-media');

UPDATE storage.buckets SET public = true WHERE id = 'whatsapp-media';

-- logos/campanha-copa: arte promocional do formulário público
DROP POLICY IF EXISTS "Campanha copa managers upload banner" ON storage.objects;
DROP POLICY IF EXISTS "Campanha copa managers update banner" ON storage.objects;
DROP POLICY IF EXISTS "Campanha copa managers delete banner" ON storage.objects;

CREATE POLICY "Campanha copa managers upload banner"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'logos'
    AND (storage.foldername(name))[1] = 'campanha-copa'
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'gerente'::app_role)
    )
  );

CREATE POLICY "Campanha copa managers update banner"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'logos'
    AND (storage.foldername(name))[1] = 'campanha-copa'
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'gerente'::app_role)
    )
  )
  WITH CHECK (
    bucket_id = 'logos'
    AND (storage.foldername(name))[1] = 'campanha-copa'
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'gerente'::app_role)
    )
  );

CREATE POLICY "Campanha copa managers delete banner"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'logos'
    AND (storage.foldername(name))[1] = 'campanha-copa'
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'gerente'::app_role)
    )
  );
