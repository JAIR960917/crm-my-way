import { useEffect, useMemo, useState } from "react";
import { Settings2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  CAMPANHA_COPA_JOGO_SETTING_KEY,
  DEFAULT_CAMPANHA_COPA_JOGO,
  type CampanhaCopaJogoConfig,
  flagUrl,
  jogoConfigWithDerived,
  parseJogoConfig,
} from "@/lib/campanha-copa-jogo";

type Props = {
  initialRaw: string | null;
  onSaved?: () => void;
};

export default function CampanhaCopaJogoConfigCard({ initialRaw, onSaved }: Props) {
  const [config, setConfig] = useState<CampanhaCopaJogoConfig>(() => parseJogoConfig(initialRaw));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setConfig(parseJogoConfig(initialRaw));
  }, [initialRaw]);

  const derived = useMemo(() => jogoConfigWithDerived(config), [config]);

  const update = (field: keyof CampanhaCopaJogoConfig, value: string) => {
    setConfig((prev) => ({ ...prev, [field]: value }));
  };

  const save = async () => {
    if (!config.team_home_name.trim() || !config.team_away_name.trim()) {
      toast.error("Informe o nome dos dois times.");
      return;
    }
    if (config.team_home_name.trim().toLowerCase() === config.team_away_name.trim().toLowerCase()) {
      toast.error("Os dois times devem ser diferentes.");
      return;
    }

    setSaving(true);
    try {
      const payload = JSON.stringify({
        team_home_name: config.team_home_name.trim(),
        team_away_name: config.team_away_name.trim(),
        team_home_flag: config.team_home_flag.trim().toLowerCase().slice(0, 2),
        team_away_flag: config.team_away_flag.trim().toLowerCase().slice(0, 2),
        match_meta: config.match_meta.trim(),
      });

      const { error } = await supabase.from("system_settings").upsert(
        {
          setting_key: CAMPANHA_COPA_JOGO_SETTING_KEY,
          setting_value: payload,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "setting_key" },
      );
      if (error) throw error;

      toast.success("Jogo atualizado. O formulário público já exibirá os novos times.");
      onSaved?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar jogo");
    } finally {
      setSaving(false);
    }
  };

  const resetDefaults = () => {
    setConfig({ ...DEFAULT_CAMPANHA_COPA_JOGO });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Settings2 className="h-4 w-4" />
          Configuração do jogo (formulário público)
        </CardTitle>
        <CardDescription>
          Altere os times quando iniciar um novo palpite. Cada confronto é identificado pelos dois
          times — o mesmo CPF pode participar de novo se pelo menos um time for diferente.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="team_home_name">Time da casa (esquerda)</Label>
            <Input
              id="team_home_name"
              value={config.team_home_name}
              onChange={(e) => update("team_home_name", e.target.value)}
              placeholder="Ex.: Brasil"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="team_away_name">Time visitante (direita)</Label>
            <Input
              id="team_away_name"
              value={config.team_away_name}
              onChange={(e) => update("team_away_name", e.target.value)}
              placeholder="Ex.: Marrocos"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="team_home_flag">Código da bandeira (casa)</Label>
            <Input
              id="team_home_flag"
              value={config.team_home_flag}
              onChange={(e) => update("team_home_flag", e.target.value)}
              placeholder="br"
              maxLength={2}
            />
            <p className="text-xs text-muted-foreground">Código ISO de 2 letras (br, ma, ar, us…)</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="team_away_flag">Código da bandeira (visitante)</Label>
            <Input
              id="team_away_flag"
              value={config.team_away_flag}
              onChange={(e) => update("team_away_flag", e.target.value)}
              placeholder="ma"
              maxLength={2}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="match_meta">Detalhes do jogo (opcional)</Label>
          <Input
            id="match_meta"
            value={config.match_meta}
            onChange={(e) => update("match_meta", e.target.value)}
            placeholder="Cidade · data · horário"
          />
        </div>

        <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Prévia</p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <span className="font-semibold">{derived.team_home_name}</span>
            <img src={flagUrl(derived.team_home_flag)} alt="" className="h-5 w-7 rounded-sm object-cover" />
            <span className="text-muted-foreground font-bold">×</span>
            <img src={flagUrl(derived.team_away_flag)} alt="" className="h-5 w-7 rounded-sm object-cover" />
            <span className="font-semibold">{derived.team_away_name}</span>
          </div>
          {derived.match_meta && (
            <p className="text-center text-xs text-muted-foreground">{derived.match_meta}</p>
          )}
          <p className="text-center text-xs text-muted-foreground">
            Confronto: <strong>{derived.jogo_label}</strong> · ID interno:{" "}
            <code className="text-[11px]">{derived.jogo_key}</code>
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? "Salvando..." : "Salvar jogo"}
          </Button>
          <Button type="button" variant="outline" onClick={resetDefaults}>
            Restaurar padrão
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
