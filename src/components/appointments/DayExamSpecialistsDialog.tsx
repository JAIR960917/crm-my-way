import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DEFAULT_WORK_PERIOD,
  formatExamDateLabel,
  toExamDateKey,
  WORK_PERIOD_LABELS,
  WORK_PERIODS,
  type CompanyWithExamColor,
  type EyeExamSpecialist,
  type WorkPeriod,
} from "@/lib/eyeExamSchedule";

type Row = {
  rowId: string;
  companyId: string;
  specialistId: string;
  workPeriod: WorkPeriod;
};

type RawDayRow = {
  id: string;
  company_id: string;
  company_eye_exam_day_specialists?: { specialist_id: string; work_period: string | null }[];
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: Date | null;
  companies: CompanyWithExamColor[];
  specialists: EyeExamSpecialist[];
  onSaved: () => void;
};

function newRowId() {
  return Math.random().toString(36).slice(2);
}

export default function DayExamSpecialistsDialog({
  open,
  onOpenChange,
  date,
  companies,
  specialists,
  onSaved,
}: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [dayIdByCompany, setDayIdByCompany] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const examDate = date ? toExamDateKey(date) : "";
  const activeSpecialists = specialists.filter((s) => s.active);

  useEffect(() => {
    if (!open || !date) return;
    setLoading(true);
    void supabase
      .from("company_eye_exam_days")
      .select("id, company_id, company_eye_exam_day_specialists ( specialist_id, work_period )")
      .eq("exam_date", examDate)
      .then(({ data }) => {
        const dayIds = new Map<string, string>();
        const loadedRows: Row[] = [];
        for (const day of (data || []) as RawDayRow[]) {
          dayIds.set(day.company_id, day.id);
          for (const link of day.company_eye_exam_day_specialists || []) {
            loadedRows.push({
              rowId: newRowId(),
              companyId: day.company_id,
              specialistId: link.specialist_id,
              workPeriod: (link.work_period as WorkPeriod) || DEFAULT_WORK_PERIOD,
            });
          }
        }
        setDayIdByCompany(dayIds);
        setRows(loadedRows);
        setLoading(false);
      });
  }, [open, date, examDate]);

  const addRow = () => {
    setRows((prev) => [
      ...prev,
      {
        rowId: newRowId(),
        companyId: companies[0]?.id || "",
        specialistId: activeSpecialists[0]?.id || "",
        workPeriod: DEFAULT_WORK_PERIOD,
      },
    ]);
  };

  const removeRow = (rowId: string) => {
    setRows((prev) => prev.filter((r) => r.rowId !== rowId));
  };

  const updateRow = (rowId: string, patch: Partial<Row>) => {
    setRows((prev) => prev.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)));
  };

  const handleSave = async () => {
    const validRows = rows.filter((r) => r.companyId && r.specialistId);
    if (validRows.length !== rows.length) {
      toast.error("Preencha empresa e especialista em todas as linhas, ou remova as incompletas.");
      return;
    }

    setSaving(true);
    try {
      const byCompany = new Map<string, Row[]>();
      for (const row of validRows) {
        if (!byCompany.has(row.companyId)) byCompany.set(row.companyId, []);
        byCompany.get(row.companyId)!.push(row);
      }

      // Empresas que tinham dia cadastrado e agora ficaram sem nenhum especialista: remove o dia.
      for (const [companyId, dayId] of dayIdByCompany.entries()) {
        if (!byCompany.has(companyId)) {
          const { error } = await supabase.from("company_eye_exam_days").delete().eq("id", dayId);
          if (error) throw error;
        }
      }

      for (const [companyId, companyRows] of byCompany.entries()) {
        let dayId = dayIdByCompany.get(companyId) || null;
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

        const dedupedByName = new Map<string, Row>();
        for (const row of companyRows) dedupedByName.set(row.specialistId, row);

        const inserts = [...dedupedByName.values()].map((row) => ({
          eye_exam_day_id: dayId!,
          specialist_id: row.specialistId,
          work_period: row.workPeriod,
        }));
        const { error: insErr } = await supabase.from("company_eye_exam_day_specialists").insert(inserts);
        if (insErr) throw insErr;
      }

      toast.success("Escala do dia salva");
      onSaved();
      onOpenChange(false);
    } catch {
      toast.error("Erro ao salvar escala do dia");
    } finally {
      setSaving(false);
    }
  };

  const dateLabel = date ? formatExamDateLabel(examDate) : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Especialistas no dia</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{dateLabel}</p>

        {loading ? (
          <p className="text-sm text-muted-foreground py-4">Carregando...</p>
        ) : companies.length === 0 || activeSpecialists.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            Cadastre empresas e especialistas antes de marcar dias.
          </p>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto py-1">
            {rows.length === 0 && (
              <p className="text-sm text-muted-foreground py-2">Nenhum especialista alocado neste dia ainda.</p>
            )}
            {rows.map((row) => (
              <div key={row.rowId} className="flex items-center gap-2 rounded-md border px-2 py-2">
                <Select value={row.companyId} onValueChange={(v) => updateRow(row.rowId, { companyId: v })}>
                  <SelectTrigger className="h-9 flex-1 min-w-0"><SelectValue placeholder="Empresa" /></SelectTrigger>
                  <SelectContent>
                    {companies.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={row.specialistId} onValueChange={(v) => updateRow(row.rowId, { specialistId: v })}>
                  <SelectTrigger className="h-9 flex-1 min-w-0"><SelectValue placeholder="Especialista" /></SelectTrigger>
                  <SelectContent>
                    {activeSpecialists.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={row.workPeriod} onValueChange={(v) => updateRow(row.rowId, { workPeriod: v as WorkPeriod })}>
                  <SelectTrigger className="h-9 w-[120px] shrink-0"><SelectValue placeholder="Período" /></SelectTrigger>
                  <SelectContent>
                    {WORK_PERIODS.map((p) => (
                      <SelectItem key={p} value={p}>{WORK_PERIOD_LABELS[p]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-destructive" onClick={() => removeRow(row.rowId)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={addRow} className="w-full">
              <Plus className="h-4 w-4 mr-1" /> Adicionar especialista
            </Button>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => void handleSave()} disabled={saving || loading}>
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
