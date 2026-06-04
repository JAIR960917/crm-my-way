import {
  addDays,
  addMonths,
  addWeeks,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from "date-fns";
import { ptBR } from "date-fns/locale";

export type CalendarViewMode = "month" | "week" | "day";

export function getCalendarQueryRange(focusDate: Date, view: CalendarViewMode) {
  if (view === "month") {
    const monthStart = startOfMonth(focusDate);
    const monthEnd = endOfMonth(focusDate);
    return {
      queryStart: startOfWeek(monthStart, { weekStartsOn: 0 }),
      queryEnd: endOfWeek(monthEnd, { weekStartsOn: 0 }),
      label: format(focusDate, "MMMM 'de' yyyy", { locale: ptBR }),
    };
  }
  if (view === "week") {
    const weekStart = startOfWeek(focusDate, { weekStartsOn: 0 });
    const weekEnd = endOfWeek(focusDate, { weekStartsOn: 0 });
    return {
      queryStart: weekStart,
      queryEnd: weekEnd,
      label: `${format(weekStart, "d MMM", { locale: ptBR })} – ${format(weekEnd, "d MMM yyyy", { locale: ptBR })}`,
    };
  }
  return {
    queryStart: startOfDay(focusDate),
    queryEnd: endOfDay(focusDate),
    label: format(focusDate, "d 'de' MMMM 'de' yyyy", { locale: ptBR }),
  };
}

export function shiftFocusDate(focusDate: Date, view: CalendarViewMode, dir: -1 | 1) {
  if (view === "month") return dir === 1 ? addMonths(focusDate, 1) : subMonths(focusDate, 1);
  if (view === "week") return dir === 1 ? addWeeks(focusDate, 1) : subWeeks(focusDate, 1);
  return addDays(focusDate, dir);
}

export function buildMonthGrid(focusDate: Date): Date[] {
  const monthStart = startOfMonth(focusDate);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
}

export function buildWeekDays(focusDate: Date): Date[] {
  const weekStart = startOfWeek(focusDate, { weekStartsOn: 0 });
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

export const WEEKDAY_LABELS = ["DOM.", "SEG.", "TER.", "QUA.", "QUI.", "SEX.", "SÁB."];

export const HOUR_SLOTS = Array.from({ length: 14 }, (_, i) => i + 7);

export function dayKey(d: Date) {
  return format(d, "yyyy-MM-dd");
}

export function isConsultaPaga(appt: { consulta_paga: boolean | null }) {
  return appt.consulta_paga === true;
}

export { isSameDay, isSameMonth, format, ptBR, startOfDay };
