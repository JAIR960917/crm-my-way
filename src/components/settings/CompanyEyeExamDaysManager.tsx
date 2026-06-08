/**
 * Configuração de dias com exame de vista por empresa.
 * Os dias marcados aparecem destacados no calendário de Agendamentos.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarDays, ChevronLeft, ChevronRight, Eye, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";

type Company = { id: string; name: string };

function toDateKey(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

export default function CompanyEyeExamDaysManager() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState<string>("");
  const [focusMonth, setFocusMonth] = useState(() => new Date());
  const [examDates, setExamDates] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    void supabase
      .from("companies")
      .select("id, name")
      .order("name")
      .then(({ data }) => {
        const list = (data || []) as Company[];
        setCompanies(list);
        if (list.length > 0) setCompanyId((prev) => prev || list[0].id);
        setLoading(false);
      });
  }, []);

  const loadExamDays = useCallback(async (cid: string) => {
    if (!cid) {
      setExamDates(new Set());
      return;
    }
    const { data, error } = await supabase
      .from("company_eye_exam_days")
      .select("exam_date")
      .eq("company_id", cid);
    if (error) {
      toast.error("Erro ao carregar dias de exame");
      return;
    }
    setExamDates(new Set((data || []).map((r) => String(r.exam_date).slice(0, 10))));
  }, []);

  useEffect(() => {
    if (companyId) void loadExamDays(companyId);
  }, [companyId, loadExamDays]);

  const selectedDates = useMemo(
    () => [...examDates].map((d) => parseISO(`${d}T12:00:00`)),
    [examDates],
  );

  const sortedDates = useMemo(
    () => [...examDates].sort((a, b) => a.localeCompare(b)),
    [examDates],
  );

  const toggleDate = async (date: Date | undefined) => {
    if (!date || !companyId || toggling) return;
    const key = toDateKey(date);
    setToggling(true);
    try {
      if (examDates.has(key)) {
        const { error } = await supabase
          .from("company_eye_exam_days")
          .delete()
          .eq("company_id", companyId)
          .eq("exam_date", key);
        if (error) throw error;
        setExamDates((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
        toast.success("Dia removido");
      } else {
        const { error } = await supabase.from("company_eye_exam_days").insert({
          company_id: companyId,
          exam_date: key,
        });
        if (error) throw error;
        setExamDates((prev) => new Set(prev).add(key));
        toast.success("Dia marcado para exame de vista");
      }
    } catch {
      toast.error("Erro ao atualizar dia");
    } finally {
      setToggling(false);
    }
  };

  const removeDate = async (key: string) => {
    if (!companyId || toggling) return;
    setToggling(true);
    try {
      const { error } = await supabase
        .from("company_eye_exam_days")
        .delete()
        .eq("company_id", companyId)
        .eq("exam_date", key);
      if (error) throw error;
      setExamDates((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    } catch {
      toast.error("Erro ao remover dia");
    } finally {
      setToggling(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">Carregando empresas...</p>;
  }

  if (companies.length === 0) {
    return <p className="text-sm text-muted-foreground">Cadastre empresas antes de configurar os dias de exame.</p>;
  }

  return (
    <div className="space-y-4 max-w-lg">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Eye className="h-5 w-5" />
          Dias de exame de vista
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          Marque os dias em que cada empresa realizará consultas de vista. No calendário de Agendamentos, esses dias
          aparecem em <span className="text-amber-500 font-medium">âmbar</span>.
        </p>
      </div>

      <div className="space-y-2">
        <Label>Empresa</Label>
        <Select value={companyId} onValueChange={setCompanyId}>
          <SelectTrigger>
            <SelectValue placeholder="Selecione a empresa" />
          </SelectTrigger>
          <SelectContent>
            {companies.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border bg-card p-3 space-y-3">
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4" />
            Calendário — clique para marcar/desmarcar
          </Label>
          <div className="flex gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setFocusMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setFocusMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <Calendar
          month={focusMonth}
          onMonthChange={setFocusMonth}
          onDayClick={(day) => void toggleDate(day)}
          locale={ptBR}
          className="p-0 pointer-events-auto"
          modifiers={{
            examDay: selectedDates,
          }}
          modifiersClassNames={{
            examDay: "!bg-amber-500 !text-white hover:!bg-amber-600 hover:!text-white rounded-md",
          }}
        />
      </div>

      {sortedDates.length > 0 && (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">
            {sortedDates.length} dia(s) marcado(s)
          </Label>
          <ul className="max-h-40 overflow-y-auto space-y-1 rounded-lg border divide-y">
            {sortedDates.map((key) => (
              <li key={key} className="flex items-center justify-between px-3 py-2 text-sm">
                <span>{format(parseISO(`${key}T12:00:00`), "dd/MM/yyyy (EEEE)", { locale: ptBR })}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  disabled={toggling}
                  onClick={() => void removeDate(key)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
