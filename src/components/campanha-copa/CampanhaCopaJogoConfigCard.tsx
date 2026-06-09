import { useEffect, useMemo, useState } from "react";
import { Settings2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { syncFlagsFromTeamNames } from "@/lib/country-flag-code";
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

function TeamNameInput({
  id,
  label,
  value,
  flagCode,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  flagCode: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <img
          src={flagUrl(flagCode)}
          alt=""
          className="h-6 w-9 rounded-sm object-cover border shrink-0"
        />
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1"
        />
      </div>
    </div>
  );
}

export default function CampanhaCopaJogoConfigCard({ initialRaw, onSaved }: Props) {
  const [config, setConfig] = useState<CampanhaCopaJogoConfig>(() => parseJogoConfig(initialRaw));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setConfig(parseJogoConfig(initialRaw));
  }, [initialRaw]);

  const derived = useMemo(() => jogoConfigWithDerived(config), [config]);

  const updateTeamName = (field: "team_home_name" | "team_away_name", value: string) => {
    setConfig((prev) => {
      const next = { ...prev, [field]: value };
      return { ...next, ...syncFlagsFromTeamNames(next) };
    });
  };

  const save = async () => {
    const toSave = { ...config, ...syncFlagsFromTeamNames(config) };

    if (!toSave.team_home_name.trim() || !toSave.team_away_name.trim()) {
      toast.error("Informe o nome dos dois times.");
      return;
    }
    if (toSave.team_home_name.trim().toLowerCase() === toSave.team_away_name.trim().toLowerCase()) {
      toast.error("Os dois times devem ser diferentes.");
      return;
    }

    setSaving(true);
    try {
      const payload = JSON.stringify({
        team_home_name: toSave.team_home_name.trim(),
        team_away_name: toSave.team_away_name.trim(),
        team_home_flag: toSave.team_home_flag,
        team_away_flag: toSave.team_away_flag,
        match_meta: toSave.match_meta.trim(),
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
          Informe o nome do país — a bandeira é detectada automaticamente. Cada confronto é
          identificado pelos dois times; o mesmo CPF pode palpitar de novo se pelo menos um time
          for diferente.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <TeamNameInput
            id="team_home_name"
            label="Time da casa (esquerda)"
            value={config.team_home_name}
            flagCode={derived.team_home_flag}
            onChange={(v) => updateTeamName("team_home_name", v)}
            placeholder="Ex.: Brasil"
          />
          <TeamNameInput
            id="team_away_name"
            label="Time visitante (direita)"
            value={config.team_away_name}
            flagCode={derived.team_away_flag}
            onChange={(v) => updateTeamName("team_away_name", v)}
            placeholder="Ex.: Marrocos"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="match_meta">Detalhes do jogo (opcional)</Label>
          <Input
            id="match_meta"
            value={config.match_meta}
            onChange={(e) => setConfig((prev) => ({ ...prev, match_meta: e.target.value }))}
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
