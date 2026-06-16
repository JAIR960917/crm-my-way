/**
 * ssotica-financeiro
 * Proxy unificado para os endpoints financeiros do SSótica:
 *   - contas_receber  → /financeiro/contas-a-receber/periodo
 *   - contas_pagar    → /financeiro/contas-a-pagar/periodo
 *   - fluxo_caixa     → /financeiro/fluxo-caixa/periodo
 *   - recebimentos_cartao → /financeiro/recebimentos-cartao/periodo
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SSOTICA_BASE = "https://app.ssotica.com.br/api/v1/integracoes";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TIPO_ENDPOINT: Record<string, string> = {
  contas_receber: "financeiro/contas-a-receber/periodo",
  contas_pagar: "financeiro/contas-a-pagar/periodo",
  fluxo_caixa: "financeiro/fluxo-caixa/periodo",
  recebimentos_cartao: "financeiro/recebimentos-cartao/periodo",
};

async function decryptToken(supabase: ReturnType<typeof createClient>, raw: string): Promise<string> {
  if (!raw.startsWith("enc:")) return raw;
  const { data } = await supabase.rpc("decrypt_secret", { _ciphertext: raw });
  return typeof data === "string" ? data : raw;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Não autenticado" }, 401);

    const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) return json({ error: "Não autenticado" }, 401);

    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    const isAdmin = (roles || []).some((r: any) => r.role === "admin");
    const isGerente = (roles || []).some((r: any) => r.role === "gerente");
    if (!isAdmin && !isGerente) return json({ error: "Acesso negado" }, 403);

    const body = await req.json();
    const { tipo, companyId, startDate, endDate, page = 1, perPage = 100 } = body as {
      tipo: string;
      companyId: string;
      startDate: string;
      endDate: string;
      page?: number;
      perPage?: number;
    };

    if (!tipo || !companyId || !startDate || !endDate) {
      return json({ error: "tipo, companyId, startDate e endDate são obrigatórios" }, 400);
    }

    const endpoint = TIPO_ENDPOINT[tipo];
    if (!endpoint) return json({ error: `Tipo inválido: ${tipo}` }, 400);

    const { data: integ, error: integErr } = await supabase
      .from("ssotica_integrations")
      .select("company_id, cnpj, bearer_token, is_active")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .maybeSingle();

    if (integErr || !integ) {
      return json({ data: [], total: 0, warning: "Integração SSótica não encontrada para esta empresa" });
    }

    const token = await decryptToken(supabase, integ.bearer_token);
    const cnpj = (integ.cnpj || "").replace(/\D/g, "");

    const url = `${SSOTICA_BASE}/${endpoint}?cnpj=${encodeURIComponent(cnpj)}&inicio_periodo=${startDate}&fim_periodo=${endDate}&page=${page}&perPage=${perPage}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return json({ error: `SSótica ${res.status}: ${txt.slice(0, 300)}` }, 502);
    }

    const ssoticaData = await res.json().catch(() => ({}));

    // Normaliza resposta: SSótica pode retornar array direto ou { data: [], total: N, ... }
    const rows: unknown[] = Array.isArray(ssoticaData)
      ? ssoticaData
      : Array.isArray(ssoticaData?.data)
      ? ssoticaData.data
      : [];

    const total: number = typeof ssoticaData?.total === "number"
      ? ssoticaData.total
      : rows.length;

    const totalPages: number = typeof ssoticaData?.last_page === "number"
      ? ssoticaData.last_page
      : Math.ceil(total / perPage) || 1;

    return json({ data: rows, total, totalPages, currentPage: page, raw: ssoticaData });
  } catch (err) {
    console.error("[ssotica-financeiro]", err);
    return json({ error: (err as Error).message || "Erro interno" }, 500);
  }
});
