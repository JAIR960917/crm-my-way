-- Relatório Campanha Copa: métricas + cruzamento com Renovação (CPF/telefone + loja da cidade)

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

CREATE OR REPLACE FUNCTION public.campanha_copa_can_view_submission(p_assigned_to uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(auth.uid(), 'admin'::app_role)
    OR (
      public.has_role(auth.uid(), 'gerente'::app_role)
      AND (
        p_assigned_to IS NULL
        OR public.is_same_company(p_assigned_to)
      )
    )
    OR (
      public.has_role(auth.uid(), 'vendedor'::app_role)
      AND p_assigned_to = auth.uid()
    );
$$;

CREATE OR REPLACE FUNCTION public.campanha_copa_relatorio(
  p_ultimo_exame text DEFAULT NULL,
  p_cidade text DEFAULT NULL,
  p_jogo text DEFAULT NULL,
  p_data_inicio timestamptz DEFAULT NULL,
  p_data_fim timestamptz DEFAULT NULL,
  p_renovacao_filtro text DEFAULT NULL,
  p_assigned_to uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Sem permissão para o relatório Campanha Copa (apenas administradores)';
  END IF;

  WITH base AS (
    SELECT
      s.*,
      public.campanha_copa_resolve_company_id(s.cidade) AS company_id,
      regexp_replace(coalesce(s.cpf, ''), '\D', '', 'g') AS cpf_digits
    FROM public.campanha_copa_submissions s
    WHERE public.campanha_copa_can_view_submission(s.assigned_to)
      AND (p_ultimo_exame IS NULL OR p_ultimo_exame = '' OR s.ultimo_exame_vista = p_ultimo_exame)
      AND (
        p_cidade IS NULL OR p_cidade = ''
        OR coalesce(s.cidade, '') ILIKE '%' || p_cidade || '%'
      )
      AND (p_jogo IS NULL OR p_jogo = '' OR s.jogo = p_jogo)
      AND (p_data_inicio IS NULL OR s.created_at >= p_data_inicio)
      AND (p_data_fim IS NULL OR s.created_at <= p_data_fim)
      AND (p_assigned_to IS NULL OR s.assigned_to = p_assigned_to)
  ),
  matched AS (
    SELECT
      b.*,
      ren_same.id AS renovacao_id,
      ren_same.status AS renovacao_status,
      ren_same.data_ultima_compra,
      ren_same.ssotica_company_id AS renovacao_company_id,
      ren_same.data AS renovacao_data,
      CASE
        WHEN ren_same.id IS NOT NULL THEN 'sim'
        WHEN ren_other.id IS NOT NULL THEN 'outra_loja'
        ELSE 'nao'
      END AS renovacao_match,
      CASE
        WHEN ren_same.id IS NOT NULL THEN ren_same.match_type
        WHEN ren_other.id IS NOT NULL THEN ren_other.match_type
        ELSE NULL
      END AS renovacao_match_type,
      coalesce(ren_same.id, ren_other.id) AS renovacao_match_id,
      coalesce(ren_same.status, ren_other.status) AS renovacao_match_status,
      coalesce(ren_same.data_ultima_compra, ren_other.data_ultima_compra) AS renovacao_match_data_compra,
      coalesce(ren_same.ssotica_company_id, ren_other.ssotica_company_id) AS renovacao_match_company_id
    FROM base b
    LEFT JOIN LATERAL (
      SELECT
        r.id,
        r.status,
        r.data_ultima_compra,
        r.ssotica_company_id,
        r.data,
        CASE
          WHEN length(b.cpf_digits) >= 11
            AND public.campanha_copa_renovacao_cpf_digits(r.data) = b.cpf_digits
            THEN 'cpf'
          ELSE 'telefone'
        END AS match_type
      FROM public.crm_renovacoes r
      WHERE b.company_id IS NOT NULL
        AND r.ssotica_company_id = b.company_id
        AND coalesce(r.status, '') <> 'excluidos'
        AND (
          (
            length(b.cpf_digits) >= 11
            AND public.campanha_copa_renovacao_cpf_digits(r.data) = b.cpf_digits
          )
          OR public.cobranca_matches_inbox_phone(r.data, b.telefone)
        )
      ORDER BY
        CASE
          WHEN length(b.cpf_digits) >= 11
            AND public.campanha_copa_renovacao_cpf_digits(r.data) = b.cpf_digits
            THEN 0
          ELSE 1
        END,
        r.updated_at DESC
      LIMIT 1
    ) ren_same ON true
    LEFT JOIN LATERAL (
      SELECT
        r.id,
        r.status,
        r.data_ultima_compra,
        r.ssotica_company_id,
        r.data,
        CASE
          WHEN length(b.cpf_digits) >= 11
            AND public.campanha_copa_renovacao_cpf_digits(r.data) = b.cpf_digits
            THEN 'cpf'
          ELSE 'telefone'
        END AS match_type
      FROM public.crm_renovacoes r
      WHERE ren_same.id IS NULL
        AND coalesce(r.status, '') <> 'excluidos'
        AND (
          b.company_id IS NULL
          OR r.ssotica_company_id IS DISTINCT FROM b.company_id
        )
        AND (
          (
            length(b.cpf_digits) >= 11
            AND public.campanha_copa_renovacao_cpf_digits(r.data) = b.cpf_digits
          )
          OR public.cobranca_matches_inbox_phone(r.data, b.telefone)
        )
      ORDER BY
        CASE
          WHEN length(b.cpf_digits) >= 11
            AND public.campanha_copa_renovacao_cpf_digits(r.data) = b.cpf_digits
            THEN 0
          ELSE 1
        END,
        r.updated_at DESC
      LIMIT 1
    ) ren_other ON true
  ),
  filtered AS (
    SELECT *
    FROM matched m
    WHERE
      p_renovacao_filtro IS NULL
      OR p_renovacao_filtro = ''
      OR m.renovacao_match = p_renovacao_filtro
  ),
  metrics AS (
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE renovacao_match = 'sim')::int AS em_renovacao,
      count(*) FILTER (WHERE renovacao_match = 'nao')::int AS prospect,
      count(*) FILTER (WHERE renovacao_match = 'outra_loja')::int AS outra_loja,
      count(*) FILTER (WHERE consentimento_marketing IS TRUE)::int AS consentimento_marketing
    FROM filtered
  ),
  por_cidade AS (
    SELECT coalesce(nullif(trim(cidade), ''), 'Sem cidade') AS cidade, count(*)::int AS total
    FROM filtered
    GROUP BY 1
    ORDER BY total DESC, cidade
    LIMIT 20
  ),
  por_exame AS (
    SELECT coalesce(nullif(trim(ultimo_exame_vista), ''), 'Não informado') AS exame, count(*)::int AS total
    FROM filtered
    GROUP BY 1
    ORDER BY total DESC, exame
  ),
  rows_data AS (
    SELECT
      f.id,
      f.lead_id,
      f.nome,
      f.cpf,
      f.idade,
      f.cidade,
      f.telefone,
      f.usa_oculos,
      f.ultimo_exame_vista,
      f.jogo,
      f.jogo_label,
      f.consentimento_marketing,
      f.assigned_to,
      f.created_at,
      f.company_id,
      f.renovacao_match,
      f.renovacao_match_type,
      f.renovacao_match_id,
      f.renovacao_match_status,
      rs.label AS renovacao_status_label,
      f.renovacao_match_data_compra,
      f.renovacao_match_company_id,
      c.name AS company_name,
      c_match.name AS renovacao_company_name
    FROM filtered f
    LEFT JOIN public.crm_renovacao_statuses rs
      ON rs.key = f.renovacao_match_status
    LEFT JOIN public.companies c ON c.id = f.company_id
    LEFT JOIN public.companies c_match ON c_match.id = f.renovacao_match_company_id
    ORDER BY f.created_at DESC
    LIMIT 5000
  )
  SELECT jsonb_build_object(
    'metrics', (
      SELECT jsonb_build_object(
        'total', m.total,
        'em_renovacao', m.em_renovacao,
        'prospect', m.prospect,
        'outra_loja', m.outra_loja,
        'pct_renovacao', CASE WHEN m.total > 0 THEN round((m.em_renovacao::numeric / m.total) * 100, 1) ELSE 0 END,
        'pct_prospect', CASE WHEN m.total > 0 THEN round((m.prospect::numeric / m.total) * 100, 1) ELSE 0 END,
        'pct_outra_loja', CASE WHEN m.total > 0 THEN round((m.outra_loja::numeric / m.total) * 100, 1) ELSE 0 END,
        'consentimento_marketing', m.consentimento_marketing,
        'por_cidade', coalesce((SELECT jsonb_agg(jsonb_build_object('cidade', pc.cidade, 'total', pc.total)) FROM por_cidade pc), '[]'::jsonb),
        'por_exame', coalesce((SELECT jsonb_agg(jsonb_build_object('exame', pe.exame, 'total', pe.total)) FROM por_exame pe), '[]'::jsonb)
      )
      FROM metrics m
    ),
    'rows', coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM rows_data r), '[]'::jsonb)
  )
  INTO result;

  RETURN coalesce(result, '{"metrics":{},"rows":[]}'::jsonb);
END;
$$;

COMMENT ON FUNCTION public.campanha_copa_relatorio(text, text, text, timestamptz, timestamptz, text, uuid) IS
  'Relatório Campanha Copa com filtros e cruzamento CPF/telefone vs crm_renovacoes da loja da cidade.';

REVOKE ALL ON FUNCTION public.campanha_copa_relatorio(text, text, text, timestamptz, timestamptz, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.campanha_copa_relatorio(text, text, text, timestamptz, timestamptz, text, uuid) TO authenticated;

INSERT INTO public.role_page_permissions (role_key, page_key, allowed)
SELECT DISTINCT rp.role_key, 'campanha_copa_relatorio', (rp.role_key = 'admin')
FROM public.role_page_permissions rp
WHERE NOT EXISTS (
  SELECT 1 FROM public.role_page_permissions x
  WHERE x.role_key = rp.role_key AND x.page_key = 'campanha_copa_relatorio'
);

UPDATE public.role_page_permissions
SET allowed = (role_key = 'admin')
WHERE page_key = 'campanha_copa_relatorio';
