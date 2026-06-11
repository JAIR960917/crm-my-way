type SupabaseErrorLike = {
  message?: string;
  details?: string;
  hint?: string;
  code?: string;
} | null;

/** Mensagem legível para toasts; detecta colunas de formulário ainda não migradas. */
export function formatSupabaseError(error: SupabaseErrorLike): string {
  if (!error) return "Erro desconhecido";

  const text = [error.message, error.details, error.hint].filter(Boolean).join(" — ");
  const lower = text.toLowerCase();

  if (
    error.code === "PGRST204" ||
    lower.includes("show_at_end") ||
    lower.includes("appear_after_field_id")
  ) {
    return "Banco desatualizado: na VPS execute ./deploy.sh --migrations (ou aplique as migrations de formulário no Supabase) e tente novamente.";
  }

  return text || "Erro desconhecido";
}
