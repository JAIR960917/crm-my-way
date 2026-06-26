-- Cores próprias do módulo Crediário (aplicadas só na área de conteúdo das
-- telas /crediario/*, mantendo a sidebar com o tema geral do CRM). Strings
-- HSL ("H S% L%"), mesmo formato usado em system_settings. Vazio/NULL = usa
-- o tema geral do sistema sem sobrescrever nada.
ALTER TABLE public.crediario_settings
  ADD COLUMN IF NOT EXISTS theme_primary_color text,
  ADD COLUMN IF NOT EXISTS theme_background_color text,
  ADD COLUMN IF NOT EXISTS theme_text_color text,
  ADD COLUMN IF NOT EXISTS theme_button_color text;
