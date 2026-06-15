import { clearPwaState } from "@/lib/clearPwaState";

const AUTO_RECOVER_KEY = "crm_auto_recover_v6";

/** Erros de DOM (corrida de render) — não são causados por falta de rede. */
const DOM_ERROR_PATTERN = /removeChild|insertBefore|not a child/i;

/** Falhas de carregamento de chunk/módulo — esperadas quando offline e a rota nunca foi aberta antes. */
const NETWORK_ERROR_PATTERN = /ChunkLoadError|dynamically imported module|Loading chunk|Failed to fetch/i;

export function isRecoverableBootError(message: string): boolean {
  return DOM_ERROR_PATTERN.test(message) || NETWORK_ERROR_PATTERN.test(message);
}

/**
 * Decide se vale a pena limpar cache/SW e redirecionar para /login.
 * Erros de DOM sempre justificam a limpeza. Erros de rede só justificam
 * quando há internet — offline, são esperados (chunk ainda não cacheado) e
 * limpar o cache destruiria o shell que permite o app abrir offline.
 */
export function shouldHardRecover(message: string): boolean {
  if (DOM_ERROR_PATTERN.test(message)) return true;
  return NETWORK_ERROR_PATTERN.test(message) && navigator.onLine;
}

/** Uma tentativa automática de limpar cache/SW e reabrir (evita loop infinito). */
export async function tryAutoRecoverOnce(): Promise<boolean> {
  try {
    if (sessionStorage.getItem(AUTO_RECOVER_KEY)) return false;
    sessionStorage.setItem(AUTO_RECOVER_KEY, "1");
  } catch {
    return false;
  }

  try {
    await clearPwaState();
  } catch {
    // no-op
  }

  const base = `${window.location.origin}/login`;
  window.location.replace(`${base}?recover=${Date.now()}`);
  return true;
}

export function clearAutoRecoverFlag(): void {
  try {
    sessionStorage.removeItem(AUTO_RECOVER_KEY);
  } catch {
    // no-op
  }
}

export function setupGlobalRecoverHandlers(): void {
  const handle = (message: string) => {
    if (!shouldHardRecover(message)) return;
    void tryAutoRecoverOnce();
  };

  window.addEventListener("error", (event) => {
    if (event.message) handle(event.message);
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const message =
      reason instanceof Error ? reason.message : typeof reason === "string" ? reason : "";
    if (message) handle(message);
  });
}
