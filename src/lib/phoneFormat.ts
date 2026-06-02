/**
 * ============================================================================
 * phoneFormat.ts — Formatação de telefone brasileiro
 * ============================================================================
 * Usado em TODOS os formulários de lead/cliente para mostrar (XX) XXXXX-XXXX.
 * No banco salvamos apenas dígitos (use unformatPhone antes de enviar).
 * ============================================================================
 */

/**
 * Formata uma string de telefone como brasileiro:
 *   - Celular: (XX) XXXXX-XXXX  (11 dígitos)
 *   - Fixo:    (XX) XXXX-XXXX   (10 dígitos)
 *
 * Aceita string parcial (ex.: digitando) e formata progressivamente.
 *
 * @param value Texto bruto digitado pelo usuário (com ou sem máscara)
 * @returns Telefone formatado para exibição
 */
export function formatPhoneBR(value: string): string {
  // 1) Mantém só dígitos e limita a 11 (DDD + 9 dígitos).
  const digits = value.replace(/\D/g, "").slice(0, 11);

  if (digits.length === 0) return "";
  if (digits.length <= 2) return `(${digits}`;                                                    // (XX
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;                    // (XX) XXXX
  if (digits.length <= 10)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;                    // fixo
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;                      // celular
}

/**
 * Remove a máscara, mantendo apenas dígitos.
 * Use SEMPRE antes de salvar no banco ou enviar para a API do WhatsApp.
 *
 * @param value Telefone formatado
 * @returns String só com números (ex.: "11987654321")
 */
export function unformatPhone(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * Telefone só com dígitos nacionais (DDD + número), sem código do país 55.
 * Ex.: "+55 84 92000-7039" ou "5584920007039" → "84920007039"
 */
export function nationalPhoneDigits(value: string): string {
  let d = unformatPhone(value);
  if (d.startsWith("55") && d.length >= 12) d = d.slice(2);
  while (d.startsWith("0") && d.length > 11) d = d.slice(1);
  return d;
}

/** Compara telefones pelo número nacional (ignora +55, máscaras e espaços). */
export function phonesMatchNational(a: string, b: string): boolean {
  const da = nationalPhoneDigits(a);
  const db = nationalPhoneDigits(b);
  if (!da || !db) return false;
  if (da === db) return true;
  if (da.length >= 8 && db.length >= 8) {
    return da.endsWith(db.slice(-8)) || db.endsWith(da.slice(-8));
  }
  return false;
}
