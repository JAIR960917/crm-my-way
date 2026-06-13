-- Corrige campanha_copa_relatorio: join indexado (sem cobranca_matches_inbox_phone por linha)
-- e jsonb explícito (evita falha com to_jsonb(record)).

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
VOLATILE
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

  WITH renovacoes_idx AS (
    SELECT
      r.id,
      r.status,
      r.data_ultima_compra,
      r.ssotica_company_id,
      public.campanha_copa_renovacao_cpf_digits(r.data) AS cpf_digits,
      public.normalize_br_mobile_digits(public.cobranca_data_phone_digits(r.data)) AS phone_digits,
      r.updated_at
    FROM public.crm_renovacoes r
    WHERE coalesce(r.status, '') <> 'excluidos'
  ),
  base AS (
    SELECT
      s.id,
      s.lead_id,
      s.nome,
      s.cpf,
      s.idade,
      s.cidade,
      s.telefone,
      s.usa_oculos,
      s.ultimo_exame_vista,
      s.jogo,
      s.jogo_label,
      s.consentimento_marketing,
      s.assigned_to,
      s.created_at,
      public.campanha_copa_resolve_company_id(s.cidade) AS company_id,
      regexp_replace(coalesce(s.cpf, ''), '\D', '', 'g') AS cpf_digits,
      public.normalize_br_mobile_digits(s.telefone) AS phone_digits
    FROM public.campanha_copa_submissions s
    WHERE (p_ultimo_exame IS NULL OR p_ultimo_exame = '' OR s.ultimo_exame_vista = p_ultimo_exame)
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
      CASE
        WHEN ren_same.id IS NOT NULL THEN 'sim'
        WHEN ren_other.id IS NOT NULL THEN 'outra_loja'
        ELSE 'nao'
      END AS renovacao_match,
      coalesce(ren_same.match_type, ren_other.match_type) AS renovacao_match_type,
      coalesce(ren_same.id, ren_other.id) AS renovacao_match_id,
      coalesce(ren_same.status, ren_other.status) AS renovacao_match_status,
      coalesce(ren_same.data_ultima_compra, ren_other.data_ultima_compra) AS renovacao_match_data_compra,
      coalesce(ren_same.ssotica_company_id, ren_other.ssotica_company_id) AS renovacao_match_company_id
    FROM base b
    LEFT JOIN LATERAL (
      SELECT
        ri.id,
        ri.status,
        ri.data_ultima_compra,
        ri.ssotica_company_id,
        CASE
          WHEN length(b.cpf_digits) >= 11 AND ri.cpf_digits = b.cpf_digits THEN 'cpf'
          ELSE 'telefone'
        END AS match_type
      FROM renovacoes_idx ri
      WHERE b.company_id IS NOT NULL
        AND ri.ssotica_company_id = b.company_id
        AND (
          (length(b.cpf_digits) >= 11 AND ri.cpf_digits = b.cpf_digits)
          OR (
            length(b.phone_digits) >= 10
            AND length(ri.phone_digits) >= 10
            AND ri.phone_digits = b.phone_digits
          )
        )
      ORDER BY
        CASE
          WHEN length(b.cpf_digits) >= 11 AND ri.cpf_digits = b.cpf_digits THEN 0
          ELSE 1
        END,
        ri.updated_at DESC
      LIMIT 1
    ) ren_same ON true
    LEFT JOIN LATERAL (
      SELECT
        ri.id,
        ri.status,
        ri.data_ultima_compra,
        ri.ssotica_company_id,
        CASE
          WHEN length(b.cpf_digits) >= 11 AND ri.cpf_digits = b.cpf_digits THEN 'cpf'
          ELSE 'telefone'
        END AS match_type
      FROM renovacoes_idx ri
      WHERE ren_same.id IS NULL
        AND (
          b.company_id IS NULL
          OR ri.ssotica_company_id IS DISTINCT FROM b.company_id
        )
        AND (
          (length(b.cpf_digits) >= 11 AND ri.cpf_digits = b.cpf_digits)
          OR (
            length(b.phone_digits) >= 10
            AND length(ri.phone_digits) >= 10
            AND ri.phone_digits = b.phone_digits
          )
        )
      ORDER BY
        CASE
          WHEN length(b.cpf_digits) >= 11 AND ri.cpf_digits = b.cpf_digits THEN 0
          ELSE 1
        END,
        ri.updated_at DESC
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
  ),
  por_exame AS (
    SELECT coalesce(nullif(trim(ultimo_exame_vista), ''), 'Não informado') AS exame, count(*)::int AS total
    FROM filtered
    GROUP BY 1
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
        'por_cidade', coalesce((
          SELECT jsonb_agg(jsonb_build_object('cidade', pc.cidade, 'total', pc.total) ORDER BY pc.total DESC, pc.cidade)
          FROM por_cidade pc
        ), '[]'::jsonb),
        'por_exame', coalesce((
          SELECT jsonb_agg(jsonb_build_object('exame', pe.exame, 'total', pe.total) ORDER BY pe.total DESC, pe.exame)
          FROM por_exame pe
        ), '[]'::jsonb)
      )
      FROM metrics m
    ),
    'rows', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', r.id,
          'lead_id', r.lead_id,
          'nome', r.nome,
          'cpf', r.cpf,
          'idade', r.idade,
          'cidade', r.cidade,
          'telefone', r.telefone,
          'usa_oculos', r.usa_oculos,
          'ultimo_exame_vista', r.ultimo_exame_vista,
          'jogo', r.jogo,
          'jogo_label', r.jogo_label,
          'consentimento_marketing', r.consentimento_marketing,
          'assigned_to', r.assigned_to,
          'created_at', r.created_at,
          'company_id', r.company_id,
          'company_name', r.company_name,
          'renovacao_match', r.renovacao_match,
          'renovacao_match_type', r.renovacao_match_type,
          'renovacao_match_id', r.renovacao_match_id,
          'renovacao_match_status', r.renovacao_match_status,
          'renovacao_status_label', r.renovacao_status_label,
          'renovacao_match_data_compra', r.renovacao_match_data_compra,
          'renovacao_match_company_id', r.renovacao_match_company_id,
          'renovacao_company_name', r.renovacao_company_name
        )
        ORDER BY r.created_at DESC
      )
      FROM rows_data r
    ), '[]'::jsonb)
  )
  INTO result;

  RETURN coalesce(result, '{"metrics":{},"rows":[]}'::jsonb);
END;
$$;

CREATE INDEX IF NOT EXISTS idx_crm_renovacoes_company_updated_active
  ON public.crm_renovacoes (ssotica_company_id, updated_at DESC)
  WHERE coalesce(status, '') <> 'excluidos';
