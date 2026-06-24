/** Regras compartilhadas para identificar parcelas ativas de cobrança (SSótica). */

export function normalizeSituacaoLabel(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\s_-]+/g, " ")
    .trim();
}

export function normalizeDigits(s: string | null | undefined): string {
  return String(s ?? "").replace(/\D/g, "");
}

export function getClienteCpfDigits(cliente: any): string {
  return normalizeDigits(
    cliente?.documento ?? cliente?.cpf_cnpj ?? cliente?.cpf ?? cliente?.cpfCnpj ?? "",
  );
}

/** Agrupa parcelas do mesmo CPF mesmo quando a SSótica usa IDs de cliente diferentes. */
export function getClienteBucketKey(cliente: any): string {
  const cpf = getClienteCpfDigits(cliente);
  if (cpf.length >= 11) return `cpf:${cpf}`;
  const id = Number(cliente?.id);
  return Number.isFinite(id) && id > 0 ? `id:${id}` : "id:0";
}

export type ParcelaClienteMatch = { clienteId?: number; cpfDigits?: string };

export function parcelaMatchesCliente(parcela: any, match: ParcelaClienteMatch): boolean {
  const cliRef = parcela.titulo?.cliente ?? parcela.cliente ?? {};
  if (!cliRef?.id && !getClienteCpfDigits(cliRef)) return false;
  if (match.clienteId != null && Number(cliRef.id) === match.clienteId) return true;
  if (match.cpfDigits && match.cpfDigits.length >= 11) {
    const cpfCli = getClienteCpfDigits(cliRef);
    return cpfCli.length >= 11 && cpfCli === match.cpfDigits;
  }
  return false;
}

export function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / 86400000);
}

function getAjuizadoVariantFromSituacao(situacao: string): "ajuizado_saniely" | "ajuizado_navde" | null {
  const isJuridico =
    situacao.startsWith("ajuizado") ||
    situacao.startsWith("cobranca dr") ||
    situacao.startsWith("cobranca dra") ||
    situacao.startsWith("escritorio de cobranca") ||
    situacao.startsWith("escritorio cobranca");
  if (!isJuridico) return null;
  if (situacao.includes("saniely")) return "ajuizado_saniely";
  if (situacao.includes("navde")) return "ajuizado_navde";
  return "ajuizado_navde";
}

/** Indica quitação com evidência forte — não confundir recebimento parcial com parcela paga. */
export function isParcelaQuitada(
  parcela: any,
  situacaoNorm: string,
  isNegativada: boolean,
  isAtiva: boolean,
): boolean {
  if (isNegativada) return false;
  if (parcela.data_pagamento ?? parcela.dataPagamento) return true;
  if (["pago", "paga", "quitado", "quitada", "liquidado", "liquidada"].includes(situacaoNorm)) {
    return true;
  }

  const isEmAberto =
    situacaoNorm === "em aberto" || situacaoNorm === "aberto" || situacaoNorm === "aberta";
  const isEmAtraso =
    situacaoNorm === "em atraso" || situacaoNorm === "atrasado" || situacaoNorm === "atrasada";
  const isVencido = situacaoNorm === "vencido" || situacaoNorm === "vencida";
  const isAVencer =
    situacaoNorm === "a vencer" || situacaoNorm === "avencer" || situacaoNorm === "pendente";
  if (isAtiva && (isEmAberto || isEmAtraso || isVencido || isAVencer)) return false;

  const valorDevido = Number(parcela.valor_reajustado ?? parcela.valor_original ?? parcela.valor ?? 0);
  const valorRecebido = Number(parcela.valor_recebido ?? parcela.valorRecebido ?? 0);
  return valorDevido > 0 && valorRecebido >= valorDevido;
}

export type ParsedParcelaCobranca = {
  parcela_id: number | null;
  titulo_id: number | null;
  numero_parcela: number | null;
  vencimento: string;
  dias_atraso: number;
  valor: number;
  situacao: string;
  forma_pagamento: string;
  numero_documento: string;
  descricao: string;
  boleto_nosso_numero: string | null;
  ssotica_raw: unknown;
};

/** Retorna a parcela normalizada se estiver em aberto para cobrança; caso contrário null. */
export function parseParcelaCobrancaAtiva(
  parcela: any,
  today: Date,
  match: number | ParcelaClienteMatch,
): ParsedParcelaCobranca | null {
  const clienteMatch: ParcelaClienteMatch =
    typeof match === "number" ? { clienteId: match } : match;

  const situacaoRaw = String(parcela.situacao ?? parcela["situação"] ?? "");
  const situacao = normalizeSituacaoLabel(situacaoRaw);
  if (!parcelaMatchesCliente(parcela, clienteMatch)) return null;

  const ajuizadoVariant = getAjuizadoVariantFromSituacao(situacao);
  const isAjuizado = !!ajuizadoVariant;
  const isNegativadoSerasa = situacao.startsWith("negativado") && situacao.includes("serasa");
  const isEmAtraso = situacao === "em atraso" || situacao === "atrasado" || situacao === "atrasada";
  const isEmAberto = situacao === "em aberto" || situacao === "aberto" || situacao === "aberta";
  const isVencido = situacao === "vencido" || situacao === "vencida";
  const isAVencer = situacao === "a vencer" || situacao === "avencer" || situacao === "pendente";
  const isAtiva = isEmAberto || isEmAtraso || isVencido || isAVencer || isNegativadoSerasa || isAjuizado;

  const foiRenegociada = situacao.startsWith("renegoc");
  const isNegativada = isNegativadoSerasa || isAjuizado;
  // Para negativado/ajuizado, só confiamos em baixado_em/cancelado_em/
  // estornado_em quando há um responsável humano registrado (ex.:
  // "cancelado_por": "Brenda") — isso indica uma ação manual de um
  // funcionário resolvendo o caso depois, não o efeito colateral automático
  // de quando a SSótica negativa/ajuíza a parcela (que não tem responsável).
  // Sem essa distinção, uma negativação resolvida manualmente nunca saía da
  // cobrança, porque a SSótica não atualiza o campo "situacao" ao cancelar.
  const foiBaixada = !isNegativada
    ? !!parcela.baixado_em
    : !!parcela.baixado_em && !!parcela.baixado_por;
  const foiCancelada = !isNegativada
    ? !!parcela.cancelado_em
    : !!parcela.cancelado_em && !!parcela.cancelado_por;
  const foiEstornada = !isNegativada
    ? !!parcela.estornado_em
    : !!parcela.estornado_em && !!parcela.estornado_por;
  const foiPaga = isParcelaQuitada(parcela, situacao, isNegativada, isAtiva);

  if (!isAtiva || foiRenegociada || foiBaixada || foiCancelada || foiEstornada || foiPaga) {
    return null;
  }

  const vencimento = parcela.vencimento as string | null;
  if (!vencimento) return null;
  const vencDate = new Date(vencimento + "T00:00:00Z");
  const diasAtraso = daysBetween(vencDate, today);
  if (diasAtraso <= -2 && !isNegativadoSerasa && !isAjuizado) return null;

  return {
    parcela_id: parcela.id ? Number(parcela.id) : null,
    titulo_id: parcela.titulo?.id ? Number(parcela.titulo.id) : null,
    numero_parcela: parcela.numero_parcela ?? null,
    vencimento,
    dias_atraso: diasAtraso,
    valor: Number(parcela.valor_reajustado ?? parcela.valor_original ?? parcela.valor ?? 0),
    situacao: situacaoRaw,
    forma_pagamento: parcela.forma_pagamento ?? "",
    numero_documento: parcela.titulo?.numero_documento ?? "",
    descricao: parcela.titulo?.descricao ?? "",
    boleto_nosso_numero: parcela.boleto?.nosso_numero ?? null,
    ssotica_raw: parcela,
  };
}
