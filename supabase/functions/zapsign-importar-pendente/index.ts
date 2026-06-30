// Edge Function: zapsign-importar-pendente
// Cria um novo registro em crediario_contracts a partir de um documento já
// assinado na ZapSign que não tem nenhum contrato local correspondente
// (tipicamente documentos assinados no sistema antigo, antes da unificação).
// Body: { token: string } — token do documento na ZapSign

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function zapsignBase() {
  const env = (Deno.env.get("ZAPSIGN_ENV") || "sandbox").toLowerCase();
  return env.startsWith("prod")
    ? "https://api.zapsign.com.br"
    : "https://sandbox.api.zapsign.com.br";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ ok: false, error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !userData?.user) return json({ ok: false, error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: roleRows } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .in("role", ["admin", "gerente", "financeiro"]);
    if (!roleRows || roleRows.length === 0) {
      return json({ ok: false, error: "Sem permissão" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const docToken: string | undefined = body?.token;
    if (!docToken) return json({ ok: false, error: "token obrigatório" }, 400);

    // Evita duplicar caso já exista um contrato com esse documento
    const { data: existente } = await admin
      .from("crediario_contracts")
      .select("id")
      .eq("signature_external_id", docToken)
      .maybeSingle();
    if (existente) {
      return json({ ok: false, error: "Já existe um contrato local para este documento", contrato_id: existente.id }, 409);
    }

    const apiToken = Deno.env.get("ZAPSIGN_API_TOKEN");
    if (!apiToken) return json({ ok: false, error: "ZAPSIGN_API_TOKEN não configurado" }, 500);

    const resp = await fetch(`${zapsignBase()}/api/v1/docs/${docToken}/`, {
      headers: { Authorization: `Bearer ${apiToken}`, Accept: "application/json" },
    });
    const text = await resp.text();
    const doc = (() => { try { return JSON.parse(text); } catch { return null; } })();
    if (!resp.ok || !doc) {
      return json({ ok: false, error: `ZapSign HTTP ${resp.status}: ${text.slice(0, 200)}` }, 502);
    }

    const signer = Array.isArray(doc.signers) ? doc.signers[0] : null;
    const nome: string = signer?.name || doc.name || "Sem nome";
    const cpf: string = signer?.cpf || "";
    const telefone: string = [signer?.phone_country, signer?.phone_number].filter(Boolean).join(" ");
    const signedAt: string | null = doc.last_update_date ?? doc.created_at ?? null;

    const insertPayload = {
      user_id: userId,
      cpf,
      nome,
      endereco: "",
      telefone,
      content: `Documento importado da ZapSign (sistema antigo). Nome do documento: ${doc.name ?? ""}`.trim(),
      status: "assinado",
      signature_provider: "zapsign",
      signature_external_id: docToken,
      signature_url: signer?.sign_url ?? null,
      signature_data: { raw: doc, signed_file: doc.signed_file ?? null, imported: true, imported_at: new Date().toISOString(), imported_by: userId },
      signed_at: signedAt,
    };

    const { data: inserted, error: insertErr } = await admin
      .from("crediario_contracts")
      .insert(insertPayload)
      .select("*")
      .single();
    if (insertErr) return json({ ok: false, error: insertErr.message }, 500);

    return json({ ok: true, contrato: inserted });
  } catch (err) {
    console.error("zapsign-importar-pendente error", err);
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
