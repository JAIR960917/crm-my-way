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
  placar?: string | null;
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
  por_empresa: Array<{ empresa: string; total: number }>;
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
  palpite_brasil: number | null;
  palpite_marrocos: number | null;
  palpite_texto: string | null;
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

const EMPTY_METRICS: CampanhaCopaRelatorioMetrics = {
  total: 0,
  em_renovacao: 0,
  prospect: 0,
  outra_loja: 0,
  pct_renovacao: 0,
  pct_prospect: 0,
  pct_outra_loja: 0,
  consentimento_marketing: 0,
  por_empresa: [],
  por_exame: [],
};

function toIsoStart(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  return `${dateStr}T00:00:00.000Z`;
}

function toIsoEnd(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  return `${dateStr}T23:59:59.999Z`;
}

export function normalizePlacarInput(
  home: string | number | null | undefined,
  away: string | number | null | undefined,
): string | null {
  const homeRaw = String(home ?? "").trim();
  const awayRaw = String(away ?? "").trim();
  if (homeRaw === "" || awayRaw === "") return null;
  const homeNum = Number(homeRaw);
  const awayNum = Number(awayRaw);
  if (!Number.isInteger(homeNum) || !Number.isInteger(awayNum)) return null;
  if (homeNum < 0 || homeNum > 99 || awayNum < 0 || awayNum > 99) return null;
  return `${homeNum} x ${awayNum}`;
}

export function parsePlacarText(value: string | null | undefined): string | null {
  const match = /^\s*(\d+)\s*[xX×]\s*(\d+)\s*$/.exec(String(value ?? "").trim());
  if (!match) return null;
  return normalizePlacarInput(match[1], match[2]);
}

function parseMetrics(raw: unknown): CampanhaCopaRelatorioMetrics {
  if (!raw || typeof raw !== "object") return { ...EMPTY_METRICS };
  const m = raw as Record<string, unknown>;
  return {
    total: Number(m.total) || 0,
    em_renovacao: Number(m.em_renovacao) || 0,
    prospect: Number(m.prospect) || 0,
    outra_loja: Number(m.outra_loja) || 0,
    pct_renovacao: Number(m.pct_renovacao) || 0,
    pct_prospect: Number(m.pct_prospect) || 0,
    pct_outra_loja: Number(m.pct_outra_loja) || 0,
    consentimento_marketing: Number(m.consentimento_marketing) || 0,
    por_empresa: Array.isArray(m.por_empresa)
      ? (m.por_empresa as Array<{ empresa: string; total: number }>)
      : [],
    por_exame: Array.isArray(m.por_exame)
      ? (m.por_exame as Array<{ exame: string; total: number }>)
      : [],
  };
}

function parseRows(raw: unknown): CampanhaCopaRelatorioRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((row) => {
    const r = row as Record<string, unknown>;
    const match = r.renovacao_match;
    const renovacao_match: RenovacaoMatch =
      match === "sim" || match === "outra_loja" ? match : "nao";
    return {
      id: String(r.id ?? ""),
      lead_id: (r.lead_id as string | null) ?? null,
      nome: String(r.nome ?? ""),
      cpf: (r.cpf as string | null) ?? null,
      idade: (r.idade as string | null) ?? null,
      cidade: (r.cidade as string | null) ?? null,
      telefone: String(r.telefone ?? ""),
      usa_oculos: (r.usa_oculos as string | null) ?? null,
      ultimo_exame_vista: (r.ultimo_exame_vista as string | null) ?? null,
      jogo: (r.jogo as string | null) ?? null,
      jogo_label: (r.jogo_label as string | null) ?? null,
      palpite_brasil: r.palpite_brasil == null ? null : Number(r.palpite_brasil),
      palpite_marrocos: r.palpite_marrocos == null ? null : Number(r.palpite_marrocos),
      palpite_texto: (r.palpite_texto as string | null) ?? null,
      consentimento_marketing: r.consentimento_marketing === true,
      assigned_to: (r.assigned_to as string | null) ?? null,
      created_at: String(r.created_at ?? ""),
      company_id: (r.company_id as string | null) ?? null,
      company_name: (r.company_name as string | null) ?? null,
      renovacao_match,
      renovacao_match_type: (r.renovacao_match_type as string | null) ?? null,
      renovacao_match_id: (r.renovacao_match_id as string | null) ?? null,
      renovacao_match_status: (r.renovacao_match_status as string | null) ?? null,
      renovacao_status_label: (r.renovacao_status_label as string | null) ?? null,
      renovacao_match_data_compra: (r.renovacao_match_data_compra as string | null) ?? null,
      renovacao_match_company_id: (r.renovacao_match_company_id as string | null) ?? null,
      renovacao_company_name: (r.renovacao_company_name as string | null) ?? null,
    };
  });
}

export async function fetchCampanhaCopaRelatorio(
  filters: CampanhaCopaRelatorioFilters,
): Promise<CampanhaCopaRelatorioResult> {
  const { data, error } = await supabase.rpc("campanha_copa_relatorio" as never, {
    p_ultimo_exame: filters.ultimo_exame || null,
    p_cidade: filters.cidade?.trim() || null,
    p_jogo: filters.jogo || null,
    p_data_inicio: filters.data_inicio ? toIsoStart(filters.data_inicio) : null,
    p_data_fim: filters.data_fim ? toIsoEnd(filters.data_fim) : null,
    p_renovacao_filtro: filters.renovacao_filtro || null,
    p_assigned_to: filters.assigned_to || null,
    p_placar: filters.placar || null,
  } as never);

  if (error) throw new Error(error.message);

  const payload = (data ?? { metrics: {}, rows: [] }) as {
    metrics?: unknown;
    rows?: unknown;
  };

  return {
    metrics: parseMetrics(payload.metrics),
    rows: parseRows(payload.rows),
  };
}

export async function fetchCampanhaCopaRelatorioMeta(): Promise<{
  cities: string[];
  jogos: string[];
}> {
  const { data, error } = await supabase
    .from("campanha_copa_submissions")
    .select("cidade, jogo, jogo_label")
    .order("created_at", { ascending: false })
    .limit(2000);

  if (error) throw new Error(error.message);

  const cities = new Set<string>();
  const jogos = new Map<string, string>();
  for (const row of data || []) {
    const r = row as { cidade?: string; jogo?: string; jogo_label?: string };
    if (r.cidade?.trim()) cities.add(r.cidade.trim());
    if (r.jogo) jogos.set(r.jogo, r.jogo_label || r.jogo);
  }

  return {
    cities: Array.from(cities).sort((a, b) => a.localeCompare(b, "pt-BR")),
    jogos: Array.from(jogos.keys()).sort(),
  };
}

function csvEscape(value: string | number | boolean | null | undefined): string {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export function exportCampanhaCopaPlacarCsv(
  rows: CampanhaCopaRelatorioRow[],
  placar: string,
  profileName: (id: string | null) => string,
) {
  const headers = [
    "Nome",
    "CPF",
    "Telefone",
    "Cidade",
    "Idade",
    "Palpite",
    "Jogo",
    "Último exame",
    "Em Renovação",
    "Loja",
    "Responsável",
    "Data inscrição",
  ];

  const lines = [
    headers.join(";"),
    ...rows.map((row) =>
      [
        csvEscape(row.nome),
        csvEscape(row.cpf),
        csvEscape(row.telefone),
        csvEscape(row.cidade),
        csvEscape(row.idade),
        csvEscape(row.palpite_texto || `${row.palpite_brasil ?? "?"} x ${row.palpite_marrocos ?? "?"}`),
        csvEscape(row.jogo_label || row.jogo),
        csvEscape(row.ultimo_exame_vista),
        csvEscape(renovacaoMatchLabel(row.renovacao_match)),
        csvEscape(
          row.renovacao_match === "sim"
            ? row.company_name
            : row.renovacao_match === "outra_loja"
              ? row.renovacao_company_name
              : row.company_name,
        ),
        csvEscape(profileName(row.assigned_to)),
        csvEscape(row.created_at ? new Date(row.created_at).toLocaleString("pt-BR") : ""),
      ].join(";"),
    ),
  ];

  const blob = new Blob(["\uFEFF" + lines.join("\r\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `campanha-copa-placar-${placar.replace(/\s+/g, "-")}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
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
