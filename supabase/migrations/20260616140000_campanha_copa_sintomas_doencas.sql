alter table public.campanha_copa_submissions
  add column if not exists sintomas text[] not null default '{}',
  add column if not exists doencas text[] not null default '{}';
