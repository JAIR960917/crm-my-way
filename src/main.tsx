/**
 * Ponto de entrada: bootstrap PWA (iOS) + montagem do React.
 */
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import RootErrorBoundary from "./components/RootErrorBoundary.tsx";
import "@/hooks/use-pwa-install";
import {
  isAndroidInAppBrowser,
  isIOSInAppBrowser,
  registerPushServiceWorker,
  runPwaBootstrap,
} from "@/lib/pwaBootstrap";
import "./index.css";

const isInIframe = (() => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
})();

const isPreviewHost =
  window.location.hostname.includes("id-preview--") ||
  window.location.hostname.includes("lovableproject.com");

const canRegisterServiceWorker =
  "serviceWorker" in navigator && !isPreviewHost && !isInIframe;

function showBootMessage(html: string) {
  const root = document.getElementById("root");
  if (root) root.innerHTML = html;
}

function mountApp() {
  const rootEl = document.getElementById("root");
  if (!rootEl) {
    showBootMessage("<p style='padding:24px;font-family:system-ui'>Elemento root não encontrado.</p>");
    return;
  }

  if (isIOSInAppBrowser()) {
    showBootMessage(`
      <div style="min-height:100vh;padding:24px;font-family:system-ui,-apple-system,sans-serif;background:#0f172a;color:#f8fafc">
        <h1 style="font-size:1.2rem;margin-bottom:12px">Abra no Safari</h1>
        <p style="opacity:.85;line-height:1.5;margin-bottom:16px">
          No iPhone, links abertos pelo <strong>WhatsApp</strong> ou outros apps podem ficar com tela branca.
          Toque em <strong>Abrir no Safari</strong> ou copie o endereço e abra no Safari.
        </p>
        <p style="font-size:.85rem;opacity:.7">Depois você pode usar <strong>Adicionar à Tela de Início</strong> pelo Safari.</p>
      </div>
    `);
    return;
  }

  if (isAndroidInAppBrowser()) {
    showBootMessage(`
      <div style="min-height:100vh;padding:24px;font-family:system-ui,-apple-system,sans-serif;background:#0f172a;color:#f8fafc">
        <h1 style="font-size:1.2rem;margin-bottom:12px">Abra no Chrome</h1>
        <p style="opacity:.85;line-height:1.5;margin-bottom:16px">
          Links abertos pelo <strong>WhatsApp</strong> ou outros apps no Android só criam um <strong>atalho</strong>, não instalam o app completo.
          Toque nos <strong>três pontinhos</strong> e escolha <strong>Abrir no Chrome</strong>.
        </p>
        <p style="font-size:.85rem;opacity:.7">No Chrome, use <strong>Instalar app</strong> para instalar o PWA de verdade.</p>
      </div>
    `);
    return;
  }

  createRoot(rootEl).render(
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>,
  );
}

async function boot() {
  if (canRegisterServiceWorker) {
    await runPwaBootstrap();
    const controlled = await registerPushServiceWorker();
    if (!controlled) {
      try {
        if (!sessionStorage.getItem("crm_sw_reload")) {
          sessionStorage.setItem("crm_sw_reload", "1");
          location.reload();
          return;
        }
      } catch {
        // Safari modo privado / restrição de storage
      }
    }
  } else {
    navigator.serviceWorker?.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => registration.unregister());
    });
  }

  mountApp();
}

void boot();
