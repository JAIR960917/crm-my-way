
-- ============================================================
-- 1) REVOGAR acesso a funções SECURITY DEFINER sensíveis
-- ============================================================

-- Funções de uso interno/trigger/admin/cron: revogar de anon E authenticated
DO $$
DECLARE
  f text;
  fns text[] := ARRAY[
    'public._encrypt_ssotica_secrets()',
    'public._get_encryption_key()',
    'public.encrypt_secret(text)',
    'public.decrypt_secret(text)',
    'public.admin_decrypt_license(uuid)',
    'public._export_auth_identities_full()',
    'public._export_auth_password_hashes()',
    'public._export_auth_users_full()',
    'public._log_cobranca_status_change_activity()',
    'public._log_lead_status_change_activity()',
    'public._log_renovacao_status_change_activity()',
    'public._reset_gatilho_on_status_change()',
    'public._trg_reclassify_on_mapping_change()',
    'public.crm_cobranca_statuses_propagate_key_change()',
    'public.crm_cobranca_statuses_sync_key_before_update()',
    'public.handle_new_user()',
    'public.prevent_self_role_assignment()',
    'public.manage_ssotica_cron()',
    'public.manage_whatsapp_cron()',
    'public.ssotica_enqueue_sync(text, text, uuid, boolean)',
    'public.delete_all_leads_cascade()',
    'public.delete_leads_duplicated_with_renovacoes()',
    'public.delete_duplicate_leads(uuid[])',
    'public.get_ssotica_credentials(uuid)',
    'public.reclassify_cobrancas_by_situacao()'
  ];
BEGIN
  FOREACH f IN ARRAY fns LOOP
    BEGIN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXCEPTION WHEN undefined_function THEN
      RAISE NOTICE 'Função % não existe, pulando', f;
    END;
  END LOOP;
END $$;

-- Funções utilitárias seguras: revogar de anon, manter authenticated
DO $$
DECLARE
  f text;
  fns text[] := ARRAY[
    'public.has_role(uuid, app_role)',
    'public.is_my_company(uuid)',
    'public.is_same_company(uuid)',
    'public.get_my_company_id()',
    'public.get_company_user_ids()',
    'public.current_user_empresa_id()',
    'public.can_access_renovacao(uuid)',
    'public.find_lead_by_phone(text)',
    'public.get_profile_names()',
    'public.soft_delete_lead(uuid)',
    'public.soft_delete_renovacao(uuid)'
  ];
BEGIN
  FOREACH f IN ARRAY fns LOOP
    BEGIN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
    EXCEPTION WHEN undefined_function THEN
      RAISE NOTICE 'Função % não existe, pulando', f;
    END;
  END LOOP;
END $$;

-- ============================================================
-- 2) Corrigir política de UPDATE em crm_renovacoes
--    Remove o brecha que permitia qualquer usuário marcar como
--    'excluidos' via WITH CHECK fraco
-- ============================================================
DROP POLICY IF EXISTS "Users can update renovacoes" ON public.crm_renovacoes;

CREATE POLICY "Users can update renovacoes"
ON public.crm_renovacoes
FOR UPDATE
TO authenticated
USING (
  status <> 'excluidos'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR assigned_to = auth.uid()
    OR created_by = auth.uid()
    OR (
      has_role(auth.uid(), 'gerente'::app_role)
      AND (
        assigned_to IN (SELECT get_company_user_ids())
        OR created_by IN (SELECT get_company_user_ids())
        OR (ssotica_company_id IS NOT NULL AND is_my_company(ssotica_company_id))
      )
    )
  )
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR assigned_to = auth.uid()
  OR created_by = auth.uid()
  OR (
    has_role(auth.uid(), 'gerente'::app_role)
    AND (
      assigned_to IN (SELECT get_company_user_ids())
      OR created_by IN (SELECT get_company_user_ids())
      OR (ssotica_company_id IS NOT NULL AND is_my_company(ssotica_company_id))
    )
  )
);

-- Corrigir também crm_leads "Creators can update own leads" e "Vendedores can update assigned leads"
-- que tinham o mesmo padrão de brecha
DROP POLICY IF EXISTS "Creators can update own leads" ON public.crm_leads;
CREATE POLICY "Creators can update own leads"
ON public.crm_leads
FOR UPDATE
TO authenticated
USING (created_by = auth.uid() AND status <> 'excluidos')
WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "Vendedores can update assigned leads" ON public.crm_leads;
CREATE POLICY "Vendedores can update assigned leads"
ON public.crm_leads
FOR UPDATE
TO authenticated
USING (assigned_to = auth.uid() AND status <> 'excluidos')
WITH CHECK (assigned_to = auth.uid());

-- Observação: a política "Users can soft-delete visible leads/renovacoes" já
-- existe e cuida especificamente da transição para 'excluidos' com checagem
-- adequada, então não precisa do bypass nas políticas acima.

-- ============================================================
-- 3) Criptografar tokens SSÓtica que ainda estejam em texto puro
-- ============================================================
UPDATE public.ssotica_integrations
SET bearer_token = public.encrypt_secret(bearer_token)
WHERE bearer_token IS NOT NULL
  AND bearer_token <> ''
  AND bearer_token NOT LIKE 'enc:%';

UPDATE public.ssotica_integrations
SET license_code = public.encrypt_secret(license_code)
WHERE license_code IS NOT NULL
  AND license_code <> ''
  AND license_code NOT LIKE 'enc:%';
