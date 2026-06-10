import { clearPwaState } from "@/lib/clearPwaState";

const AUTO_RECOVER_KEY = "crm_auto_recover_v6";

export function isRecoverableBootError(message: string): boolean {
  return /removeChild|insertBefore|not a child|ChunkLoadError|dynamically imported module|Loading chunk|Failed to fetch/i.test(
    message,
  );
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
    if (!isRecoverableBootError(message)) return;
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
