import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-bootstrap-secret",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const bootstrapSecret = Deno.env.get("SEED_ADMIN_SECRET") || "";
  const provided = req.headers.get("x-bootstrap-secret") || "";
  if (!bootstrapSecret || bootstrapSecret.length < 16 || provided !== bootstrapSecret) {
    return new Response(JSON.stringify({ error: "Bootstrap não autorizado" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { email, password, full_name } = await req.json();

  if (!email || !password) {
    return new Response(JSON.stringify({ error: "Email e senha são obrigatórios" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: existingAdmins } = await supabaseAdmin
    .from("user_roles")
    .select("id")
    .eq("role", "admin")
    .limit(1);

  if (existingAdmins && existingAdmins.length > 0) {
    return new Response(
      JSON.stringify({
        error: "Admin já existe",
        detail: "Use o login normal no CRM. seed-admin só cria o primeiro administrador.",
      }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  if (email.length > 254 || password.length < 8 || password.length > 128) {
    return new Response(JSON.stringify({ error: "Email ou senha inválidos" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: user, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: full_name || "Admin Principal" },
  });

  if (error) {
    return new Response(JSON.stringify({ error: "Falha ao criar usuário" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  await supabaseAdmin.from("user_roles").insert({
    user_id: user.user.id,
    role: "admin",
  });

  return new Response(JSON.stringify({ message: "Admin criado com sucesso" }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
