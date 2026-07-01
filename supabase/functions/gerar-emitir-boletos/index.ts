// Edge Function: gerar-emitir-boletos
// Para um contrato assinado:
// 1) Cria as parcelas no banco (se ainda não existem) com vencimentos mensais
// 2) Para cada parcela pendente, emite um boleto na Cora (mTLS + OAuth2)
// 3) Atualiza a parcela com cora_invoice_id, linha_digitavel, pdf_url, pix...
// Idempotente: usa parcela.id como Idempotency-Key.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CORA_BASE = "https://matls-clients.api.cora.com.br";
const CORA_TOKEN_URL = `${CORA_BASE}/token`;
const CORA_INVOICES_URL = `${CORA_BASE}/v2/invoices`;

interface BodyInput {
  contrato_id: string;
  intervalo_dias?: number; // default 30
  primeiro_vencimento?: string; // YYYY-MM-DD (default: hoje + intervalo)
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

    // Service client (bypassa RLS para escritas controladas)
    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const body = (await req.json().catch(() => ({}))) as Partial<BodyInput>;
    const contratoId = body.contrato_id;
    if (!contratoId) return json({ ok: false, error: "contrato_id obrigatório" }, 400);
    const intervaloDias = Number.isFinite(body.intervalo_dias) ? Number(body.intervalo_dias) : 30;

    // 1) Carrega contrato (com empresa)
    const { data: contrato, error: contratoErr } = await admin
      .from("crediario_contracts")
      .select("id, user_id, venda_id, status, nome, cpf, company_id")
      .eq("id", contratoId)
      .maybeSingle();
    if (contratoErr || !contrato) return json({ ok: false, error: "Contrato não encontrado" }, 404);
    if (contrato.user_id !== userId) {
      // Permite admin/financeiro/gerente: checa role
      const { data: roleRows } = await admin
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .in("role", ["admin", "financeiro", "gerente"]);
      if (!roleRows || roleRows.length === 0) {
        return json({ ok: false, error: "Sem permissão" }, 403);
      }
    }
    if (contrato.status !== "assinado") {
      return json({ ok: false, error: "Contrato precisa estar assinado" }, 400);
    }
    if (!contrato.venda_id) {
      return json({ ok: false, error: "Contrato sem venda vinculada" }, 400);
    }

    // Resolve company_id: usa o do contrato; se nulo, cai para o da role do usuário logado
    let resolvedCompanyId: string | null = contrato.company_id ?? null;
    if (!resolvedCompanyId) {
      const { data: roleRow } = await admin
        .from("user_roles")
        .select("company_id")
        .eq("user_id", userId)
        .not("company_id", "is", null)
        .limit(1)
        .maybeSingle();
      resolvedCompanyId = roleRow?.company_id ?? null;
    }
    if (!resolvedCompanyId) {
      return json({ ok: false, error: "Usuário não está vinculado a nenhuma empresa" }, 400);
    }
    console.log(`[emit] company_id resolvido: ${resolvedCompanyId} (contrato.company_id=${contrato.company_id ?? "null"})`);

    // 2) Carrega venda
    const { data: venda, error: vendaErr } = await admin
      .from("crediario_vendas")
      .select("id, user_id, parcelas, valor_parcela, valor_financiado, cpf, nome, primeiro_vencimento, aprovacao_admin")
      .eq("id", contrato.venda_id)
      .maybeSingle();
    if (vendaErr || !venda) return json({ ok: false, error: "Venda não encontrada" }, 404);

    if (venda.aprovacao_admin === "pendente") {
      return json({ ok: false, error: "Venda aguardando autorização do administrador (entrada abaixo do mínimo)" }, 403);
    }
    if (venda.aprovacao_admin === "rejeitada") {
      return json({ ok: false, error: "Venda rejeitada pelo administrador" }, 403);
    }

    // 3) Garante que as parcelas existam no banco
    const { data: existentes } = await admin
      .from("crediario_parcelas")
      .select("id, numero_parcela, status, cora_invoice_id, vencimento, valor")
      .eq("venda_id", venda.id)
      .order("numero_parcela", { ascending: true });

    let parcelas = existentes ?? [];
    if (parcelas.length === 0) {
      // Cria as parcelas — prioridade: body.primeiro_vencimento → venda.primeiro_vencimento → hoje + intervalo
      const vencEscolhido = body.primeiro_vencimento || venda.primeiro_vencimento;
      const baseDate = vencEscolhido
        ? new Date(vencEscolhido + "T00:00:00")
        : addDays(new Date(), intervaloDias);
      const rows: any[] = [];
      for (let i = 1; i <= venda.parcelas; i++) {
        const venc = i === 1 ? baseDate : addMonthsKeepDay(baseDate, i - 1);
        rows.push({
          user_id: venda.user_id,
          venda_id: venda.id,
          contrato_id: contrato.id,
          company_id: resolvedCompanyId,
          numero_parcela: i,
          total_parcelas: venda.parcelas,
          valor: Number(venda.valor_parcela),
          vencimento: venc.toISOString().slice(0, 10),
          status: "pendente",
        });
      }
      const { data: criadas, error: parcelaErr } = await admin
        .from("crediario_parcelas")
        .insert(rows)
        .select("id, numero_parcela, status, cora_invoice_id, vencimento, valor")
        .order("numero_parcela", { ascending: true });
      if (parcelaErr) return json({ ok: false, error: `Erro criando parcelas: ${parcelaErr.message}` }, 500);
      parcelas = criadas ?? [];
    }

    // 4) Setup mTLS Cora — credenciais por empresa no banco, senão env var global
    const { data: dbCreds } = await admin
      .from("crediario_company_credentials")
      .select("cora_client_id, cora_certificate, cora_private_key")
      .eq("company_id", resolvedCompanyId)
      .maybeSingle();

    const clientId = dbCreds?.cora_client_id || Deno.env.get("CORA_CLIENT_ID");
    const certPem  = dbCreds?.cora_certificate || Deno.env.get("CORA_CERTIFICATE");
    const keyPem   = dbCreds?.cora_private_key || Deno.env.get("CORA_PRIVATE_KEY");
    console.log(`[emit] credenciais: ${dbCreds ? "banco" : "env"} | clientId=${clientId ? "ok" : "null"}`);
    if (!clientId || !certPem || !keyPem) {
      return json({ ok: false, error: `Credenciais Cora não cadastradas para esta empresa. Acesse Crediário → Credenciais e cadastre o Client ID, Certificado e Private Key.` }, 500);
    }

    const httpClient = buildMtlsClient(certPem, keyPem);
    if (!httpClient) return json({ ok: false, error: "Falha mTLS (certificado/chave)" }, 500);

    // Token
    const tokenResp = await fetch(CORA_TOKEN_URL, {
      method: "POST",
      // @ts-ignore
      client: httpClient,
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId }),
    });
    const tokenText = await tokenResp.text();
    if (!tokenResp.ok) return json({ ok: false, error: `Auth Cora: ${tokenText.slice(0, 300)}` }, 502);
    const accessToken = JSON.parse(tokenText).access_token as string;

    // Carrega configurações de cobrança (juros/multa/desconto)
    const { data: settingsRow } = await admin
      .from("crediario_settings")
      .select("cora_interest_monthly_percent, cora_fine_percent, cora_discount_percent")
      .limit(1)
      .maybeSingle();
    const jurosMensal = Number(settingsRow?.cora_interest_monthly_percent ?? 0);
    const multaPercent = Number(settingsRow?.cora_fine_percent ?? 0);
    const descontoPercent = Number(settingsRow?.cora_discount_percent ?? 0);

    // 5) Emite cada parcela pendente (fase 1: só POSTs, sem espera entre eles)
    const results: any[] = [];
    // Parcelas que foram criadas com sucesso na Cora — aguardam GET para Pix
    type Created = { parcela: (typeof parcelas)[0]; invJson: any };
    const created: Created[] = [];

    for (const p of parcelas) {
      if (p.cora_invoice_id) {
        results.push({ numero: p.numero_parcela, ok: true, skipped: true, invoice_id: p.cora_invoice_id });
        continue;
      }

      const valorCentavos = Math.round(Number(p.valor) * 100);
      if (valorCentavos < 500) {
        await admin.from("crediario_parcelas").update({
          status: "erro",
          erro_mensagem: "Valor mínimo Cora R$ 5,00",
        }).eq("id", p.id);
        results.push({ numero: p.numero_parcela, ok: false, error: "valor < R$ 5,00" });
        continue;
      }

      const cpfDigits = (venda.cpf || contrato.cpf).replace(/\D/g, "");
      if (!validarCpf(cpfDigits)) {
        await admin.from("crediario_parcelas").update({
          status: "erro",
          erro_mensagem: `CPF inválido: ${venda.cpf || contrato.cpf}. Corrija o CPF do cliente.`,
        }).eq("id", p.id);
        results.push({ numero: p.numero_parcela, ok: false, error: `CPF inválido: ${cpfDigits}` });
        continue;
      }

      const payload: any = {
        code: `P${p.id.replace(/-/g, "").slice(0, 20)}`,
        customer: {
          name: venda.nome || contrato.nome,
          document: { identity: cpfDigits, type: "CPF" },
        },
        services: [
          {
            name: `Parcela ${p.numero_parcela}/${venda.parcelas}`,
            description: `Parcela ${p.numero_parcela} de ${venda.parcelas}`,
            amount: valorCentavos,
          },
        ],
        payment_terms: buildCoraPaymentTerms(p.vencimento, multaPercent, jurosMensal, descontoPercent),
        payment_forms: ["BANK_SLIP", "PIX"],
      };

      try {
        const invResp = await fetch(CORA_INVOICES_URL, {
          method: "POST",
          // @ts-ignore
          client: httpClient,
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            Accept: "application/json",
            "Idempotency-Key": p.id,
          },
          body: JSON.stringify(payload),
        });
        const invText = await invResp.text();
        let invJson: any = null;
        try { invJson = JSON.parse(invText); } catch {}

        if (!invResp.ok) {
          const errMsg = invJson?.message || invJson?.errors?.[0]?.message || invJson?.title || invText.slice(0, 200);
          console.error(`cora error status=${invResp.status} parcela=${p.numero_parcela}`, invText.slice(0, 800));
          await admin.from("crediario_parcelas").update({
            status: "erro",
            erro_mensagem: `[HTTP ${invResp.status}] ${errMsg}`,
          }).eq("id", p.id);
          results.push({ numero: p.numero_parcela, ok: false, error: errMsg, cora_status: invResp.status });
          continue;
        }

        const bankSlip = invJson?.payment_options?.bank_slip ?? invJson?.bank_slip ?? {};
        const pix = invJson?.payment_options?.pix ?? invJson?.pix ?? {};
        const pdfUrl = (typeof bankSlip?.pdf === "string" ? bankSlip.pdf : bankSlip?.pdf?.url)
          ?? bankSlip?.url ?? invJson?.pdf ?? invJson?.links?.invoice ?? null;
        const pixEmv = pix?.emv ?? pix?.emv_code ?? pix?.payload ?? null;
        const pixQr  = pix?.qr_code ?? pix?.qrcode ?? null;

        console.log(`[OK] parcela ${p.numero_parcela} | pix keys: ${Object.keys(pix).join(",")} | emv=${pixEmv ? "ok" : "null"}`);

        await admin.from("crediario_parcelas").update({
          cora_invoice_id: invJson?.id ?? null,
          linha_digitavel: bankSlip?.digitable ?? bankSlip?.digitable_line ?? null,
          codigo_barras: bankSlip?.barcode ?? null,
          pdf_url: pdfUrl,
          pix_emv: pixEmv,
          pix_qrcode: pixQr,
          status: "emitido",
          emitido_em: new Date().toISOString(),
          erro_mensagem: null,
        }).eq("id", p.id);

        if (!pixEmv) created.push({ parcela: p, invJson });
        results.push({ numero: p.numero_parcela, ok: true, invoice_id: invJson?.id });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await admin.from("crediario_parcelas").update({ status: "erro", erro_mensagem: msg }).eq("id", p.id);
        results.push({ numero: p.numero_parcela, ok: false, error: msg });
      }
    }

    // Fase 2: aguarda UMA vez e faz GET de todas as faturas em paralelo para buscar Pix
    if (created.length > 0) {
      await new Promise((r) => setTimeout(r, 2500));
      await Promise.allSettled(
        created.map(async ({ parcela: p, invJson }) => {
          try {
            const getResp = await fetch(`${CORA_INVOICES_URL}/${invJson.id}`, {
              method: "GET",
              // @ts-ignore
              client: httpClient,
              headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
            });
            if (!getResp.ok) return;
            const full = await getResp.json();
            const pix = full?.payment_options?.pix ?? full?.pix ?? {};
            const bankSlip = full?.payment_options?.bank_slip ?? full?.bank_slip ?? {};
            console.log(`pix keys [${p.numero_parcela}]: ${Object.keys(pix).join(", ")}`);
            const pixEmv = pix?.emv ?? pix?.copy_paste ?? pix?.emv_code ?? pix?.payload ?? pix?.key ?? null;
            const pixQr  = pix?.qr_code ?? pix?.qr_code_url ?? pix?.qrcode ?? pix?.image ?? pix?.image_url ?? null;
            if (!pixEmv && !pixQr) return; // sem dados de Pix no GET, não sobrescreve
            await admin.from("crediario_parcelas").update({
              pix_emv: pixEmv,
              pix_qrcode: pixQr,
              // atualiza também pdf/linha caso o POST não tivesse retornado
              linha_digitavel: bankSlip?.digitable ?? bankSlip?.digitable_line ?? bankSlip?.typed_bar_code ?? null,
              codigo_barras: bankSlip?.barcode ?? bankSlip?.bar_code ?? null,
              pdf_url: bankSlip?.url ?? bankSlip?.pdf_url ?? full?.pdf ?? null,
            }).eq("id", p.id);
          } catch (_e) { /* falha no GET não bloqueia o resultado */ }
        })
      );
    }

    const sucessos = results.filter((r) => r.ok && !r.skipped).length;
    const ja_emitidos = results.filter((r) => r.skipped).length;
    const falhas = results.filter((r) => !r.ok).length;

    return json({
      ok: falhas === 0,
      message: `${sucessos} emitidos, ${ja_emitidos} já existiam, ${falhas} falharam`,
      total_parcelas: parcelas.length,
      results,
    });
  } catch (err) {
    console.error("gerar-emitir-boletos error", err);
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

function addDays(d: Date, days: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
}

// Adiciona N meses preservando o dia do mês original.
// Se o mês destino não tiver esse dia (ex: 31 em fev), usa o último dia do mês.
function addMonthsKeepDay(d: Date, months: number) {
  const day = d.getDate();
  const r = new Date(d);
  r.setDate(1);
  r.setMonth(r.getMonth() + months);
  const lastDay = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
  r.setDate(Math.min(day, lastDay));
  return r;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function buildCoraPaymentTerms(
  dueDate: string,
  multaPercent: number,
  jurosMensal: number,
  descontoPercent: number,
) {
  const payment_terms: Record<string, unknown> = { due_date: dueDate };
  if (multaPercent > 0) payment_terms.fine = { rate: multaPercent };
  if (jurosMensal > 0) payment_terms.interest = { rate: jurosMensal };
  if (descontoPercent > 0) payment_terms.discount = { type: "PERCENT", value: descontoPercent };
  return payment_terms;
}

function validarCpf(digits: string): boolean {
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false;
  const calc = (n: number) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += Number(digits[i]) * (n + 1 - i);
    const r = (s * 10) % 11;
    return r >= 10 ? 0 : r;
  };
  return calc(9) === Number(digits[9]) && calc(10) === Number(digits[10]);
}

function buildMtlsClient(certPem: string, keyPem: string): Deno.HttpClient | null {
  const buildPemCandidates = (raw: string, kind: "cert" | "key") => {
    const out = new Set<string>();
    const add = (v: string | null | undefined) => {
      if (!v) return;
      let s = v.trim();
      if (!s) return;
      s = s.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n{3,}/g, "\n\n");
      if (!s.endsWith("\n")) s += "\n";
      out.add(s);
    };
    add(raw);
    add(raw.replace(/\\n/g, "\n").replace(/\\r/g, ""));
    try { const p = JSON.parse(raw); if (typeof p === "string") add(p); } catch {}
    const unq = raw.replace(/^['"]|['"]$/g, "");
    if (unq !== raw) add(unq);
    const norm = unq.replace(/\\n/g, "\n").replace(/\\r/g, "");
    if (norm !== raw) add(norm);
    if (!/BEGIN [A-Z ]+/.test(raw)) {
      try { const dec = atob(raw.replace(/\s+/g, "")); if (/BEGIN [A-Z ]+/.test(dec)) add(dec); } catch {}
    }
    const label = kind === "cert" ? "CERTIFICATE" : "(?:RSA |EC |)PRIVATE KEY";
    const m = norm.match(new RegExp(`-----BEGIN ${label}-----\\s*([A-Za-z0-9+/=\\s]+?)\\s*-----END ${label}-----`, "m"));
    if (m) {
      const body = m[1].replace(/\s+/g, "\n");
      const begin = kind === "cert" ? "-----BEGIN CERTIFICATE-----"
        : norm.match(/-----BEGIN ([A-Z ]+PRIVATE KEY)-----/)?.[0] ?? "-----BEGIN PRIVATE KEY-----";
      const end = kind === "cert" ? "-----END CERTIFICATE-----"
        : norm.match(/-----END ([A-Z ]+PRIVATE KEY)-----/)?.[0] ?? "-----END PRIVATE KEY-----";
      add(`${begin}\n${body}\n${end}\n`);
    }
    return [...out];
  };

  const certs = buildPemCandidates(certPem, "cert");
  const keys = buildPemCandidates(keyPem, "key");
  for (const cert of certs) {
    for (const key of keys) {
      try { return Deno.createHttpClient({ cert, key }); } catch {}
    }
  }
  // Tenta invertido
  const certLooksKey = /BEGIN [A-Z ]*PRIVATE KEY/.test(certPem);
  const keyLooksCert = /BEGIN CERTIFICATE/.test(keyPem);
  if (certLooksKey && keyLooksCert) {
    for (const cert of keys) for (const key of certs) {
      try { return Deno.createHttpClient({ cert, key }); } catch {}
    }
  }
  return null;
}
