// Edge function: distribui leads SEM responsável (crm_leads) para os
// vendedores da empresa correta, com base na cidade informada no lead
// (campo dinâmico do tipo "cidade_estado"), usando o mesmo mapeamento
// cidade -> empresa já usado pela Campanha Copa (campanha_copa_cidade_lojas).
// Permitido apenas para admin ou gerente (gerente só dentro das suas lojas).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { resolveRouteForCity, type CidadeLojaRoute } from "../_shared/campanhaCopaCidade.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Sessão inválida" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const uid = userData.user.id;

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", uid);
    const roleSet = new Set((roles ?? []).map((r: any) => r.role));
    const isAdmin = roleSet.has("admin");
    const isGerente = roleSet.has("gerente");
    if (!isAdmin && !isGerente) {
      return new Response(JSON.stringify({ error: "Sem permissão" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let allowedCompanies: string[] | null = null;
    if (!isAdmin) {
      const { data: prof } = await admin
        .from("profiles")
        .select("company_id")
        .eq("user_id", uid)
        .maybeSingle();
      const { data: extras } = await admin
        .from("manager_companies")
        .select("company_id")
        .eq("user_id", uid);
      const set = new Set<string>();
      if (prof?.company_id) set.add(prof.company_id);
      (extras ?? []).forEach((e: any) => set.add(e.company_id));
      allowedCompanies = Array.from(set);
      if (allowedCompanies.length === 0) {
        return new Response(JSON.stringify({ error: "Sem loja vinculada" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Campo dinâmico do tipo "cidade_estado" usado no formulário de leads.
    const { data: cityFields } = await admin
      .from("crm_form_fields")
      .select("id")
      .eq("field_type", "cidade_estado");
    const cityFieldIds = (cityFields ?? []).map((f: any) => f.id as string);
    if (cityFieldIds.length === 0) {
      return new Response(
        JSON.stringify({ error: "Nenhum campo de cidade configurado no formulário de leads" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: routesRaw } = await admin
      .from("campanha_copa_cidade_lojas")
      .select("id, cidade_label, company_id");
    const routes = (routesRaw ?? []) as CidadeLojaRoute[];
    if (routes.length === 0) {
      return new Response(
        JSON.stringify({ error: "Nenhuma cidade mapeada para empresas (configure em Campanha Copa)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const routesAllowed = allowedCompanies
      ? routes.filter((r) => allowedCompanies!.includes(r.company_id))
      : routes;

    // Todos os leads sem responsável (paginado).
    const PAGE = 1000;
    let from = 0;
    const leads: { id: string; data: Record<string, any> }[] = [];
    while (true) {
      const { data: page } = await admin
        .from("crm_leads")
        .select("id, data")
        .is("assigned_to", null)
        .neq("status", "excluidos")
        .range(from, from + PAGE - 1);
      const arr = (page ?? []) as any[];
      leads.push(...arr.map((r) => ({ id: r.id as string, data: (r.data ?? {}) as Record<string, any> })));
      if (arr.length < PAGE) break;
      from += PAGE;
    }

    // Agrupa por empresa resolvida via cidade.
    const leadsByCompany = new Map<string, string[]>();
    let semCidade = 0;
    let semEmpresaMapeada = 0;

    for (const lead of leads) {
      let cidadeValor: string | null = null;
      for (const fid of cityFieldIds) {
        const v = lead.data?.[`field_${fid}`];
        if (typeof v === "string" && v.trim()) { cidadeValor = v; break; }
      }
      if (!cidadeValor) { semCidade++; continue; }
      const route = resolveRouteForCity(cidadeValor, routesAllowed);
      if (!route) { semEmpresaMapeada++; continue; }
      const arr = leadsByCompany.get(route.company_id) ?? [];
      arr.push(lead.id);
      leadsByCompany.set(route.company_id, arr);
    }

    let totalAssigned = 0;
    const perCompany: Record<string, { assigned: number; vendedores: number }> = {};

    for (const [companyId, leadIds] of leadsByCompany.entries()) {
      const { data: profs } = await admin.from("profiles").select("user_id").eq("company_id", companyId);
      const userIds = (profs ?? []).map((p: any) => p.user_id as string);
      let vendedores: string[] = [];
      if (userIds.length > 0) {
        const { data: rolesData } = await admin
          .from("user_roles")
          .select("user_id, role")
          .in("user_id", userIds);
        vendedores = (rolesData ?? [])
          .filter((r: any) => r.role === "vendedor")
          .map((r: any) => r.user_id as string)
          .sort();
        if (vendedores.length === 0) {
          vendedores = (rolesData ?? [])
            .filter((r: any) => r.role === "gerente")
            .map((r: any) => r.user_id as string)
            .sort();
        }
      }
      if (vendedores.length === 0) {
        perCompany[companyId] = { assigned: 0, vendedores: 0 };
        continue;
      }

      leadIds.sort();
      let assignedHere = 0;
      const buckets: Record<string, string[]> = {};
      leadIds.forEach((id, idx) => {
        const userId = vendedores[idx % vendedores.length];
        (buckets[userId] ??= []).push(id);
      });

      for (const [userId, ids] of Object.entries(buckets)) {
        for (let i = 0; i < ids.length; i += 200) {
          const slice = ids.slice(i, i + 200);
          const { error } = await admin
            .from("crm_leads")
            .update({ assigned_to: userId })
            .in("id", slice);
          if (!error) assignedHere += slice.length;
        }
      }

      perCompany[companyId] = { assigned: assignedHere, vendedores: vendedores.length };
      totalAssigned += assignedHere;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        total_assigned: totalAssigned,
        sem_cidade: semCidade,
        sem_empresa_mapeada: semEmpresaMapeada,
        companies: perCompany,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    return new Response(
      JSON.stringify({ error: e?.message ?? "Erro inesperado" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
