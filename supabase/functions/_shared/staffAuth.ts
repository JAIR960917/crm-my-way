/**
 * Autenticação de staff (admin/gerente/vendedor) e escopo por empresa.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { isInternalServiceCaller } from "./internalAuth.ts";

export type StaffUser = { id: string };

export async function getUserFromRequest(
  req: Request,
  supabaseUrl: string,
  serviceKey: string,
): Promise<{ user: StaffUser | null; response: Response | null }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return {
      user: null,
      response: new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    };
  }
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) {
    return {
      user: null,
      response: new Response(JSON.stringify({ error: "Sessão inválida" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    };
  }
  return { user: { id: user.id }, response: null };
}

export async function getUserRoles(
  admin: SupabaseClient,
  userId: string,
): Promise<string[]> {
  const { data } = await admin.from("user_roles").select("role").eq("user_id", userId);
  return (data ?? []).map((r: { role: string }) => r.role);
}

export async function getAllowedCompanyIds(
  admin: SupabaseClient,
  userId: string,
): Promise<Set<string> | "all"> {
  const roles = await getUserRoles(admin, userId);
  if (roles.includes("admin")) return "all";

  const allowed = new Set<string>();
  const { data: prof } = await admin
    .from("profiles")
    .select("company_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (prof?.company_id) allowed.add(prof.company_id as string);

  if (roles.includes("gerente")) {
    const { data: extras } = await admin
      .from("manager_companies")
      .select("company_id")
      .eq("user_id", userId);
    (extras ?? []).forEach((e: { company_id: string }) => allowed.add(e.company_id));
  }

  return allowed;
}

export function companyAllowed(
  allowed: Set<string> | "all",
  companyId: string,
): boolean {
  if (allowed === "all") return true;
  return allowed.has(companyId);
}

/** Somente administrador. */
export async function assertAdmin(
  admin: SupabaseClient,
  userId: string,
  corsHeaders: Record<string, string>,
): Promise<Response | null> {
  const roles = await getUserRoles(admin, userId);
  if (roles.includes("admin")) return null;
  return new Response(JSON.stringify({ error: "Acesso negado" }), {
    status: 403,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Admin ou gerente (painel SSótica). */
export async function assertAdminOrGerente(
  admin: SupabaseClient,
  userId: string,
  corsHeaders: Record<string, string>,
): Promise<Response | null> {
  const roles = await getUserRoles(admin, userId);
  if (roles.includes("admin") || roles.includes("gerente")) return null;
  return new Response(JSON.stringify({ error: "Acesso negado" }), {
    status: 403,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Usuário autenticado com acesso à empresa da integração. */
export async function assertCanAccessIntegration(
  admin: SupabaseClient,
  userId: string,
  integrationId: string,
  corsHeaders: Record<string, string>,
): Promise<{ response: Response | null; companyId: string | null }> {
  const { data: integ, error } = await admin
    .from("ssotica_integrations")
    .select("company_id")
    .eq("id", integrationId)
    .maybeSingle();
  if (error || !integ?.company_id) {
    return {
      response: new Response(JSON.stringify({ error: "Integração não encontrada" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }),
      companyId: null,
    };
  }
  const companyId = String(integ.company_id);
  const allowed = await getAllowedCompanyIds(admin, userId);
  if (!companyAllowed(allowed, companyId)) {
    return {
      response: new Response(JSON.stringify({ error: "Sem permissão para esta loja" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }),
      companyId: null,
    };
  }
  return { response: null, companyId };
}

export async function isAdminUser(
  admin: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const roles = await getUserRoles(admin, userId);
  return roles.includes("admin");
}

/** Admin ou cron/service_role — efeitos globais (pausar outras lojas, consolidar). */
export async function canRunGlobalSsoticaSideEffects(
  req: Request,
  admin: SupabaseClient,
): Promise<boolean> {
  if (isInternalServiceCaller(req)) return true;
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const { user, response } = await getUserFromRequest(req, supabaseUrl, serviceKey);
  if (response || !user) return false;
  return isAdminUser(admin, user.id);
}

/**
 * Valida chamadas de painel em ssotica-sync: cron/service_role passam;
 * staff exige admin (modos globais) ou escopo da integração/loja.
 */
export async function assertStaffSsoticaSyncAccess(
  req: Request,
  admin: SupabaseClient,
  corsHeaders: Record<string, string>,
  options: {
    integrationId?: string;
    requireIntegrationId?: boolean;
    adminOnly?: boolean;
  },
): Promise<Response | null> {
  if (isInternalServiceCaller(req)) return null;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const { user, response } = await getUserFromRequest(req, supabaseUrl, serviceKey);
  if (response) return response;
  if (!user) {
    return new Response(JSON.stringify({ error: "Não autenticado" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (options.adminOnly) {
    return assertAdmin(admin, user.id, corsHeaders);
  }

  const staffBlock = await assertAdminOrGerente(admin, user.id, corsHeaders);
  if (staffBlock) return staffBlock;

  if (options.requireIntegrationId && !options.integrationId) {
    return new Response(JSON.stringify({ error: "integration_id obrigatório" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (options.integrationId) {
    const { response: integBlock } = await assertCanAccessIntegration(
      admin,
      user.id,
      options.integrationId,
      corsHeaders,
    );
    if (integBlock) return integBlock;
  }

  return null;
}
