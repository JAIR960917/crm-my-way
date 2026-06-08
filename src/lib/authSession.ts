import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

/** Renova o token se faltar menos que isso para expirar (segundos). */
const REFRESH_MARGIN_SEC = 600;

/** Intervalo entre verificações com a aba aberta (ms). */
const CHECK_INTERVAL_MS = 60_000;

export function isSessionExpiringSoon(session: Session | null, marginSec = REFRESH_MARGIN_SEC): boolean {
  const expiresAt = session?.expires_at;
  if (!expiresAt) return false;
  return expiresAt - Math.floor(Date.now() / 1000) <= marginSec;
}

export function isSessionExpired(session: Session | null): boolean {
  const expiresAt = session?.expires_at;
  if (!expiresAt) return false;
  return expiresAt <= Math.floor(Date.now() / 1000);
}

/**
 * Renova a sessão antes de expirar. Evita logout após inatividade quando o
 * autoRefreshToken do Supabase é pausado em abas em segundo plano.
 */
export async function refreshSessionIfNeeded(): Promise<Session | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  if (!isSessionExpiringSoon(session)) return session;

  const { data, error } = await supabase.auth.refreshSession();
  if (error) {
    if (isSessionExpired(session)) return null;
    return session;
  }
  return data.session ?? session;
}

export function startSessionKeepAlive(onSession: (session: Session | null) => void): () => void {
  let cancelled = false;

  const tick = () => {
    if (cancelled) return;
    void refreshSessionIfNeeded().then((next) => {
      if (!cancelled) onSession(next);
    });
  };

  const onVisible = () => {
    if (document.visibilityState === "visible") tick();
  };

  const intervalId = window.setInterval(tick, CHECK_INTERVAL_MS);
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("focus", tick);

  return () => {
    cancelled = true;
    window.clearInterval(intervalId);
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("focus", tick);
  };
}
