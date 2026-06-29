-- Permite criar "cabeçalhos" de seção na página /links (ex.: "Avalie nossas
-- lojas"), igual ao Linktree — um separador de texto entre grupos de links,
-- sem botão clicável.
ALTER TABLE public.company_links
  ADD COLUMN IF NOT EXISTS link_type text NOT NULL DEFAULT 'link';

ALTER TABLE public.company_links
  ADD CONSTRAINT company_links_link_type_check CHECK (link_type IN ('link', 'header'));
