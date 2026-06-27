import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import { useCrediarioTheme } from "@/contexts/CrediarioThemeContext";

interface ThemeRow {
  id: string;
  theme_primary_color: string;
  theme_background_color: string;
  theme_text_color: string;
  theme_button_color: string;
}

const COLOR_FIELDS: { key: keyof Omit<ThemeRow, "id">; label: string; placeholder: string }[] = [
  { key: "theme_primary_color", label: "Cor Primária (destaques)", placeholder: "220 72% 50%" },
  { key: "theme_button_color", label: "Cor dos Botões", placeholder: "220 72% 55%" },
  { key: "theme_background_color", label: "Cor de Fundo", placeholder: "222 47% 6%" },
  { key: "theme_text_color", label: "Cor dos Textos", placeholder: "210 20% 92%" },
];

/** Converte HSL "H S% L%" para hex (input type=color). */
function hslToHex(hsl: string): string {
  try {
    const parts = hsl.trim().split(/\s+/);
    const h = parseFloat(parts[0]) || 0;
    const s = (parseFloat(parts[1]) || 0) / 100;
    const l = (parseFloat(parts[2]) || 0) / 100;
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => {
      const k = (n + h / 30) % 12;
      const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
      return Math.round(255 * color).toString(16).padStart(2, "0");
    };
    return `#${f(0)}${f(8)}${f(4)}`;
  } catch {
    return "#888888";
  }
}

/** Converte hex para HSL "H S% L%". */
function hexToHsl(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) * 60; break;
      case g: h = ((b - r) / d + 2) * 60; break;
      case b: h = ((r - g) / d + 4) * 60; break;
    }
  }
  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/** Cores próprias do módulo Crediário — aplicadas só na área de conteúdo das telas /crediario/*. */
export default function CrediarioMarcaSection() {
  const [t, setT] = useState<ThemeRow | null>(null);
  const [saving, setSaving] = useState(false);
  const { refresh: refreshCrediarioTheme } = useCrediarioTheme();

  useEffect(() => {
    supabase
      .from("crediario_settings")
      .select("id, theme_primary_color, theme_background_color, theme_text_color, theme_button_color")
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setT({
            id: data.id,
            theme_primary_color: data.theme_primary_color ?? "",
            theme_background_color: data.theme_background_color ?? "",
            theme_text_color: data.theme_text_color ?? "",
            theme_button_color: data.theme_button_color ?? "",
          });
        }
      });
  }, []);

  if (!t) return <Loader2 className="h-6 w-6 animate-spin" />;

  const setField = (k: keyof Omit<ThemeRow, "id">, v: string) => setT({ ...t, [k]: v });

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("crediario_settings").update({
      theme_primary_color: t.theme_primary_color || null,
      theme_background_color: t.theme_background_color || null,
      theme_text_color: t.theme_text_color || null,
      theme_button_color: t.theme_button_color || null,
    }).eq("id", t.id);
    setSaving(false);
    if (error) toast.error("Erro ao salvar", { description: error.message });
    else {
      toast.success("Cores do Crediário salvas");
      await refreshCrediarioTheme();
    }
  };

  return (
    <div>
      <Card>
        <CardContent className="p-6 space-y-4">
          <h3 className="text-base font-semibold">Cores do Crediário</h3>
          <p className="text-sm text-muted-foreground">
            Aplicadas só dentro das telas do Crediário (a sidebar continua com o tema geral do sistema).
            Deixe em branco para usar o mesmo tema do restante do CRM.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {COLOR_FIELDS.map((field) => (
              <div key={field.key} className="space-y-2">
                <Label>{field.label}</Label>
                <div className="flex gap-2 items-center">
                  <Input
                    value={t[field.key]}
                    onChange={(e) => setField(field.key, e.target.value)}
                    placeholder={field.placeholder}
                    className="flex-1"
                  />
                  <div className="relative">
                    <div
                      className="h-9 w-9 rounded-md border shrink-0 cursor-pointer hover:ring-2 hover:ring-primary transition-all"
                      style={{ backgroundColor: t[field.key] ? `hsl(${t[field.key]})` : "transparent" }}
                      onClick={() => {
                        const input = document.getElementById(`crediario-color-${field.key}`) as HTMLInputElement;
                        input?.click();
                      }}
                      title="Clique para escolher a cor"
                    />
                    <input
                      id={`crediario-color-${field.key}`}
                      type="color"
                      className="absolute inset-0 opacity-0 w-0 h-0"
                      value={hslToHex(t[field.key] || "0 0% 50%")}
                      onChange={(e) => setField(field.key, hexToHsl(e.target.value))}
                    />
                  </div>
                  {t[field.key] && (
                    <Button variant="ghost" size="icon" onClick={() => setField(field.key, "")} title="Limpar (usar tema geral)">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="mt-6 flex justify-end">
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar cores do Crediário"}
        </Button>
      </div>
    </div>
  );
}
