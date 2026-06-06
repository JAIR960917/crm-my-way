/** Cobrança ainda ativa (cliente com dívida em tratamento). */
export function isOpenCobrancaStatus(status: string | null | undefined): boolean {
  const s = (status ?? "").trim().toLowerCase();
  return !!s && s !== "pago" && s !== "cancelado";
}
