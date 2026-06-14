-- Configuração de sincronização automática SSótica (horários e ativação)

INSERT INTO public.system_settings (setting_key, setting_value)
VALUES
  ('ssotica_auto_sync_enabled', 'false'),
  ('ssotica_auto_sync_times', '["00:00","06:00","12:00","18:00"]'),
  ('ssotica_auto_sync_last_trigger', '')
ON CONFLICT (setting_key) DO NOTHING;
