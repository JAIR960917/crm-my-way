import { useMemo } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

function splitDatetimeLocal(value: string): { date: Date | undefined; time: string } {
  const raw = (value || "").trim();
  if (!raw) return { date: undefined, time: "09:00" };
  const [datePart, timePart] = raw.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  if (!y || !m || !d) return { date: undefined, time: "09:00" };
  const date = new Date(y, m - 1, d);
  if (Number.isNaN(date.getTime())) return { date: undefined, time: "09:00" };
  return { date, time: (timePart || "09:00").slice(0, 5) };
}

function combineDatetimeLocal(date: Date | undefined, time: string): string {
  if (!date) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  const [hhRaw, mmRaw] = (time || "00:00").split(":");
  const hh = Math.min(23, Math.max(0, parseInt(hhRaw, 10) || 0));
  const mm = Math.min(59, Math.max(0, parseInt(mmRaw, 10) || 0));
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(hh)}:${pad(mm)}`;
}

type DateTimePickerProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  clearable?: boolean;
  className?: string;
};

export default function DateTimePicker({
  id,
  value,
  onChange,
  placeholder = "Selecionar data e hora",
  clearable = true,
  className,
}: DateTimePickerProps) {
  const { date, time } = useMemo(() => splitDatetimeLocal(value), [value]);

  const label = date
    ? format(date, "dd/MM/yyyy", { locale: ptBR }) + ` às ${time}`
    : placeholder;

  const updateDate = (next: Date | undefined) => {
    if (!next) {
      onChange("");
      return;
    }
    onChange(combineDatetimeLocal(next, time));
  };

  const updateTime = (nextTime: string) => {
    if (!date) {
      onChange(combineDatetimeLocal(new Date(), nextTime));
      return;
    }
    onChange(combineDatetimeLocal(date, nextTime));
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          className={cn(
            "w-full justify-start text-left font-normal h-10",
            !date && "text-muted-foreground",
            className,
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
          <span className="truncate">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={updateDate}
          locale={ptBR}
          initialFocus
          className="p-3 pointer-events-auto"
        />
        <div className="border-t px-3 py-3 flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
          <Input
            type="time"
            value={time}
            onChange={(e) => updateTime(e.target.value)}
            className="h-9"
          />
        </div>
        {clearable && value && (
          <div className="border-t px-3 py-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full text-muted-foreground"
              onClick={() => onChange("")}
            >
              Limpar data
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
