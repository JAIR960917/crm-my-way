INSERT INTO public.system_settings (setting_key, setting_value)
VALUES ('whatsapp_send_delay_seconds', '30')
ON CONFLICT (setting_key) DO NOTHING;