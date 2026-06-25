-- =========================================================================
-- SECURITY HARDENING
-- =========================================================================

-- 1) companies: restringir SELECT à empresa do usuário
DROP POLICY IF EXISTS "All authenticated can view companies" ON public.companies;

CREATE POLICY "Scoped company visibility"
ON public.companies
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.is_my_company(id)
);

-- 2) user_roles: impedir gerentes de gravar role_key arbitrário
DROP POLICY IF EXISTS "Gerentes can update to vendedor only" ON public.user_roles;

CREATE POLICY "Gerentes can update to vendedor only"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'gerente'::app_role)
  AND role = 'vendedor'::app_role
)
WITH CHECK (
  public.has_role(auth.uid(), 'gerente'::app_role)
  AND role = 'vendedor'::app_role
  AND (role_key IS NULL OR role_key = 'vendedor')
);

-- 3) Realtime: bloquear inscrições não autorizadas em canais
-- realtime.messages não existe em todas as versões do servidor Realtime
-- self-hosted (esquema interno dele) — só aplica se a tabela existir.
DO $do$
BEGIN
  IF to_regclass('realtime.messages') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Authenticated can subscribe to own scoped topics" ON realtime.messages';
    EXECUTE 'DROP POLICY IF EXISTS "Block realtime by default for authenticated" ON realtime.messages';
    -- Bloqueia tudo por padrão. Quem precisa de realtime escuta via REST/polling
    -- ou cria políticas específicas por tópico depois.
    EXECUTE $sql$
      CREATE POLICY "Block realtime by default for authenticated"
      ON realtime.messages
      FOR SELECT
      TO authenticated
      USING (false)
    $sql$;
  END IF;
END;
$do$;

-- 4) Revogar EXECUTE público de funções SECURITY DEFINER administrativas
-- Algumas dessas funções podem não existir ainda (ex: helpers de export que
-- só são criados condicionalmente em certas versões do GoTrue self-hosted).
-- REVOKE numa função inexistente quebraria a migration inteira, então cada
-- uma só é revogada se to_regprocedure() encontrar a assinatura exata.
DO $do$
DECLARE
  fn text;
  fns text[] := ARRAY[
    'public.delete_all_leads_cascade()',
    'public.delete_duplicate_leads(uuid[])',
    'public.admin_decrypt_license(uuid)',
    'public.get_ssotica_credentials(uuid)',
    'public.encrypt_secret(text)',
    'public.decrypt_secret(text)',
    'public._get_encryption_key()',
    'public._export_auth_users_full()',
    'public._export_auth_identities_full()',
    'public._export_auth_password_hashes()',
    'public.reclassify_cobrancas_by_situacao()',
    'public.ssotica_enqueue_sync(text, text, uuid, boolean)',
    'public.manage_whatsapp_cron()',
    'public.manage_ssotica_cron()'
  ];
  fns_anon_only text[] := ARRAY[
    'public.get_profile_names()',
    'public.find_lead_by_phone(text)',
    'public.soft_delete_lead(uuid)',
    'public.soft_delete_renovacao(uuid)'
  ];
BEGIN
  FOREACH fn IN ARRAY fns LOOP
    IF to_regprocedure(fn) IS NOT NULL THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon, authenticated', fn);
    END IF;
  END LOOP;
  FOREACH fn IN ARRAY fns_anon_only LOOP
    IF to_regprocedure(fn) IS NOT NULL THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', fn);
    END IF;
  END LOOP;
END;
$do$;