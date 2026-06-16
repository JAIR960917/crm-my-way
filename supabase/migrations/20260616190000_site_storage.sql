-- Bucket público para assets do site (logos, imagens)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'site-assets',
  'site-assets',
  true,
  5242880, -- 5 MB
  ARRAY['image/png','image/jpeg','image/jpg','image/gif','image/webp','image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;

-- Usuários autenticados podem fazer upload
CREATE POLICY "auth_upload_site_assets"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'site-assets');

-- Usuários autenticados podem substituir arquivos
CREATE POLICY "auth_update_site_assets"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'site-assets');

-- Usuários autenticados podem deletar
CREATE POLICY "auth_delete_site_assets"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'site-assets');

-- Acesso público de leitura (imagens do site são públicas)
CREATE POLICY "public_read_site_assets"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'site-assets');
