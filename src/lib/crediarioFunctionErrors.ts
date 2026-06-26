import type { SupabaseClient } from "@supabase/supabase-js";
import { getRuntimeConfig } from "@/lib/runtime-config";

/** Chamada à edge function via fetch (mais estável no celular que functions.invoke). */
export async function invokeEdgeFunction<T extends { ok?: boolean; error?: string }>(
  supabase: SupabaseClient,
  functionName: string,
  body: Record<string, unknown>,
): Promise<{ data: T | null; errorMessage: string | null }> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) {
    return { data: null, errorMessage: "Sessão expirada. Faça login novamente." };
  }

  const runtimeConfig = getRuntimeConfig();
  const baseUrl = runtimeConfig.supabaseUrl || (import.meta.env.VITE_SUPABASE_URL as string);
  const apiKey = runtimeConfig.supabasePublishableKey || (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string);

  let res: Response;
  try {
    res = await fetch(`${baseUrl}/functions/v1/${functionName}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return {
      data: null,
      errorMessage: e instanceof Error ? e.message : "Falha de conexão. Verifique a internet.",
    };
  }

  const text = await res.text();
  let data: T | null = null;
  try {
    data = JSON.parse(text) as T;
  } catch {
    if (!res.ok) {
      return { data: null, errorMessage: text.slice(0, 300) || `Erro HTTP ${res.status}` };
    }
  }

  if (!res.ok || data?.ok === false) {
    return {
      data,
      errorMessage: data?.error || text.slice(0, 300) || `Erro HTTP ${res.status}`,
    };
  }

  return { data, errorMessage: null };
}

export async function getFunctionErrorMessage(error: unknown) {
  const context = typeof error === "object" && error && "context" in error
    ? (error as { context?: Response }).context
    : null;

  if (context) {
    const text = await context.clone().text().catch(() => "");
    if (text) {
      try {
        const json = JSON.parse(text) as { error?: string; details?: unknown };
        const details = json.details ? ` — ${JSON.stringify(json.details).slice(0, 300)}` : "";
        return `${json.error ?? text}${details}`;
      } catch {
        return text.slice(0, 500);
      }
    }
  }

  if (typeof error === "object" && error) {
    const err = error as { message?: string; details?: string; hint?: string; code?: string };
    const parts = [err.message, err.details, err.hint, err.code ? `Código: ${err.code}` : null].filter(Boolean);
    if (parts.length) return parts.join(" — ");
  }

  return error instanceof Error ? error.message : String(error);
}
