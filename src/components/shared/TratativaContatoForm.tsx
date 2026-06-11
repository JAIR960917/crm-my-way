import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Phone, PhoneOff, CalendarCheck, CalendarX, CalendarIcon, Clock, Check } from "lucide-react";
import { toast } from "sonner";
import {
  FORMAS_PAGAMENTO_CONSULTA,
  FORMAS_PAGAMENTO_OCULOS,
  formaConsultaSemValor,
} from "@/lib/appointmentUtils";

export type TratativaSavePayload = {
  atendeu: "sim" | "nao";
  tratativa: string;
  tentativasObs: string;
  marcou: "sim" | "nao" | null;
  scheduledDatetime: string | null;
  formaPagamentoOculos: string;
  formaPagamentoConsulta: string;
  valorConsulta: number;
};

type Props = {
  title?: string;
  onSave: (payload: TratativaSavePayload) => Promise<void>;
  onDirtyChange?: (dirty: boolean) => void;
  disabled?: boolean;
};

export function consultaPagaFromForma(forma: string): boolean {
  return forma === "Pix/Dinheiro" || forma === "Cartão" || forma === "Cortesia";
}

export function valorConsultaFromForma(forma: string, valorStr: string): number {
  if (formaConsultaSemValor(forma)) return 0;
  return parseFloat(valorStr.replace(",", ".")) || 0;
}

export default function TratativaContatoForm({
  title = "Tentativa de contato",
  onSave,
  onDirtyChange,
  disabled,
}: Props) {
  const [atendeu, setAtendeu] = useState<"sim" | "nao" | null>(null);
  const [tratativa, setTratativa] = useState("");
  const [tentativasObs, setTentativasObs] = useState("");
  const [marcou, setMarcou] = useState<"sim" | "nao" | null>(null);
  const [dateStr, setDateStr] = useState("");
  const [time, setTime] = useState("09:00");
  const [formaPagamentoOculos, setFormaPagamentoOculos] = useState("");
  const [formaPagamentoConsulta, setFormaPagamentoConsulta] = useState("");
  const [valorConsulta, setValorConsulta] = useState("");
  const [saving, setSaving] = useState(false);

  const isDirty =
    atendeu !== null
    || tratativa.trim() !== ""
    || tentativasObs.trim() !== ""
    || marcou !== null
    || dateStr !== ""
    || formaPagamentoOculos !== ""
    || formaPagamentoConsulta !== ""
    || valorConsulta.trim() !== "";

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const reset = () => {
    setAtendeu(null);
    setTratativa("");
    setTentativasObs("");
    setMarcou(null);
    setDateStr("");
    setTime("09:00");
    setFormaPagamentoOculos("");
    setFormaPagamentoConsulta("");
    setValorConsulta("");
    onDirtyChange?.(false);
  };

  const handleSave = async () => {
    if (!atendeu) {
      toast.error("Selecione se o cliente atendeu");
      return;
    }
    if (atendeu === "sim" && !tratativa.trim()) {
      toast.error("Descreva a tratativa do contato");
      return;
    }
    if (atendeu === "nao" && !tentativasObs.trim()) {
      toast.error("Descreva como tentou contato com o cliente");
      return;
    }
    if (atendeu === "sim" && !marcou) {
      toast.error("Informe se o cliente marcou a consulta");
      return;
    }
    if (atendeu === "sim" && marcou === "sim") {
      if (!dateStr || !time || !formaPagamentoOculos || !formaPagamentoConsulta) {
        toast.error("Preencha todos os campos do agendamento");
        return;
      }
      if (!formaConsultaSemValor(formaPagamentoConsulta)) {
        const valorNum = parseFloat(valorConsulta.replace(",", "."));
        if (!valorConsulta.trim() || Number.isNaN(valorNum) || valorNum < 0) {
          toast.error("Informe o valor da consulta");
          return;
        }
      }
    }

    setSaving(true);
    try {
      let scheduledDatetime: string | null = null;
      if (atendeu === "sim" && marcou === "sim" && dateStr && time) {
        const [y, mo, d] = dateStr.split("-").map(Number);
        const [h, m] = time.split(":").map(Number);
        const dt = new Date(y, mo - 1, d, h || 0, m || 0, 0, 0);
        scheduledDatetime = dt.toISOString();
      }

      await onSave({
        atendeu,
        tratativa: tratativa.trim(),
        tentativasObs: tentativasObs.trim(),
        marcou: atendeu === "sim" ? marcou : null,
        scheduledDatetime,
        formaPagamentoOculos,
        formaPagamentoConsulta,
        valorConsulta: valorConsultaFromForma(formaPagamentoConsulta, valorConsulta),
      });
      reset();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "tente novamente";
      toast.error("Erro ao registrar contato: " + msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <Phone className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">{title}</span>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">O cliente atendeu?</Label>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant={atendeu === "sim" ? "default" : "outline"}
            className="flex-1"
            disabled={disabled}
            onClick={() => setAtendeu("sim")}
          >
            <Phone className="h-3.5 w-3.5 mr-1" /> Sim, atendeu
          </Button>
          <Button
            type="button"
            size="sm"
            variant={atendeu === "nao" ? "destructive" : "outline"}
            className="flex-1"
            disabled={disabled}
            onClick={() => { setAtendeu("nao"); setMarcou(null); }}
          >
            <PhoneOff className="h-3.5 w-3.5 mr-1" /> Não atendeu
          </Button>
        </div>
      </div>

      {atendeu === "nao" && (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">
            Como tentou contato? <span className="text-destructive">*</span>
          </Label>
          <Textarea
            value={tentativasObs}
            onChange={(e) => setTentativasObs(e.target.value)}
            rows={3}
            placeholder="Descreva as formas que tentou contato (ligação, WhatsApp, etc)..."
            className="text-sm min-h-[80px]"
            maxLength={1000}
            disabled={disabled}
          />
        </div>
      )}

      {atendeu === "sim" && (
        <>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              Tratativa do contato <span className="text-destructive">*</span>
            </Label>
            <Textarea
              value={tratativa}
              onChange={(e) => setTratativa(e.target.value)}
              rows={3}
              placeholder="Descreva o que foi conversado com o cliente..."
              className="text-sm min-h-[80px]"
              maxLength={1000}
              disabled={disabled}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">O cliente marcou a consulta?</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={marcou === "sim" ? "default" : "outline"}
                className="flex-1"
                disabled={disabled}
                onClick={() => setMarcou("sim")}
              >
                <CalendarCheck className="h-3.5 w-3.5 mr-1" /> Sim, marcou
              </Button>
              <Button
                type="button"
                size="sm"
                variant={marcou === "nao" ? "destructive" : "outline"}
                className="flex-1"
                disabled={disabled}
                onClick={() => setMarcou("nao")}
              >
                <CalendarX className="h-3.5 w-3.5 mr-1" /> Não marcou
              </Button>
            </div>
          </div>
        </>
      )}

      {atendeu === "sim" && marcou === "sim" && (
        <div className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-2.5">
          <p className="text-xs font-medium text-primary flex items-center gap-1">
            <CalendarCheck className="h-3.5 w-3.5" /> Dados do agendamento
          </p>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Data <span className="text-destructive">*</span></Label>
              <div className="relative">
                <CalendarIcon className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-destructive pointer-events-none" />
                <Input
                  type="date"
                  value={dateStr}
                  onChange={(e) => setDateStr(e.target.value)}
                  onClick={(e) => (e.currentTarget as HTMLInputElement).showPicker?.()}
                  className="pl-7 h-9 text-sm cursor-pointer"
                  disabled={disabled}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Horário <span className="text-destructive">*</span></Label>
              <div className="relative">
                <Clock className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-destructive pointer-events-none" />
                <Input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="pl-7 h-9 text-sm"
                  disabled={disabled}
                />
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              Forma de pagamento do Óculos <span className="text-destructive">*</span>
            </Label>
            <Select value={formaPagamentoOculos} onValueChange={setFormaPagamentoOculos} disabled={disabled}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {FORMAS_PAGAMENTO_OCULOS.map((fp) => (
                  <SelectItem key={fp} value={fp}>{fp}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              Pagamento da consulta <span className="text-destructive">*</span>
            </Label>
            <Select
              value={formaPagamentoConsulta}
              onValueChange={(v) => {
                setFormaPagamentoConsulta(v);
                if (formaConsultaSemValor(v)) setValorConsulta("");
              }}
              disabled={disabled}
            >
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {FORMAS_PAGAMENTO_CONSULTA.map((fp) => (
                  <SelectItem key={fp} value={fp}>{fp}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {formaPagamentoConsulta && !formaConsultaSemValor(formaPagamentoConsulta) && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                Valor da consulta (R$) <span className="text-destructive">*</span>
              </Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={valorConsulta}
                onChange={(e) => setValorConsulta(e.target.value)}
                placeholder="0,00"
                className="h-9 text-sm"
                disabled={disabled}
              />
            </div>
          )}
        </div>
      )}

      {atendeu && !disabled && (
        <Button
          type="button"
          size="sm"
          className="w-full"
          onClick={handleSave}
          disabled={saving}
        >
          <Check className="h-3.5 w-3.5 mr-1" />
          {saving
            ? "Salvando..."
            : atendeu === "sim" && marcou === "sim"
              ? "Salvar e Agendar"
              : "Salvar contato"}
        </Button>
      )}
    </div>
  );
}
