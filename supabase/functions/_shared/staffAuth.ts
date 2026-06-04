/**
 * Autenticação de staff (admin/gerente/vendedor) e escopo por empresa.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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
  const admin = createClient(supabaseUrl, serviceKey);
  const { data: { user }, error } = await admin.auth.getUser(token);
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
