-- Comprovantes de residência para assinatura ZapSign do Crediário (upload
-- pelo celular, leitura na edge function zapsign-criar-documento).
-- storage.buckets nem sempre tem a coluna "public" (depende da versão do
-- storage-api self-hosted) — verifica antes de usá-la, mesmo padrão das
-- migrations de avatars/logos.
DO $do$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'storage' AND table_name = 'buckets' AND column_name = 'public'
  ) THEN
    EXECUTE $sql$
      INSERT INTO storage.buckets (id, name, public)
      VALUES ('comprovantes-assinatura', 'comprovantes-assinatura', false)
      ON CONFLICT (id) DO NOTHING
    $sql$;
  ELSE
    EXECUTE $sql$
      INSERT INTO storage.buckets (id, name)
      VALUES ('comprovantes-assinatura', 'comprovantes-assinatura')
      ON CONFLICT (id) DO NOTHING
    $sql$;
  END IF;
END;
$do$;

DROP POLICY IF EXISTS comprovantes_assinatura_insert ON storage.objects;
DROP POLICY IF EXISTS comprovantes_assinatura_select ON storage.objects;
DROP POLICY IF EXISTS comprovantes_assinatura_delete ON storage.objects;

CREATE POLICY comprovantes_assinatura_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'comprovantes-assinatura'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY comprovantes_assinatura_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'comprovantes-assinatura'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY comprovantes_assinatura_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'comprovantes-assinatura'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
