import { corsHeadersFor } from "../_shared/cors.ts";
Deno.serve(async (req) => {
  const corsHeaders = corsHeadersFor(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  return new Response(
    JSON.stringify({ error: "Esta função foi desativada." }),
    { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
