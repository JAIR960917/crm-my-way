-- Bucket de storage para os PDFs/fotos dos contratos importados da
-- Assertiva Autentica / Google Drive (crediario_contratos_assertiva.pdf_path).
-- Existia no app standalone original mas não foi portado junto com a tabela
-- e as edge functions gdrive-importar-contratos / assertiva-baixar-contrato.
DO $do$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'storage' AND table_name = 'buckets' AND column_name = 'public'
  ) THEN
    EXECUTE $sql$
      INSERT INTO storage.buckets (id, name, public)
      VALUES ('contratos-assertiva', 'contratos-assertiva', false)
      ON CONFLICT (id) DO NOTHING
    $sql$;
  ELSE
    EXECUTE $sql$
      INSERT INTO storage.buckets (id, name)
      VALUES ('contratos-assertiva', 'contratos-assertiva')
      ON CONFLICT (id) DO NOTHING
    $sql$;
  END IF;
END;
$do$;

DROP POLICY IF EXISTS ca_storage_select ON storage.objects;
DROP POLICY IF EXISTS ca_storage_insert ON storage.objects;
DROP POLICY IF EXISTS ca_storage_delete ON storage.objects;

CREATE POLICY ca_storage_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'contratos-assertiva' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY ca_storage_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'contratos-assertiva' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY ca_storage_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'contratos-assertiva' AND has_role(auth.uid(), 'admin'::app_role));
