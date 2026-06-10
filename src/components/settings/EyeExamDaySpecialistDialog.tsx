import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  DEFAULT_WORK_PERIOD,
  formatExamDateLabel,
  WORK_PERIOD_LABELS,
  WORK_PERIODS,
  type EyeExamDaySpecialistAssignment,
  type EyeExamSpecialist,
  type WorkPeriod,
} from "@/lib/eyeExamSchedule";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  examDate: string;
  specialists: EyeExamSpecialist[];
  assigned: EyeExamDaySpecialistAssignment[];
  eyeExamDayId: string | null;
  onSaved: () => void;
};

export default function EyeExamDaySpecialistDialog({
  open,
  onOpenChange,
  companyId,
  examDate,
  specialists,
  assigned,
  eyeExamDayId,
  onSaved,
}: Props) {
  const [assignments, setAssignments] = useState<Map<string, WorkPeriod>>(new Map());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAssignments(new Map(assigned.map((a) => [a.specialistId, a.workPeriod])));
  }, [open, assigned]);

  const toggle = (id: string) => {
    setAssignments((prev) => {
      const next = new Map(prev);
      if (next.has(id)) next.delete(id);
      else next.set(id, DEFAULT_WORK_PERIOD);
      return next;
    });
  };

  const setPeriod = (id: string, period: WorkPeriod) => {
    setAssignments((prev) => {
      const next = new Map(prev);
      if (next.has(id)) next.set(id, period);
      return next;
    });
  };

  const handleSave = async () => {
    if (assignments.size === 0) {
      toast.error("Selecione pelo menos um especialista");
      return;
    }
    setSaving(true);
    try {
      let dayId = eyeExamDayId;
      if (!dayId) {
        const { data, error } = await supabase
          .from("company_eye_exam_days")
          .insert({ company_id: companyId, exam_date: examDate })
          .select("id")
          .single();
        if (error) throw error;
        dayId = data.id;
      }

      const { error: delErr } = await supabase
        .from("company_eye_exam_day_specialists")
        .delete()
        .eq("eye_exam_day_id", dayId);
      if (delErr) throw delErr;

      const rows = [...assignments.entries()].map(([specialist_id, work_period]) => ({
        eye_exam_day_id: dayId!,
        specialist_id,
        work_period,
      }));
      const { error: insErr } = await supabase.from("company_eye_exam_day_specialists").insert(rows);
      if (insErr) throw insErr;

      toast.success("Escala do dia salva");
      onSaved();
      onOpenChange(false);
    } catch {
      toast.error("Erro ao salvar escala do dia");
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveDay = async () => {
    if (!eyeExamDayId) {
      onOpenChange(false);
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("company_eye_exam_days")
        .delete()
        .eq("id", eyeExamDayId);
      if (error) throw error;
      toast.success("Dia removido da escala");
      onSaved();
      onOpenChange(false);
    } catch {
      toast.error("Erro ao remover dia");
    } finally {
      setSaving(false);
    }
  };

  const dateLabel = formatExamDateLabel(examDate);
  const activeSpecialists = specialists.filter((s) => s.active);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Especialistas no dia</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{dateLabel}</p>

        {activeSpecialists.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            Cadastre especialistas na seção acima antes de marcar dias.
          </p>
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto py-1">
            {activeSpecialists.map((s) => {
              const isSelected = assignments.has(s.id);
              const period = assignments.get(s.id) ?? DEFAULT_WORK_PERIOD;
              return (
                <div
                  key={s.id}
                  className="flex items-center gap-2 rounded-md border px-3 py-2 hover:bg-muted/50"
                >
                  <label className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer">
                    <Checkbox checked={isSelected} onCheckedChange={() => toggle(s.id)} />
                    <span className="text-sm truncate">{s.name}</span>
                  </label>
                  <Select
                    value={period}
                    disabled={!isSelected}
                    onValueChange={(value) => setPeriod(s.id, value as WorkPeriod)}
                  >
                    <SelectTrigger className="h-8 w-[130px] shrink-0">
                      <SelectValue placeholder="Período" />
                    </SelectTrigger>
                    <SelectContent>
                      {WORK_PERIODS.map((p) => (
                        <SelectItem key={p} value={p}>
                          {WORK_PERIOD_LABELS[p]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              );
            })}
          </div>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {eyeExamDayId && (
            <Button type="button" variant="destructive" onClick={() => void handleRemoveDay()} disabled={saving}>
              Remover dia
            </Button>
          )}
          <div className="flex-1" />
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => void handleSave()} disabled={saving || activeSpecialists.length === 0}>
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
