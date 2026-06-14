import { useEffect, useMemo, useState } from "react";
import { Clock, Loader2, Play, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  DEFAULT_SSOTICA_AUTO_SYNC_TIMES,
  SSOTICA_AUTO_SYNC_ENABLED_KEY,
  SSOTICA_AUTO_SYNC_TIMES_KEY,
  getNextScheduledRun,
  normalizeTimeInput,
  parseSsoticaAutoSyncConfig,
} from "@/lib/ssotica-auto-sync";

const AUTO_BACKFILL_ACTIVE_KEY = "ssotica_auto_backfill_active_id";

export default function SSoticaAutoSyncConfigCard() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [runningNow, setRunningNow] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [times, setTimes] = useState<string[]>([...DEFAULT_SSOTICA_AUTO_SYNC_TIMES]);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("system_settings")
      .select("setting_key, setting_value")
      .in("setting_key", [SSOTICA_AUTO_SYNC_ENABLED_KEY, SSOTICA_AUTO_SYNC_TIMES_KEY]);

    const map = new Map((data || []).map((row) => [row.setting_key, row.setting_value]));
    const config = parseSsoticaAutoSyncConfig(
      map.get(SSOTICA_AUTO_SYNC_ENABLED_KEY),
      map.get(SSOTICA_AUTO_SYNC_TIMES_KEY),
      null,
    );
    setEnabled(config.enabled);
    setTimes(config.times);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const nextRun = useMemo(
    () => (enabled ? getNextScheduledRun(times) : null),
    [enabled, times],
  );

  const addTime = () => {
    setTimes((prev) => [...prev, "08:00"].sort());
  };

  const updateTime = (index: number, value: string) => {
    setTimes((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const removeTime = (index: number) => {
    setTimes((prev) => prev.filter((_, i) => i !== index));
  };

  const save = async () => {
    const normalized = times
      .map((t) => normalizeTimeInput(t))
      .filter((t): t is string => !!t);
    const unique = Array.from(new Set(normalized)).sort();

    if (enabled && unique.length === 0) {
      toast.error("Informe ao menos um horário válido para a sincronização automática.");
      return;
    }

    setSaving(true);
    try {
      const nowIso = new Date().toISOString();
      const rows = [
        {
          setting_key: SSOTICA_AUTO_SYNC_ENABLED_KEY,
          setting_value: enabled ? "true" : "false",
          updated_at: nowIso,
        },
        {
          setting_key: SSOTICA_AUTO_SYNC_TIMES_KEY,
          setting_value: JSON.stringify(unique.length > 0 ? unique : DEFAULT_SSOTICA_AUTO_SYNC_TIMES),
          updated_at: nowIso,
        },
      ];

      const { error } = await supabase.from("system_settings").upsert(rows, { onConflict: "setting_key" });
      if (error) throw error;

      if (!enabled) {
        await supabase.from("system_settings").upsert(
          {
            setting_key: AUTO_BACKFILL_ACTIVE_KEY,
            setting_value: "",
            updated_at: nowIso,
          },
          { onConflict: "setting_key" },
        );
      }

      setTimes(unique.length > 0 ? unique : [...DEFAULT_SSOTICA_AUTO_SYNC_TIMES]);
      toast.success(enabled ? "Sincronização automática ativada." : "Sincronização automática desativada.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar configuração");
    } finally {
      setSaving(false);
    }
  };

  const runNow = async () => {
    if (!enabled) {
      toast.error("Ative a sincronização automática antes de executar manualmente.");
      return;
    }

    setRunningNow(true);
    try {
      const { data, error } = await invokeEdgeFunction("ssotica-sync", {
        body: { mode: "start_auto_cycle" },
      });
      if (error) throw error;
      if (data && (data as { ok?: boolean }).ok === false) {
        throw new Error((data as { message?: string }).message || "Não foi possível iniciar o ciclo.");
      }
      toast.success(
        (data as { message?: string })?.message || "Ciclo de backfill iniciado.",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao iniciar ciclo");
    } finally {
      setRunningNow(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="h-4 w-4" />
          Sincronização automática
        </CardTitle>
        <CardDescription>
          Defina os horários (horário de Brasília) em que o backfill de 96 meses roda em sequência:
          Renovação → Cobrança em cada loja. O cron do servidor verifica a cada minuto.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando configuração...</p>
        ) : (
          <>
            <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="auto-sync-enabled">Ativar sincronização automática</Label>
                <p className="text-xs text-muted-foreground">
                  Quando desativada, nenhum ciclo automático será iniciado ou retomado.
                </p>
              </div>
              <Switch
                id="auto-sync-enabled"
                checked={enabled}
                onCheckedChange={setEnabled}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label>Horários de execução</Label>
                <Button type="button" variant="outline" size="sm" onClick={addTime}>
                  <Plus className="h-4 w-4 mr-1" />
                  Adicionar horário
                </Button>
              </div>
              <div className="space-y-2">
                {times.map((time, index) => (
                  <div key={`${index}-${time}`} className="flex items-center gap-2">
                    <Input
                      type="time"
                      value={time}
                      onChange={(e) => updateTime(index, e.target.value)}
                      className="w-[140px]"
                      disabled={!enabled}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 text-destructive"
                      onClick={() => removeTime(index)}
                      disabled={!enabled || times.length <= 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
              {enabled && nextRun && (
                <p className="text-xs text-muted-foreground">
                  Próxima execução agendada: <strong>{nextRun.label}</strong>
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void save()} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Salvar configuração
              </Button>
              <Button
                variant="secondary"
                onClick={() => void runNow()}
                disabled={!enabled || runningNow}
              >
                {runningNow ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 mr-2" />
                )}
                Executar ciclo agora
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
