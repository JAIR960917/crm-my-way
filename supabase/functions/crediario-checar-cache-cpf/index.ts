// Edge Function: crediario-checar-cache-cpf
// Checa se já existe um relatório Serasa em cache (válido) para um CPF
// específico, devolvendo SÓ o nome — usado pelas telas de Pagamento na
// Entrega e Renegociação para evitar reconsultar a Serasa desnecessariamente.
//
// Existe porque crediario_consultas_cache guarda o relatório de crédito
// COMPLETO (score, pendências, raw da Serasa) de qualquer CPF já consultado
// por qualquer loja — RLS restringe o SELECT direto a admin/gerente/
// financeiro (ver migration 20260703130000). Vendedores continuam
// precisando checar "esse CPF já foi consultado?" no fluxo de venda, então
// essa função (com service role) devolve só o campo mínimo necessário.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function onlyDigits(s: string) {
  return (s || "").replace(/\D/g, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: userErr } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const cpf = onlyDigits(body?.cpf ?? "");
    if (cpf.length !== 11) return json({ error: "CPF inválido" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data, error } = await admin
      .from("crediario_consultas_cache")
      .select("nome")
      .eq("cpf", cpf)
      .gt("expira_em", new Date().toISOString())
      .not("nome", "is", null)
      .order("consultado_em", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return json({ error: error.message }, 500);

    return json({ nome: data?.nome ?? null });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
