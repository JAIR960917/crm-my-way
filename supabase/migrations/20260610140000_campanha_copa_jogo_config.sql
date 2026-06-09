-- Configuração dinâmica do jogo da Campanha Copa + rótulo salvo na inscrição

ALTER TABLE public.campanha_copa_submissions
  ADD COLUMN IF NOT EXISTS jogo_label text;

INSERT INTO public.system_settings (setting_key, setting_value)
VALUES (
  'campanha_copa_jogo_config',
  '{"team_home_name":"Brasil","team_away_name":"Marrocos","team_home_flag":"br","team_away_flag":"ma","match_meta":"Nova Jersey · 13/06 · Sábado · 19:00"}'
)
ON CONFLICT (setting_key) DO NOTHING;

UPDATE public.campanha_copa_submissions
SET jogo_label = 'Brasil x Marrocos',
    jogo = 'brasil_marrocos'
WHERE jogo IS NULL OR jogo = 'brasil_x_marrocos';
