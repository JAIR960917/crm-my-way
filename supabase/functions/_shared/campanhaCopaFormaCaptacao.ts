/**
 * Toda inscrição da Campanha Copa entra como "Tráfego Pago" na Forma de
 * captação do lead (campo dinâmico do formulário de Leads) — a campanha é
 * divulgada via anúncio pago, então o lead não deveria ficar sem essa
 * informação preenchida na tela de Leads.
 */
const FORMA_CAPTACAO_VALUE = "Tráfego Pago";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAdmin = any;

export async function loadFormaCaptacaoFieldId(supabase: SupabaseAdmin): Promise<string | null> {
  const { data: fields } = await supabase
    .from("crm_form_fields")
    .select("id, label");

  for (const field of (fields || []) as { id: string; label: string | null }[]) {
    const label = (field.label || "").toLowerCase();
    if (/forma de capta[cç][aã]o/.test(label)) {
      return field.id;
    }
  }

  return null;
}

export function applyFormaCaptacaoToLeadData(
  leadData: Record<string, unknown>,
  formaCaptacaoFieldId: string | null,
): void {
  if (formaCaptacaoFieldId) {
    leadData[`field_${formaCaptacaoFieldId}`] = FORMA_CAPTACAO_VALUE;
  }
}

export { FORMA_CAPTACAO_VALUE };
