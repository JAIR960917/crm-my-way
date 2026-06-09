import { useState } from "react";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePwaInstall } from "@/hooks/use-pwa-install";

const DISMISS_KEY = "android-install-banner-dismissed";

export default function PwaInstallBanner() {
  const { canInstall, install, isStandalone } = usePwaInstall();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });

  if (isStandalone || !canInstall || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // no-op
    }
  };

  return (
    <div className="sticky top-0 z-40 flex items-center gap-2 border-b border-primary/20 bg-primary/10 px-3 py-2 sm:px-4">
      <Download className="h-4 w-4 shrink-0 text-primary" />
      <p className="min-w-0 flex-1 text-sm text-foreground">
        Instale o app no celular para acesso rápido
      </p>
      <Button size="sm" className="h-8 shrink-0" onClick={() => void install()}>
        Instalar
      </Button>
      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={dismiss} aria-label="Fechar">
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
