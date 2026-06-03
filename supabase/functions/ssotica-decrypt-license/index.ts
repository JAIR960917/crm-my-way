/**
 * Substitui RPC admin_decrypt_license (revogada para authenticated).
 * Apenas admin; descriptografa license_code para edição no painel.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeadersFor } from "../_shared/cors.ts";
import {
  assertAdmin,
  assertCanAccessIntegration,
  getUserFromRequest,
} from "../_shared/staffAuth.ts";

Deno.serve(async (req) => {
  const corsHeaders = corsHeadersFor(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const integrationId = body.integration_id as string | undefined;
    if (!integrationId) {
      return new Response(
        JSON.stringify({ error: "integration_id é obrigatório" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

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

    const { response: integBlock } = await assertCanAccessIntegration(
      admin,
      user!.id,
      integrationId,
      corsHeaders,
    );
    if (integBlock) return integBlock;

    const { data: integ, error } = await admin
      .from("ssotica_integrations")
      .select("license_code")
      .eq("id", integrationId)
      .maybeSingle();

    if (error) throw error;
    if (!integ) {
      return new Response(JSON.stringify({ error: "Integração não encontrada" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let license = (integ.license_code ?? "").trim();
    if (license.startsWith("enc:")) {
      const { data: dec, error: decErr } = await admin.rpc("decrypt_secret", {
        _ciphertext: license,
      });
      if (decErr) throw decErr;
      if (typeof dec !== "string") {
        return new Response(
          JSON.stringify({ error: "Não foi possível descriptografar a licença" }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      license = dec;
    }

    return new Response(JSON.stringify({ license_code: license }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ssotica-decrypt-license:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro interno" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
