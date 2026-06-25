/** Bump quando precisar limpar SW/cache antigo (ex.: tela branca / removeChild). */
const SW_CACHE_GENERATION = "7";

const DEFER_REGISTER_KEY = "crm_sw_defer_register";

const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as Window & { MSStream?: unknown }).MSStream;

/** WhatsApp, Instagram, etc. — WebViews costumam quebrar PWA / módulos ES. */
export const isIOSInAppBrowser = () => {
  if (!isIOS()) return false;
  return /CriOS|FxiOS|EdgiOS|OPiOS|WhatsApp|FBAN|FBAV|Instagram|Line|MicroMessenger/i.test(
    navigator.userAgent,
  );
};

/** WebView do WhatsApp/Instagram no Android não instala PWA — só atalho no navegador embutido. */
export const isAndroidInAppBrowser = () => {
  if (!/Android/i.test(navigator.userAgent)) return false;
  return /; wv\)|WhatsApp|Instagram|FBAN|FBAV|Line|MicroMessenger/i.test(navigator.userAgent);
};

async function clearStalePwaCaches() {
  if ("caches" in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  }
}

async function unregisterAllServiceWorkers() {
  if (!("serviceWorker" in navigator)) return;
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((r) => r.unregister().catch(() => undefined)));
}

function readSwGeneration(): string {
  try {
    return localStorage.getItem("crm_sw_gen") || "";
  } catch {
    return "";
  }
}

function markGenerationAndDeferRegister() {
  try {
    localStorage.setItem("crm_sw_gen", SW_CACHE_GENERATION);
    sessionStorage.setItem(DEFER_REGISTER_KEY, "1");
  } catch {
    // Safari modo privado / restrição de storage
  }
}

/**
 * Roda ANTES do React montar. Limpa SW/cache legado e adia registro do SW nesta sessão.
 *
 * NUNCA limpa cache/SW quando está OFFLINE: isso é o que serve o app shell
 * (index.html + assets) abrindo sem internet. Se o dispositivo abriu offline
 * justamente na sessão em que uma geração nova foi publicada, limpar agora
 * apagaria a única cópia que poderia abrir o app — sem rede pra buscar a
 * nova, sobra tela em branco/erro "offline" e nenhuma forma de recuperar
 * sem reinstalar. A limpeza é só adiada: roda no próximo boot com internet.
 */
export async function preparePwaBeforeBoot(): Promise<void> {
  if (typeof window === "undefined") return;
  if (!navigator.onLine) return;

  const needsCleanup = readSwGeneration() !== SW_CACHE_GENERATION;
  if (!needsCleanup) return;

  await clearStalePwaCaches();
  await unregisterAllServiceWorkers();
  markGenerationAndDeferRegister();
}

/** @deprecated Use preparePwaBeforeBoot — mantido para compatibilidade interna. */
export async function runPwaBootstrap() {
  await preparePwaBeforeBoot();
}

function shouldDeferServiceWorkerRegistration(): boolean {
  try {
    if (sessionStorage.getItem(DEFER_REGISTER_KEY) === "1") {
      sessionStorage.removeItem(DEFER_REGISTER_KEY);
      return true;
    }
  } catch {
    // no-op
  }
  return false;
}

export async function registerPushServiceWorker(): Promise<boolean> {
  if (!("serviceWorker" in navigator)) return false;
  if (shouldDeferServiceWorkerRegistration()) return false;

  try {
    await navigator.serviceWorker.register("/service-worker.js", { scope: "/" });
    await navigator.serviceWorker.ready;
    return Boolean(navigator.serviceWorker.controller);
  } catch {
    return false;
  }
}
