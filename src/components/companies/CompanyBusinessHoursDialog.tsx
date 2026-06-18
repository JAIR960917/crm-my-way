import { useEffect, useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Clock } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | null;
  companyName: string;
};

type DayRow = {
  day_of_week: number;
  is_open: boolean;
  start_time: string;
  end_time: string;
  slot_duration_minutes: number;
};

const DAY_LABELS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

function defaultRow(day: number): DayRow {
  return {
    day_of_week: day,
    is_open: day !== 0,
    start_time: "09:00",
    end_time: "18:00",
    slot_duration_minutes: 30,
  };
}

export default function CompanyBusinessHoursDialog({ open, onOpenChange, companyId, companyName }: Props) {
  const [rows, setRows] = useState<DayRow[]>(() => Array.from({ length: 7 }, (_, d) => defaultRow(d)));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("company_business_hours")
        .select("day_of_week, is_open, start_time, end_time, slot_duration_minutes")
        .eq("company_id", companyId);
      if (error) throw error;
      const byDay = new Map((data || []).map((r) => [r.day_of_week, r as DayRow]));
      setRows(Array.from({ length: 7 }, (_, d) => byDay.get(d) ?? defaultRow(d)));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar horários");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const updateRow = (day: number, patch: Partial<DayRow>) => {
    setRows((prev) => prev.map((r) => (r.day_of_week === day ? { ...r, ...patch } : r)));
  };

  const handleSave = async () => {
    if (!companyId) return;
    setSaving(true);
    try {
      const payload = rows.map((r) => ({
        company_id: companyId,
        day_of_week: r.day_of_week,
        is_open: r.is_open,
        start_time: r.start_time,
        end_time: r.end_time,
        slot_duration_minutes: r.slot_duration_minutes,
      }));
      const { error } = await supabase
        .from("company_business_hours")
        .upsert(payload, { onConflict: "company_id,day_of_week" });
      if (error) throw error;
      toast.success("Horário de funcionamento salvo");
      onOpenChange(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar horários");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Horário de funcionamento — {companyName}
          </DialogTitle>
          <DialogDescription>
            Define quando essa empresa atende e a duração de cada exame/atendimento. Usado para
            calcular horários disponíveis (ex.: agente de IA sugerindo vagas pro cliente).
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando...
          </div>
        ) : (
          <div className="space-y-3 py-2 max-h-[60vh] overflow-y-auto">
            {rows.map((row) => (
              <div key={row.day_of_week} className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">{DAY_LABELS[row.day_of_week]}</Label>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{row.is_open ? "Aberto" : "Fechado"}</span>
                    <Switch
                      checked={row.is_open}
                      onCheckedChange={(checked) => updateRow(row.day_of_week, { is_open: checked })}
                    />
                  </div>
                </div>
                {row.is_open && (
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Abre</Label>
                      <Input
                        type="time"
                        value={row.start_time}
                        onChange={(e) => updateRow(row.day_of_week, { start_time: e.target.value })}
                        className="h-9 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Fecha</Label>
                      <Input
                        type="time"
                        value={row.end_time}
                        onChange={(e) => updateRow(row.day_of_week, { end_time: e.target.value })}
                        className="h-9 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Duração (min)</Label>
                      <Input
                        type="number"
                        min={5}
                        step={5}
                        value={row.slot_duration_minutes}
                        onChange={(e) =>
                          updateRow(row.day_of_week, { slot_duration_minutes: parseInt(e.target.value, 10) || 30 })
                        }
                        className="h-9 text-sm"
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
