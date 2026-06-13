import { supabase } from "@/integrations/supabase/client";

export const EXAME_VISTA_OPTIONS = [
  "Menos de 6 meses",
  "6 meses a 1 ano",
  "1 a 2 anos",
  "Mais de 2 anos",
  "Nunca fiz",
] as const;

export type RenovacaoMatch = "sim" | "nao" | "outra_loja";

export type CampanhaCopaRelatorioFilters = {
  ultimo_exame?: string | null;
  cidade?: string | null;
  jogo?: string | null;
  data_inicio?: string | null;
  data_fim?: string | null;
  renovacao_filtro?: RenovacaoMatch | null;
  assigned_to?: string | null;
};

export type CampanhaCopaRelatorioMetrics = {
  total: number;
  em_renovacao: number;
  prospect: number;
  outra_loja: number;
  pct_renovacao: number;
  pct_prospect: number;
  pct_outra_loja: number;
  consentimento_marketing: number;
  por_cidade: Array<{ cidade: string; total: number }>;
  por_exame: Array<{ exame: string; total: number }>;
};

export type CampanhaCopaRelatorioRow = {
  id: string;
  lead_id: string | null;
  nome: string;
  cpf: string | null;
  idade: string | null;
  cidade: string | null;
  telefone: string;
  usa_oculos: string | null;
  ultimo_exame_vista: string | null;
  jogo: string | null;
  jogo_label: string | null;
  consentimento_marketing: boolean;
  assigned_to: string | null;
  created_at: string;
  company_id: string | null;
  company_name: string | null;
  renovacao_match: RenovacaoMatch;
  renovacao_match_type: string | null;
  renovacao_match_id: string | null;
  renovacao_match_status: string | null;
  renovacao_status_label: string | null;
  renovacao_match_data_compra: string | null;
  renovacao_match_company_id: string | null;
  renovacao_company_name: string | null;
};

export type CampanhaCopaRelatorioResult = {
  metrics: CampanhaCopaRelatorioMetrics;
  rows: CampanhaCopaRelatorioRow[];
};

function toIsoStart(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  return `${dateStr}T00:00:00.000Z`;
}

function toIsoEnd(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  return `${dateStr}T23:59:59.999Z`;
}

export async function fetchCampanhaCopaRelatorio(
  filters: CampanhaCopaRelatorioFilters,
): Promise<CampanhaCopaRelatorioResult> {
  const { data, error } = await supabase.rpc("campanha_copa_relatorio" as never, {
    p_ultimo_exame: filters.ultimo_exame || null,
    p_cidade: filters.cidade || null,
    p_jogo: filters.jogo || null,
    p_data_inicio: toIsoStart(filters.data_inicio),
    p_data_fim: toIsoEnd(filters.data_fim),
    p_renovacao_filtro: filters.renovacao_filtro || null,
    p_assigned_to: filters.assigned_to || null,
  } as never);

  if (error) {
    const msg =
      (error as { message?: string; details?: string; hint?: string }).details
      || (error as { message?: string }).message
      || "Erro ao carregar relatório";
    throw new Error(msg);
  }

  const payload = (data ?? { metrics: {}, rows: [] }) as CampanhaCopaRelatorioResult;
  return {
    metrics: {
      total: Number(payload.metrics?.total ?? 0),
      em_renovacao: Number(payload.metrics?.em_renovacao ?? 0),
      prospect: Number(payload.metrics?.prospect ?? 0),
      outra_loja: Number(payload.metrics?.outra_loja ?? 0),
      pct_renovacao: Number(payload.metrics?.pct_renovacao ?? 0),
      pct_prospect: Number(payload.metrics?.pct_prospect ?? 0),
      pct_outra_loja: Number(payload.metrics?.pct_outra_loja ?? 0),
      consentimento_marketing: Number(payload.metrics?.consentimento_marketing ?? 0),
      por_cidade: Array.isArray(payload.metrics?.por_cidade) ? payload.metrics.por_cidade : [],
      por_exame: Array.isArray(payload.metrics?.por_exame) ? payload.metrics.por_exame : [],
    },
    rows: Array.isArray(payload.rows) ? payload.rows : [],
  };
}

export function renovacaoMatchLabel(match: RenovacaoMatch): string {
  switch (match) {
    case "sim":
      return "Em Renovação";
    case "outra_loja":
      return "Outra loja";
    default:
      return "Não está em Renovação";
  }
}
