// Edge Function: cora-consultar-fatura
// DEBUG: devolve o JSON bruto de uma fatura na Cora (GET /v2/invoices/{id}).
// Uso temporário para investigar por que valor_pago não reflete juros/multa
// de pagamento em atraso (a sincronização só grava paid_amount/payment.amount
// quando a Cora realmente envia esses campos — este endpoint mostra a
// resposta completa para conferir o nome certo do campo).
// Auth: admin logado, Bearer SERVICE_ROLE_KEY ou x-cron-secret = CRON_SECRET

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CORA_BASE = "https://matls-clients.api.cora.com.br";
const CORA_TOKEN_URL = `${CORA_BASE}/token`;
const CORA_INVOICE_URL = (id: string) => `${CORA_BASE}/v2/invoices/${id}`;

async function checkAuth(req: Request): Promise<{ ok: boolean; status?: number; error?: string }> {
  const cronSecret = Deno.env.get("CRON_SECRET");
  const headerSecret = req.headers.get("x-cron-secret");
  if (cronSecret && headerSecret === cronSecret) return { ok: true };

  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return { ok: false, status: 401, error: "Unauthorized" };

  const token = auth.slice(7);
  if (token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) return { ok: true };

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: auth } } },
  );
  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData?.user) return { ok: false, status: 401, error: "Unauthorized" };

  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id);
  if (!roles?.some((r) => r.role === "admin")) {
    return { ok: false, status: 403, error: "Apenas administradores" };
  }
  return { ok: true };
}

function buildPemCandidates(raw: string): string[] {
  const out = new Set<string>();
  const add = (value: string | null | undefined) => {
    if (!value) return;
    let s = value.trim().replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    if (!s.endsWith("\n")) s += "\n";
    out.add(s);
  };
  add(raw);
  add(raw.replace(/\\n/g, "\n"));
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === "string") add(parsed);
  } catch { /* ignore */ }
  return [...out];
}

async function createCoraClient(
  admin: ReturnType<typeof createClient>,
  empresaId: string | null,
  empresaSlug: string,
) {
  let dbCreds: {
    cora_client_id?: string | null;
    cora_certificate?: string | null;
    cora_private_key?: string | null;
  } | null = null;

  if (empresaId) {
    const { data } = await admin
      .from("crediario_company_credentials")
      .select("cora_client_id, cora_certificate, cora_private_key")
      .eq("company_id", empresaId)
      .maybeSingle();
    dbCreds = data;
  }

  const suffix = empresaSlug ? `_${empresaSlug}` : "";
  const clientId = dbCreds?.cora_client_id || Deno.env.get(`CORA_CLIENT_ID${suffix}`) || Deno.env.get("CORA_CLIENT_ID");
  const certPem = dbCreds?.cora_certificate || Deno.env.get(`CORA_CERTIFICATE${suffix}`) || Deno.env.get("CORA_CERTIFICATE");
  const keyPem = dbCreds?.cora_private_key || Deno.env.get(`CORA_PRIVATE_KEY${suffix}`) || Deno.env.get("CORA_PRIVATE_KEY");

  if (!clientId || !certPem || !keyPem) {
    throw new Error(`Credenciais Cora ausentes${empresaSlug ? ` (${empresaSlug})` : ""}`);
  }

  let httpClient: Deno.HttpClient | null = null;
  let lastErr = "";
  for (const cert of buildPemCandidates(certPem)) {
    for (const key of buildPemCandidates(keyPem)) {
      try { httpClient = Deno.createHttpClient({ cert, key }); } catch (e) {
        lastErr = e instanceof Error ? e.message : String(e);
      }
      if (httpClient) break;
    }
    if (httpClient) break;
  }
  if (!httpClient) throw new Error(`mTLS: ${lastErr}`);

  const tokenResp = await fetch(CORA_TOKEN_URL, {
    method: "POST",
    // @ts-ignore
    client: httpClient,
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId }),
  });
  const tokenText = await tokenResp.text();
  if (!tokenResp.ok) throw new Error(`Auth Cora ${tokenResp.status}: ${tokenText.slice(0, 200)}`);

  return {
    httpClient,
    accessToken: JSON.parse(tokenText).access_token as string,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authResult = await checkAuth(req);
    if (!authResult.ok) return json({ ok: false, error: authResult.error ?? "Unauthorized" }, authResult.status ?? 401);

    const body = (await req.json().catch(() => ({}))) as { invoice_id?: string; company_id?: string };
    const invoiceId = (body.invoice_id ?? "").trim();
    if (!invoiceId) return json({ ok: false, error: "invoice_id é obrigatório" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Descobre a empresa da fatura (para usar as credenciais Cora certas),
    // a não ser que tenha sido informada explicitamente.
    let empresaId = body.company_id ?? null;
    if (!empresaId) {
      const { data: parcela } = await admin
        .from("crediario_parcelas")
        .select("company_id")
        .eq("cora_invoice_id", invoiceId)
        .maybeSingle();
      empresaId = parcela?.company_id ?? null;
    }

    let empresaSlug = "";
    if (empresaId) {
      const { data: emp } = await admin.from("companies").select("name").eq("id", empresaId).maybeSingle();
      empresaSlug = emp?.name ?? "";
    }

    const { httpClient, accessToken } = await createCoraClient(admin, empresaId, empresaSlug);

    const resp = await fetch(CORA_INVOICE_URL(invoiceId), {
      method: "GET",
      // @ts-ignore
      client: httpClient,
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    });
    const text = await resp.text();
    let raw: unknown = text;
    try { raw = JSON.parse(text); } catch { /* mantém texto bruto */ }

    return json({ ok: resp.ok, status: resp.status, company_id: empresaId, raw });
  } catch (err) {
    console.error("cora-consultar-fatura error", err);
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
