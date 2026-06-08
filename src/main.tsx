/**
 * Ponto de entrada: bootstrap PWA (iOS) + montagem do React.
 */
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import RootErrorBoundary from "./components/RootErrorBoundary.tsx";
import { isIOSInAppBrowser, registerPushServiceWorker, runPwaBootstrap } from "@/lib/pwaBootstrap";
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

  createRoot(rootEl).render(
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>,
  );
}

async function boot() {
  if (canRegisterServiceWorker) {
    await runPwaBootstrap();
    window.addEventListener("load", () => {
      void registerPushServiceWorker();
    });
  } else {
    navigator.serviceWorker?.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => registration.unregister());
    });
  }

  mountApp();
}

void boot();
