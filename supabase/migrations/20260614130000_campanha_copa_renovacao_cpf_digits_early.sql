-- Estas 5 funções só eram definidas em 20260616120000_campanha_copa_relatorio.sql
-- (datada depois), mas campanha_copa_resolve_company_id e
-- campanha_copa_renovacao_cpf_digits já são chamadas pelas migrations
-- 20260614140000 e 20260614150000. CREATE FUNCTION em plpgsql/sql não falha
-- na criação por referenciar algo inexistente, mas falha na primeira
-- *chamada* — por isso a ordem cronológica dos arquivos importa aqui.
-- 20260616120000 recria as mesmas funções depois com CREATE OR REPLACE
-- (idempotente, sem efeito colateral).

CREATE OR REPLACE FUNCTION public.campanha_copa_normalize_city(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT trim(both from regexp_replace(
    lower(translate(coalesce(p_text, ''),
      'ÀÁÂÃÄÅÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜÇÑàáâãäåèéêëìíîïòóôõöùúûüçñ',
      'AAAAAAEEEEIIIIOOOOOUUUUCNaaaaaaeeeeiiiiooooouuuucn'
    )),
    '[^a-z0-9/-]+', ' ', 'g'
  ));
$$;

CREATE OR REPLACE FUNCTION public.campanha_copa_city_base(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(
    nullif(trim(split_part(public.campanha_copa_normalize_city(p_text), '/', 1)), ''),
    nullif(trim(split_part(public.campanha_copa_normalize_city(p_text), '-', 1)), ''),
    public.campanha_copa_normalize_city(p_text)
  );
$$;

CREATE OR REPLACE FUNCTION public.campanha_copa_cities_match(p_submission_city text, p_route_label text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    length(public.campanha_copa_normalize_city(p_submission_city)) > 0
    AND length(public.campanha_copa_normalize_city(p_route_label)) > 0
    AND (
      public.campanha_copa_normalize_city(p_submission_city)
        = public.campanha_copa_normalize_city(p_route_label)
      OR public.campanha_copa_city_base(p_submission_city)
        = public.campanha_copa_city_base(p_route_label)
      OR position(
        public.campanha_copa_city_base(p_submission_city)
        in public.campanha_copa_normalize_city(p_route_label)
      ) > 0
      OR position(
        public.campanha_copa_city_base(p_route_label)
        in public.campanha_copa_normalize_city(p_submission_city)
      ) > 0
    );
$$;

CREATE OR REPLACE FUNCTION public.campanha_copa_resolve_company_id(p_cidade text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  route record;
BEGIN
  IF coalesce(trim(p_cidade), '') = '' THEN
    RETURN NULL;
  END IF;

  FOR route IN
    SELECT company_id, cidade_label
    FROM public.campanha_copa_cidade_lojas
    ORDER BY length(cidade_label) DESC
  LOOP
    IF public.campanha_copa_cities_match(p_cidade, route.cidade_label) THEN
      RETURN route.company_id;
    END IF;
  END LOOP;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.campanha_copa_renovacao_cpf_digits(p_data jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(
    coalesce(p_data->>'documento', p_data->>'cpf', ''),
    '\D', '', 'g'
  );
$$;
