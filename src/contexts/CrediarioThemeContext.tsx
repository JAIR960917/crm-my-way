/**
 * ============================================================================
 * CrediarioThemeContext.tsx — Cores próprias do módulo Crediário
 * ============================================================================
 * Lê as 4 cores opcionais de crediario_settings (theme_*) e as disponibiliza
 * para o AppLayout aplicar como variáveis CSS SOMENTE na área de conteúdo
 * das rotas /crediario/* — a sidebar continua com o tema geral do CRM.
 * Cor vazia/NULL = não sobrescreve nada (usa o tema geral).
 * ============================================================================
 */
import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

type CrediarioTheme = {
  primary_color: string;
  background_color: string;
  text_color: string;
  button_color: string;
};

const empty: CrediarioTheme = {
  primary_color: "",
  background_color: "",
  text_color: "",
  button_color: "",
};

type Ctx = {
  theme: CrediarioTheme;
  /** true se ao menos uma cor foi customizada (vale a pena aplicar overrides). */
  hasCustomTheme: boolean;
  refresh: () => Promise<void>;
};

const CrediarioThemeContext = createContext<Ctx>({
  theme: empty,
  hasCustomTheme: false,
  refresh: async () => {},
});

export function useCrediarioTheme() {
  return useContext(CrediarioThemeContext);
}

export function CrediarioThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<CrediarioTheme>(empty);

  const fetchTheme = useCallback(async () => {
    const { data } = await supabase
      .from("crediario_settings")
      .select("theme_primary_color, theme_background_color, theme_text_color, theme_button_color")
      .limit(1)
      .maybeSingle();
    if (data) {
      setTheme({
        primary_color: data.theme_primary_color ?? "",
        background_color: data.theme_background_color ?? "",
        text_color: data.theme_text_color ?? "",
        button_color: data.theme_button_color ?? "",
      });
    }
  }, []);

  useEffect(() => {
    fetchTheme();
  }, [fetchTheme]);

  const hasCustomTheme = Object.values(theme).some((v) => v.trim() !== "");

  return (
    <CrediarioThemeContext.Provider value={{ theme, hasCustomTheme, refresh: fetchTheme }}>
      {children}
    </CrediarioThemeContext.Provider>
  );
}
