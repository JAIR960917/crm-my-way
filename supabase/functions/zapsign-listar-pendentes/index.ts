// Edge Function: zapsign-listar-pendentes
// Lista na ZapSign todos os documentos com status "signed" que ainda não estão
// marcados como "assinado" no sistema local (crediario_contracts).
//
// Lógica:
//   1. Percorre GET /api/v1/docs/?status=signed com paginação até trazer tudo.
//   2. Coleta os tokens ZapSign de todos os contratos locais com status="assinado".
//   3. Retorna os docs ZapSign cujo token NÃO está nesse conjunto — são os
//      "assinados lá mas não aqui".
//
// Body: {} (sem parâmetros obrigatórios)
// Retorno: { ok, pendentes: Array<{ token, open_id, name, external_id, signed_at, contrato_id? }> }

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

interface ZapDoc {
  token: string;
  open_id: number;
  name: string;
  status: string;
  external_id: string | null;
  signed_file: string | null;
  created_at: string | null;
  last_update_date: string | null;
}

async function fetchAllSignedDocs(apiToken: string): Promise<ZapDoc[]> {
  const base = zapsignBase();
  const all: ZapDoc[] = [];
  let page = 1;

  while (true) {
    const resp = await fetch(
      `${base}/api/v1/docs/?status=signed&page=${page}&page_size=50`,
      {
        headers: { Authorization: `Bearer ${apiToken}`, Accept: "application/json" },
      },
    );
    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      throw new Error(`ZapSign HTTP ${resp.status}: ${txt.slice(0, 200)}`);
    }
    const body = await resp.json().catch(() => null);

    // A ZapSign pode retornar { results: [...], next: "..." } ou array direto
    const results: ZapDoc[] = Array.isArray(body)
      ? body
      : (Array.isArray(body?.results) ? body.results : []);

    all.push(...results);

    // Para se não houver próxima página
    const hasMore = Array.isArray(body?.results) && body?.next != null;
    if (!hasMore || results.length === 0) break;
    page++;
    if (page > 100) break; // trava de segurança
  }

  return all;
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

    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Apenas admin/gerente/financeiro pode usar esta função
    const { data: roleRows } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .in("role", ["admin", "gerente", "financeiro"]);
    if (!roleRows || roleRows.length === 0) {
      return json({ ok: false, error: "Sem permissão" }, 403);
    }

    const apiToken = Deno.env.get("ZAPSIGN_API_TOKEN");
    if (!apiToken) return json({ ok: false, error: "ZAPSIGN_API_TOKEN não configurado" }, 500);

    // 1. Busca todos os contratos locais e monta mapa token → contrato
    const { data: localContracts } = await admin
      .from("crediario_contracts")
      .select("id, status, signature_external_id, nome, cpf");

    const assinadosTokens = new Set<string>();
    const tokenToContrato = new Map<string, { id: string; status: string; nome: string; cpf: string }>();

    for (const c of (localContracts ?? [])) {
      if (!c.signature_external_id) continue;
      tokenToContrato.set(c.signature_external_id, {
        id: c.id,
        status: c.status,
        nome: c.nome,
        cpf: c.cpf,
      });
      if (c.status === "assinado") {
        assinadosTokens.add(c.signature_external_id);
      }
    }

    // 2. Busca documentos assinados na ZapSign
    const zapDocs = await fetchAllSignedDocs(apiToken);

    // 3. Filtra os que ainda não estão como "assinado" localmente
    const pendentes = zapDocs
      .filter((d) => !assinadosTokens.has(d.token))
      .map((d) => {
        const local = tokenToContrato.get(d.token);
        return {
          token: d.token,
          open_id: d.open_id,
          name: d.name,
          external_id: d.external_id,
          signed_at: d.last_update_date ?? d.created_at,
          // contrato_id só é preenchido quando existe um contrato local com esse token —
          // NÃO usamos d.external_id como fallback pois pode ser ID do sistema antigo.
          contrato_id: local?.id ?? null,
          status_local: local?.status ?? null,
          nome_local: local?.nome ?? null,
          cpf_local: local?.cpf ?? null,
        };
      });

    return json({
      ok: true,
      total_zapsign: zapDocs.length,
      total_pendentes: pendentes.length,
      pendentes,
    });
  } catch (err) {
    console.error("zapsign-listar-pendentes error", err);
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
