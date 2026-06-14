import { useEffect, useState } from "react";
import { PartyPopper } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import ImageUploadField from "@/components/whatsapp/ImageUploadField";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  CAMPANHA_COPA_SUCCESS_SETTING_KEY,
  DEFAULT_CAMPANHA_COPA_SUCCESS,
  parseSuccessConfig,
  serializeSuccessConfig,
  type CampanhaCopaSuccessConfig,
} from "@/lib/campanha-copa-success";

type Props = {
  initialRaw: string;
  onSaved?: () => void;
};

export default function CampanhaCopaSuccessConfigCard({ initialRaw, onSaved }: Props) {
  const [config, setConfig] = useState<CampanhaCopaSuccessConfig>(() => parseSuccessConfig(initialRaw));

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setConfig(parseSuccessConfig(initialRaw));
  }, [initialRaw]);

  const update = (patch: Partial<CampanhaCopaSuccessConfig>) => {
    setConfig((prev) => ({ ...prev, ...patch }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.from("system_settings").upsert(
        {
          setting_key: CAMPANHA_COPA_SUCCESS_SETTING_KEY,
          setting_value: serializeSuccessConfig(config),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "setting_key" },
      );
      if (error) throw error;

      toast.success("Tela de sucesso atualizada. O formulário público carregará na próxima visita.");
      onSaved?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar tela de sucesso");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <PartyPopper className="h-4 w-4" />
          Tela pós-palpite (sucesso)
        </CardTitle>
        <CardDescription>
          Personalize a imagem e o convite exibidos após o envio do palpite em{" "}
          <code className="text-xs">/campanha-copa</code>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label>Imagem da tela de sucesso</Label>
          <p className="text-xs text-muted-foreground">
            Arte promocional exibida abaixo da mensagem de confirmação. Recomendado: horizontal ou
            quadrada (ex.: 800×600 px).
          </p>
          <ImageUploadField
            value={config.image_url || null}
            onChange={(url) => update({ image_url: url || "" })}
            label="Imagem pós-palpite"
            bucket="logos"
            folder="campanha-copa"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="success-title">Título do convite</Label>
          <Input
            id="success-title"
            value={config.title}
            onChange={(e) => update({ title: e.target.value })}
            placeholder={DEFAULT_CAMPANHA_COPA_SUCCESS.title}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="success-subtitle">Texto complementar</Label>
          <Textarea
            id="success-subtitle"
            value={config.subtitle}
            onChange={(e) => update({ subtitle: e.target.value })}
            placeholder={DEFAULT_CAMPANHA_COPA_SUCCESS.subtitle}
            rows={3}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="success-instagram-url">Link do canal / Instagram</Label>
            <Input
              id="success-instagram-url"
              type="url"
              value={config.instagram_url}
              onChange={(e) => update({ instagram_url: e.target.value })}
              placeholder="https://www.instagram.com/..."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="success-button-label">Texto do botão</Label>
            <Input
              id="success-button-label"
              value={config.button_label}
              onChange={(e) => update({ button_label: e.target.value })}
              placeholder={DEFAULT_CAMPANHA_COPA_SUCCESS.button_label}
            />
          </div>
        </div>

        <Button onClick={() => void save()} disabled={saving}>
          {saving ? "Salvando..." : "Salvar tela de sucesso"}
        </Button>
      </CardContent>
    </Card>
  );
}
