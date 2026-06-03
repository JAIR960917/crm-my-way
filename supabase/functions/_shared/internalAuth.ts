export const internalCorsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

function extractBearerToken(req: Request): string {
  return (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** @deprecated Prefer hasValidServiceRoleKey — só para bloqueio de anon em jwtGate. */
export function decodeJwtRole(authHeader: string): string | null {
  try {
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    const payloadPart = token.split(".")[1];
    if (!payloadPart) return null;
    const padded = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(atob(padded));
    return typeof json?.role === "string" ? json.role : null;
  } catch {
    return null;
  }
}

export function hasValidCronSecret(req: Request): boolean {
  const cronSecret = Deno.env.get("CRON_SECRET");
  const providedSecret = req.headers.get("x-cron-secret");
  return !!(cronSecret && providedSecret && timingSafeEqual(providedSecret, cronSecret));
}

/** Compara o Bearer com SUPABASE_SERVICE_ROLE_KEY (não confia só no claim JWT). */
export function hasValidServiceRoleKey(req: Request): boolean {
  const expected = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!expected) return false;
  const token = extractBearerToken(req);
  if (!token) return false;
  return timingSafeEqual(token, expected);
}

/**
 * Apenas cron interno (x-cron-secret) ou Bearer idêntico à service role key.
 * Rejeita anon/authenticated e JWTs forjados com role=service_role.
 */
export function assertCronOrServiceRole(
  req: Request,
  corsHeaders: Record<string, string> = internalCorsHeaders,
): Response | null {
  if (hasValidCronSecret(req)) return null;
  if (hasValidServiceRoleKey(req)) return null;

  return new Response(
    JSON.stringify({
      error: "Unauthorized",
      detail: "Requer JWT service_role ou header x-cron-secret",
    }),
    {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
}

/** Cron interno ou Bearer service role — bypass de escopo por loja nas edge functions. */
export function isInternalServiceCaller(req: Request): boolean {
  return hasValidCronSecret(req) || hasValidServiceRoleKey(req);
}

type SupabaseAdmin = {
  auth: { getUser: (token: string) => Promise<{ data: { user: { id: string } | null } }> };
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => Promise<{ data: { role: string }[] | null }>;
    };
  };
};

/** Cron/service_role OU usuário autenticado admin/gerente (painel). */
export async function assertCronServiceRoleOrStaff(
  req: Request,
  supabaseAdmin: SupabaseAdmin,
  corsHeaders: Record<string, string> = internalCorsHeaders,
): Promise<Response | null> {
  const cronGate = assertCronOrServiceRole(req, corsHeaders);
  if (!cronGate) return null;

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return cronGate;

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return cronGate;

  const { data: roles } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);

  const allowed = (roles || []).some((r) => r.role === "admin" || r.role === "gerente");
  if (!allowed) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  return null;
}
