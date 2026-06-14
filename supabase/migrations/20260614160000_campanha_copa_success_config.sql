-- Tela de sucesso do formulário público Campanha Copa (imagem + convite Instagram)

INSERT INTO public.system_settings (setting_key, setting_value)
VALUES (
  'campanha_copa_success_config',
  '{"image_url":"","title":"Participe do canal do instagram Joonker na Copa.","subtitle":"Lá você fica por dentro de todos os nossos bolões e promoções nesse período da copa.","instagram_url":"https://www.instagram.com/channel/AbZblAkgWccnnG9D/","button_label":"Participe do canal"}'
)
ON CONFLICT (setting_key) DO NOTHING;
