import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, Loader2, Store } from "lucide-react";
import { cn } from "@/lib/utils";
import { parseStoredDate } from "@/lib/kanbanCardSort";
import {
  RENOVACAO_OUTRA_OTICA_FOLLOWUP_DAYS,
  RENOVACAO_OUTRA_OTICA_TASK_TITLE,
  buildOutraOticaFollowupDate,
  formatDateForDb,
  resolveStatusAfterOutraOtica,
  type RenovacaoFlowItem,
} from "@/lib/renovacaoFlow";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: RenovacaoFlowItem & { id: string; data?: Record<string, unknown> };
  clientName?: string;
  userId?: string;
  onSaved: () => void;
};

export default function RenovacaoOutraOticaDialog({
  open,
  onOpenChange,
  item,
  clientName,
  userId,
  onSaved,
}: Props) {
  const [renovou, setRenovou] = useState(false);
  const [examDate, setExamDate] = useState<Date | undefined>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setRenovou(!!item.renovou_outra_otica);
    setExamDate(
      item.data_exame_outra_otica ? parseStoredDate(item.data_exame_outra_otica) : undefined,
    );
  }, [open, item.renovou_outra_otica, item.data_exame_outra_otica]);

  const handleSave = async () => {
    if (renovou && !examDate) {
      toast.error("Informe a data do último exame na outra ótica.");
      return;
    }

    setSaving(true);
    try {
      const dateStr = renovou && examDate ? formatDateForDb(examDate) : null;
      const previousDate = item.data_exame_outra_otica || null;
      const dateChanged = dateStr !== previousDate;
      const toggledOn = renovou && !item.renovou_outra_otica;

      const nextItem: RenovacaoFlowItem = {
        ...item,
        renovou_outra_otica: renovou,
        data_exame_outra_otica: dateStr,
      };
      const resolvedStatus = resolveStatusAfterOutraOtica(nextItem);

      const { error } = await supabase
        .from("crm_renovacoes")
        .update({
          renovou_outra_otica: renovou,
          data_exame_outra_otica: dateStr,
          status: resolvedStatus,
        } as Record<string, unknown>)
        .eq("id", item.id);

      if (error) throw error;

      if (renovou && dateStr && userId && (dateChanged || toggledOn)) {
        const followup = buildOutraOticaFollowupDate(examDate!);
        const followupIso = followup.toISOString();

        const { data: existing } = await supabase
          .from("renovacao_activities")
          .select("id")
          .eq("renovacao_id", item.id)
          .is("completed_at", null)
          .ilike("title", "%outra ótica%")
          .maybeSingle();

        if (existing?.id) {
          const { error: taskErr } = await supabase
            .from("renovacao_activities")
            .update({
              scheduled_date: followupIso,
              title: RENOVACAO_OUTRA_OTICA_TASK_TITLE,
              description: `Exame em outra ótica em ${format(examDate!, "dd/MM/yyyy", { locale: ptBR })}. Retornar ${RENOVACAO_OUTRA_OTICA_FOLLOWUP_DAYS} dias antes da próxima renovação estimada.`,
            } as Record<string, unknown>)
            .eq("id", existing.id);
          if (taskErr) throw taskErr;
        } else {
          const { error: taskErr } = await supabase.from("renovacao_activities").insert({
            renovacao_id: item.id,
            title: RENOVACAO_OUTRA_OTICA_TASK_TITLE,
            description: `Exame em outra ótica em ${format(examDate!, "dd/MM/yyyy", { locale: ptBR })}. Retornar ${RENOVACAO_OUTRA_OTICA_FOLLOWUP_DAYS} dias antes da próxima renovação estimada.`,
            scheduled_date: followupIso,
            created_by: userId,
          } as Record<string, unknown>);
          if (taskErr) throw taskErr;
        }

        const nome = clientName || "Cliente";
        await supabase.from("crm_renovacao_notes").insert({
          renovacao_id: item.id,
          user_id: userId,
          content: `🏪 ${nome} renovou consulta em outra ótica (${format(examDate!, "dd/MM/yyyy", { locale: ptBR })}). Tarefa de retorno em ${format(followup, "dd/MM/yyyy", { locale: ptBR })}.`,
        } as Record<string, unknown>);
      }

      if (renovou && dateStr) {
        toast.success(
          `Registrado. Card reposicionado no fluxo e tarefa agendada para ${format(buildOutraOticaFollowupDate(examDate!), "dd/MM/yyyy", { locale: ptBR })}.`,
        );
      } else if (!renovou) {
        toast.success("Marcação de outra ótica removida.");
      } else {
        toast.success("Salvo com sucesso.");
      }

      onOpenChange(false);
      onSaved();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Store className="h-5 w-5" />
            Renovação em outra ótica
          </DialogTitle>
          <DialogDescription>
            {clientName ? (
              <>
                Cliente: <strong>{clientName}</strong>. A coluna do card passará a considerar a data do
                exame na outra ótica. Uma tarefa será criada para daqui a {RENOVACAO_OUTRA_OTICA_FOLLOWUP_DAYS}{" "}
                dias.
              </>
            ) : (
              <>
                A coluna do card passará a considerar a nova data. Tarefa automática em{" "}
                {RENOVACAO_OUTRA_OTICA_FOLLOWUP_DAYS} dias.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-start gap-3 rounded-lg border p-3">
            <Checkbox
              id="renovou-outra-otica"
              checked={renovou}
              onCheckedChange={(v) => setRenovou(v === true)}
            />
            <div className="space-y-1">
              <Label htmlFor="renovou-outra-otica" className="cursor-pointer font-medium">
                Cliente renovou consulta de vista em outra ótica
              </Label>
              <p className="text-xs text-muted-foreground">
                Marque quando o cliente fez exame/receita em outra loja.
              </p>
            </div>
          </div>

          {renovou && (
            <div className="space-y-2">
              <Label>Data do último exame na outra ótica</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !examDate && "text-muted-foreground",
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {examDate ? format(examDate, "dd/MM/yyyy", { locale: ptBR }) : "Selecionar data"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={examDate}
                    onSelect={setExamDate}
                    locale={ptBR}
                    disabled={(d) => d > new Date()}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Salvando…
              </>
            ) : (
              "Salvar"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
