/**
 * ============================================================================
 * main.tsx — Ponto de entrada da aplicação React
 * ============================================================================
 * Este é o PRIMEIRO arquivo executado no navegador. Ele:
 *   1) Decide se deve registrar um Service Worker (PWA / cache offline)
 *   2) Monta o componente raiz <App /> dentro do <div id="root"> do index.html
 *
 * Service Worker:
 *   - Em produção (domínio real): registra para habilitar PWA e cache offline.
 *   - Em preview do Lovable / dentro de iframe: NÃO registra, pois causaria
 *     conflito com o ambiente de pré-visualização.
 * ============================================================================
 */
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css"; // Tailwind + variáveis de tema (HSL)

/** Detecta se a página está rodando dentro de um iframe (preview do Lovable). */
const isInIframe = (() => {
  try {
    return window.self !== window.top;
  } catch {
    // Acesso bloqueado por cross-origin = está em iframe
    return true;
  }
})();

/** Detecta se o host é o ambiente de preview do Lovable (não-produção). */
const isPreviewHost =
  window.location.hostname.includes("id-preview--") ||
  window.location.hostname.includes("lovableproject.com");

/** Service Worker só é seguro em produção real, fora de iframe. */
const canRegisterServiceWorker =
  "serviceWorker" in navigator && !isPreviewHost && !isInIframe;

if (canRegisterServiceWorker) {
  // Registra após "load" para não competir com o boot da app.
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  });
} else {
  // Em preview: remove SW antigo se existir, evitando cache "fantasma".
  navigator.serviceWorker?.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => registration.unregister());
  });
}

// Monta a aplicação React no DOM.
createRoot(document.getElementById("root")!).render(<App />);
