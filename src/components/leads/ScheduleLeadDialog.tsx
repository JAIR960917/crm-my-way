import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarIcon, Clock } from "lucide-react";
import { FORMAS_PAGAMENTO_OCULOS } from "@/lib/appointmentUtils";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  leadName: string;
  leadPhone: string;
  canalAgendamento: string;
  saving: boolean;
  onSubmit: (data: {
    scheduled_datetime: string;
    forma_pagamento: string;
    forma_pagamento_oculos: string;
    canal_agendamento: string;
    consulta_paga: boolean;
    consulta_paga_no_agendamento: boolean;
  }) => void;
};

export default function ScheduleLeadDialog({
  open,
  onOpenChange,
  leadName,
  leadPhone,
  canalAgendamento,
  saving,
  onSubmit,
}: Props) {
  const [dateStr, setDateStr] = useState("");
  const [time, setTime] = useState("09:00");
  const [formaPagamento, setFormaPagamento] = useState("");
  const [consultaPaga, setConsultaPaga] = useState<"sim" | "nao" | "">("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!dateStr || !formaPagamento || !consultaPaga || !canalAgendamento) return;

    const [y, mo, d] = dateStr.split("-").map(Number);
    const [h, m] = time.split(":").map(Number);
    const dt = new Date(y, mo - 1, d, h, m, 0, 0);
    const paga = consultaPaga === "sim";

    onSubmit({
      scheduled_datetime: dt.toISOString(),
      forma_pagamento: formaPagamento,
      forma_pagamento_oculos: formaPagamento,
      canal_agendamento: canalAgendamento,
      consulta_paga: paga,
      consulta_paga_no_agendamento: paga,
    });

    setDateStr("");
    setTime("09:00");
    setFormaPagamento("");
    setConsultaPaga("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>📅 Agendar Consulta</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
            <p className="text-sm"><span className="text-muted-foreground">Cliente:</span> <span className="font-medium">{leadName}</span></p>
            {leadPhone && <p className="text-sm"><span className="text-muted-foreground">Telefone:</span> <span className="font-medium">{leadPhone}</span></p>}
            {canalAgendamento && (
              <p className="text-sm"><span className="text-muted-foreground">Canal:</span> <span className="font-medium">{canalAgendamento}</span></p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Data do Agendamento <span className="text-destructive">*</span></Label>
            <div className="relative">
              <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-destructive pointer-events-none" />
              <Input
                type="date"
                value={dateStr}
                onChange={(e) => setDateStr(e.target.value)}
                required
                onClick={(e) => (e.currentTarget as any).showPicker?.()}
                className="pl-10 cursor-pointer"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Horário <span className="text-destructive">*</span></Label>
            <div className="relative">
              <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-destructive pointer-events-none" />
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} required className="pl-10 [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:right-0 [&::-webkit-calendar-picker-indicator]:w-8 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:cursor-pointer" />
              <Clock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-destructive pointer-events-none" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Forma de pagamento do Óculos <span className="text-destructive">*</span></Label>
            <Select value={formaPagamento} onValueChange={setFormaPagamento} required>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {FORMAS_PAGAMENTO_OCULOS.map((fp) => (
                  <SelectItem key={fp} value={fp}>{fp}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Consulta paga no agendamento? <span className="text-destructive">*</span></Label>
            <Select value={consultaPaga} onValueChange={(v) => setConsultaPaga(v as "sim" | "nao")} required>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sim">Sim</SelectItem>
                <SelectItem value="nao">Não</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button type="submit" className="w-full" disabled={saving || !dateStr || !formaPagamento || !consultaPaga || !canalAgendamento}>
            {saving ? "Agendando..." : "Confirmar Agendamento"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
