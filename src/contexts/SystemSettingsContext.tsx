/**
 * ============================================================================
 * SystemSettingsContext.tsx — Configurações visuais e de marca do sistema
 * ============================================================================
 * O QUE FAZ:
 *   - Lê chave/valor da tabela `system_settings` no banco
 *   - Aplica as cores escolhidas como variáveis CSS no <html>
 *   - Atualiza o título da aba e o favicon dinamicamente
 *   - Se o admin trocar a logo/cor em /configuracoes, todo o app reflete
 *
 * COMO USAR:
 *   const { settings, refresh } = useSystemSettings();
 *   <img src={settings.logo_url} />  // logo do sistema
 *   <h1>{settings.system_name}</h1>  // nome do CRM
 *
 * IMPORTANTE:
 *   Cores são strings HSL (ex.: "220 72% 50%") — não hex. Isso é exigido
 *   pelo design system do projeto (ver index.css e tailwind.config.ts).
 * ============================================================================
 */
import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { resolveStoragePublicUrl } from "@/lib/storage-url";

const BRANDING_SETTING_KEYS = [
  "system_name",
  "primary_color",
  "background_color",
  "text_color",
  "button_color",
  "logo_url",
  "pwa_icon_url",
  "pwa_splash_url",
  "maintenance_mode",
  "maintenance_admin_1",
  "maintenance_admin_2",
  "maintenance_title",
  "maintenance_message",
] as const;

/** Forma das configurações persistidas. */
type Settings = {
  system_name: string;
  primary_color: string;
  background_color: string;
  text_color: string;
  button_color: string;
  logo_url: string;
  pwa_icon_url: string;
  pwa_splash_url: string;
  maintenance_mode: string;
  maintenance_admin_1: string;
  maintenance_admin_2: string;
  maintenance_title: string;
  maintenance_message: string;
};

/** Defaults usados antes de buscar do banco e em caso de erro. */
const defaults: Settings = {
  system_name: "CRM Óticas Joonker",
  primary_color: "220 72% 50%",
  background_color: "222 47% 6%",
  text_color: "210 20% 92%",
  button_color: "220 72% 55%",
  logo_url: "",
  pwa_icon_url: "",
  pwa_splash_url: "",
  maintenance_mode: "false",
  maintenance_admin_1: "",
  maintenance_admin_2: "",
  maintenance_title: "Sistema em manutenção",
  maintenance_message: "Estamos realizando uma manutenção no sistema. Volte em breve — agradecemos a sua paciência.",
};

type Ctx = {
  settings: Settings;
  loading: boolean;
  /** Recarrega as configurações (chame após salvar mudanças). */
  refresh: () => Promise<void>;
};

const SystemSettingsContext = createContext<Ctx>({
  settings: defaults,
  loading: true,
  refresh: async () => {},
});

/** Hook público para consumir as configurações. */
export function useSystemSettings() {
  return useContext(SystemSettingsContext);
}

/**
 * Aplica as configurações como CSS no <html>:
 *   - Variáveis HSL (--primary, --background, etc.)
 *   - Favicon dinâmico
 *   - Título da aba
 */
function applyCSS(s: Settings) {
  const root = document.documentElement;

  // Cores de marca (sempre aplicadas)
  root.style.setProperty("--primary", s.button_color || s.primary_color);
  root.style.setProperty("--ring", s.primary_color);
  root.style.setProperty("--sidebar-primary", s.primary_color);
  root.style.setProperty("--sidebar-ring", s.primary_color);
  root.style.setProperty("--sidebar-accent", s.primary_color);

  // No modo escuro, sobrescrevemos fundo/texto.
  // No claro, removemos para que index.css volte a mandar.
  if (root.classList.contains("dark")) {
    root.style.setProperty("--background", s.background_color);
    root.style.setProperty("--foreground", s.text_color);
    root.style.setProperty("--card-foreground", s.text_color);
    root.style.setProperty("--popover-foreground", s.text_color);
  } else {
    root.style.removeProperty("--background");
    root.style.removeProperty("--foreground");
    root.style.removeProperty("--card-foreground");
    root.style.removeProperty("--popover-foreground");
  }

  // Favicon dinâmico (logo do sistema vira o ícone da aba).
  if (s.logo_url) {
    let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.type = "image/png";
    link.href = s.logo_url;
  }

  // Ícone do PWA: troca o apple-touch-icon e reescreve o manifest.webmanifest
  // (estático em /manifest.webmanifest) por uma versão em memória (blob URL)
  // apontando pro ícone customizado — não dá pra editar o arquivo estático
  // a partir do navegador.
  const appleLink = document.querySelector<HTMLLinkElement>("link[rel='apple-touch-icon']");
  if (appleLink) appleLink.href = s.pwa_icon_url || "/pwa-192x192.png";
  void applyPwaManifest(s.pwa_icon_url, s.system_name);

  // Cacheia localmente pra exibir a splash no próximo boot sem esperar a
  // sessão carregar (ver index.html).
  try {
    if (s.pwa_splash_url) localStorage.setItem("crm_pwa_splash_url", s.pwa_splash_url);
    else localStorage.removeItem("crm_pwa_splash_url");
    if (s.background_color) localStorage.setItem("crm_pwa_splash_bg", s.background_color);
  } catch {
    // Safari modo privado / restrição de storage
  }

  // Título da aba do navegador.
  if (s.system_name) document.title = s.system_name;
}

let lastManifestIconUrl: string | undefined;

/** Reescreve o <link rel="manifest"> com o ícone customizado (blob URL). Idempotente. */
async function applyPwaManifest(iconUrl: string, systemName: string) {
  if (iconUrl === lastManifestIconUrl) return;
  lastManifestIconUrl = iconUrl;

  const link = document.querySelector<HTMLLinkElement>("link[rel='manifest']");
  if (!link) return;

  try {
    const res = await fetch("/manifest.webmanifest");
    const manifest = await res.json();

    if (systemName) {
      manifest.name = systemName;
      manifest.short_name = systemName.slice(0, 30);
    }

    if (iconUrl) {
      manifest.icons = [
        { src: iconUrl, sizes: "192x192", type: "image/png", purpose: "any" },
        { src: iconUrl, sizes: "192x192", type: "image/png", purpose: "maskable" },
        { src: iconUrl, sizes: "512x512", type: "image/png", purpose: "any" },
        { src: iconUrl, sizes: "512x512", type: "image/png", purpose: "maskable" },
      ];
    }

    const blob = new Blob([JSON.stringify(manifest)], { type: "application/manifest+json" });
    const blobUrl = URL.createObjectURL(blob);
    const previousBlobUrl = link.href.startsWith("blob:") ? link.href : null;
    link.href = blobUrl;
    if (previousBlobUrl) URL.revokeObjectURL(previousBlobUrl);
  } catch {
    // Sem manifest customizado — mantém o estático padrão.
  }
}

/** Provider — envolva o app dentro de <AuthProvider> e antes das rotas. */
export function SystemSettingsProvider({ children }: { children: ReactNode }) {
  const { loading: authLoading, session } = useAuth();
  const [settings, setSettings] = useState<Settings>(defaults);
  const [loading, setLoading] = useState(true);

  /** Lê todas as linhas de system_settings e mescla com defaults. */
  const fetchSettings = useCallback(async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("system_settings")
      .select("setting_key, setting_value")
      .in("setting_key", [...BRANDING_SETTING_KEYS]);

    if (error || !data) {
      setSettings(defaults);
      setLoading(false);
      return;
    }

    // Mescla apenas chaves conhecidas (defaults é a fonte da verdade da forma).
    const merged = { ...defaults };
    data.forEach((row: any) => {
      if (row.setting_key in merged) {
        (merged as any)[row.setting_key] = row.setting_value;
      }
    });

    merged.logo_url = resolveStoragePublicUrl(merged.logo_url);
    merged.pwa_icon_url = resolveStoragePublicUrl(merged.pwa_icon_url);
    merged.pwa_splash_url = resolveStoragePublicUrl(merged.pwa_splash_url);

    setSettings(merged);
    setLoading(false);
  }, []);

  // Aplica CSS sempre que settings muda.
  useEffect(() => {
    applyCSS(settings);
  }, [settings]);

  // Busca settings quando a sessão fica disponível.
  useEffect(() => {
    if (authLoading) return;
    fetchSettings();
  }, [authLoading, session?.user?.id, fetchSettings]);

  // Reaplica CSS quando o tema muda (toggle dark/light no AppSidebar).
  useEffect(() => {
    const observer = new MutationObserver(() => applyCSS(settings));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, [settings]);

  return (
    <SystemSettingsContext.Provider value={{ settings, loading, refresh: fetchSettings }}>
      {children}
    </SystemSettingsContext.Provider>
  );
}
