/**
 * Substitui RPC manage_ssotica_cron (revogada para authenticated).
 * Garante que jobs automáticos legados do SSótica permaneçam desligados (NO-OP no banco).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeadersFor } from "../_shared/cors.ts";
import { assertAdmin, getUserFromRequest } from "../_shared/staffAuth.ts";

Deno.serve(async (req) => {
  const corsHeaders = corsHeadersFor(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const { user, response: authResp } = await getUserFromRequest(
      req,
      supabaseUrl,
      serviceKey,
    );
    if (authResp) return authResp;

    const adminBlock = await assertAdmin(admin, user!.id, corsHeaders);
    if (adminBlock) return adminBlock;

    const { error } = await admin.rpc("manage_ssotica_cron");
    if (error) throw error;

    return new Response(
      JSON.stringify({
        ok: true,
        message:
          "Sincronização automática permanece desativada; crons legados foram removidos se existiam.",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    console.error("ssotica-unschedule-cron:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro interno" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
