import { useState, useEffect, useSyncExternalStore } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let canInstallGlobal = false;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => fn());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getCanInstallSnapshot() {
  return canInstallGlobal && !isInStandaloneMode();
}

export function isInStandaloneMode() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as Window & { MSStream?: unknown }).MSStream;
}

function isSafariOnIOS() {
  if (!isIOS()) return false;

  const ua = navigator.userAgent;
  const isSafari = /Safari/i.test(ua);
  const excludedBrowsers = /CriOS|FxiOS|EdgiOS|OPiOS|OPT|DuckDuckGo|YaBrowser|UCBrowser|MiuiBrowser|SamsungBrowser|Instagram|FBAN|FBAV|Line|MicroMessenger|WhatsApp/i;

  return isSafari && !excludedBrowsers.test(ua);
}

/** Captura beforeinstallprompt antes do React montar (Chrome Android). */
function initGlobalPwaInstallCapture() {
  if (typeof window === "undefined") return;
  if ((window as Window & { __crmPwaInstallInit?: boolean }).__crmPwaInstallInit) return;
  (window as Window & { __crmPwaInstallInit?: boolean }).__crmPwaInstallInit = true;

  if (isInStandaloneMode() || isIOS()) return;

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    canInstallGlobal = true;
    notify();
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    canInstallGlobal = false;
    notify();
  });
}

initGlobalPwaInstallCapture();

export function usePwaInstall() {
  const canInstall = useSyncExternalStore(subscribe, getCanInstallSnapshot, () => false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const isiOSSafari = isSafariOnIOS();

  useEffect(() => {
    if (isInStandaloneMode()) return;

    if (isIOS()) {
      const dismissed = localStorage.getItem("ios-install-dismissed");
      if (!dismissed) {
        setShowIOSGuide(true);
      }
    }
  }, []);

  const install = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      canInstallGlobal = false;
      notify();
    }
    deferredPrompt = null;
  };

  const dismissIOSGuide = () => {
    setShowIOSGuide(false);
    localStorage.setItem("ios-install-dismissed", "1");
  };

  return {
    canInstall,
    install,
    showIOSGuide,
    dismissIOSGuide,
    isIOS: isIOS(),
    isIOSSafari: isiOSSafari,
    isIOSExternalBrowser: isIOS() && !isiOSSafari,
    isStandalone: isInStandaloneMode(),
  };
}
