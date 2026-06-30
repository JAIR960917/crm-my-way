-- Estende os tipos permitidos na coluna link_type da tabela company_links
-- para suportar banner (imagem), title (título) e paragraph (parágrafo de texto).
ALTER TABLE public.company_links
  DROP CONSTRAINT IF EXISTS company_links_link_type_check;

ALTER TABLE public.company_links
  ADD CONSTRAINT company_links_link_type_check
  CHECK (link_type IN ('link', 'header', 'banner', 'title', 'paragraph'));
