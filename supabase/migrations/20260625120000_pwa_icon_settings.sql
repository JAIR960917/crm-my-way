-- Ícone do PWA (tela inicial do celular) editável pelo admin em Configurações,
-- separado da logo do sistema (que aparece no cabeçalho/favicon) — o ícone do
-- PWA precisa ser quadrado/com respiro pra ficar bom como ícone de app.
INSERT INTO public.system_settings (setting_key, setting_value) VALUES
  ('pwa_icon_192_url', ''),
  ('pwa_icon_512_url', '')
ON CONFLICT (setting_key) DO NOTHING;
