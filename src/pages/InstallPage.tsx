import { usePwaInstall } from "@/hooks/use-pwa-install";
import { isAndroidInAppBrowser } from "@/lib/pwaBootstrap";
import { Download, Share, Plus, MoreVertical, Check, ExternalLink, Globe, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function InstallPage() {
  const { canInstall, install, isIOS, isIOSSafari, isIOSExternalBrowser } = usePwaInstall();
  const isAndroidInApp = isAndroidInAppBrowser();

  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as any).standalone === true;

  if (isStandalone) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <Check className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-2xl font-bold text-foreground">App já instalado!</h1>
        <p className="text-muted-foreground">Você já está usando o app instalado.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-background p-6">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="flex justify-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary shadow-lg">
            <Download className="h-10 w-10 text-primary-foreground" />
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-foreground">Instalar o App</h1>
          <p className="text-muted-foreground">
            Instale o app no seu celular para acesso rápido e experiência completa.
          </p>
        </div>

        {/* Android / Chrome - botão direto */}
        {canInstall && (
          <Button onClick={install} size="lg" className="w-full gap-2 text-base">
            <Download className="h-5 w-5" />
            Instalar Agora
          </Button>
        )}

        {/* iOS outside Safari */}
        {isIOSExternalBrowser && (
          <div className="space-y-4 rounded-xl border border-border bg-card p-6 text-left">
            <div className="space-y-2">
              <h2 className="text-lg font-semibold text-card-foreground">
                Abra no Safari para instalar
              </h2>
              <p className="text-sm text-muted-foreground">
                No iPhone, o app <strong>só pode ser instalado pelo Safari</strong>. Dentro do WhatsApp ou de outro navegador, a opção de instalar não aparece.
              </p>
            </div>

            <div className="space-y-4">
              <Step number={1} icon={<ExternalLink className="h-5 w-5" />}>
                No navegador atual, toque em <strong>abrir no navegador</strong> ou no menu do app onde este link foi aberto
              </Step>
              <Step number={2} icon={<Globe className="h-5 w-5" />}>
                Escolha <strong>Safari</strong> ou copie o link e abra manualmente no Safari
              </Step>
              <Step number={3} icon={<Share className="h-5 w-5" />}>
                Depois, no Safari, toque em <strong>Compartilhar</strong> e selecione <strong>Adicionar à Tela de Início</strong>
              </Step>
            </div>

            <p className="mt-2 text-xs text-muted-foreground">
              Se você abriu este CRM pelo WhatsApp, isso é exatamente o motivo de não aparecer a instalação.
            </p>
          </div>
        )}

        {/* iOS Safari instructions */}
        {isIOS && isIOSSafari && (
          <div className="space-y-4 rounded-xl border border-border bg-card p-6 text-left">
            <h2 className="text-lg font-semibold text-card-foreground">
              Como instalar no iPhone / iPad
            </h2>
            <p className="text-sm text-muted-foreground">
              No Safari, siga estes passos:
            </p>
            <div className="space-y-4">
              <Step number={1} icon={<Share className="h-5 w-5" />}>
                Toque no ícone de <strong>Compartilhar</strong> (⬆) na barra inferior do Safari
              </Step>
              <Step number={2} icon={<Plus className="h-5 w-5" />}>
                Role para baixo e toque em <strong>"Adicionar à Tela de Início"</strong>
              </Step>
              <Step number={3} icon={<Check className="h-5 w-5" />}>
                Toque em <strong>"Adicionar"</strong> no canto superior direito
              </Step>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              ⚠️ Se a opção não aparecer, role o menu do Safari para baixo até encontrar <strong>Adicionar à Tela de Início</strong>.
            </p>
          </div>
        )}

        {/* Android in-app browser (WhatsApp etc.) */}
        {!isIOS && isAndroidInApp && (
          <div className="space-y-4 rounded-xl border border-amber-500/40 bg-card p-6 text-left">
            <h2 className="text-lg font-semibold text-card-foreground">
              Abra no Chrome para instalar o app
            </h2>
            <p className="text-sm text-muted-foreground">
              Pelo WhatsApp ou outro app interno, o Android só cria um <strong>atalho</strong> na tela inicial — não instala o PWA completo.
            </p>
            <div className="space-y-4">
              <Step number={1} icon={<ExternalLink className="h-5 w-5" />}>
                Toque em <strong>Abrir no Chrome</strong> no menu do app onde você abriu o link
              </Step>
              <Step number={2} icon={<Globe className="h-5 w-5" />}>
                No Chrome, aguarde a página carregar e use o botão <strong>Instalar Agora</strong> acima ou o menu <strong>⋮ → Instalar app</strong>
              </Step>
            </div>
          </div>
        )}

        {/* Android manual instructions (when beforeinstallprompt didn't fire) */}
        {!isIOS && !canInstall && !isAndroidInApp && (
          <div className="space-y-4 rounded-xl border border-border bg-card p-6 text-left">
            <h2 className="text-lg font-semibold text-card-foreground">
              Como instalar no Android (PWA completo)
            </h2>
            <p className="text-sm text-muted-foreground">
              Use o <strong>Google Chrome</strong>. A opção <strong>"Adicionar à tela inicial"</strong> cria apenas um atalho — procure por <strong>"Instalar app"</strong>.
            </p>
            <div className="space-y-4">
              <Step number={1} icon={<MoreVertical className="h-5 w-5" />}>
                Toque no menu <strong>⋮</strong> (três pontinhos) no canto superior direito do Chrome
              </Step>
              <Step number={2} icon={<Download className="h-5 w-5" />}>
                Toque em <strong>"Instalar app"</strong> — o diálogo deve mostrar o nome <strong>CRM Óticas Joonker</strong>
              </Step>
              <Step number={3} icon={<Check className="h-5 w-5" />}>
                Confirme tocando em <strong>"Instalar"</strong>
              </Step>
            </div>
            <Button
              variant="outline"
              className="mt-2 w-full gap-2"
              onClick={() => location.reload()}
            >
              <RefreshCw className="h-4 w-4" />
              Recarregar página
            </Button>
            <p className="text-xs text-muted-foreground">
              Se só aparecer "Adicionar à tela inicial", recarregue a página ou feche e abra o Chrome de novo digitando o endereço do CRM.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Step({ number, icon, children }: { number: number; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
        {number}
      </div>
      <div className="flex-1 pt-1 text-sm text-card-foreground">{children}</div>
    </div>
  );
}
