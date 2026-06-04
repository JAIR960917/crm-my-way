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


export const CALENDAR_GRID_START_HOUR = 7;
export const CALENDAR_GRID_END_HOUR = 20;

export const HOUR_CHIP_HEIGHT = 22;
export const HOUR_ROW_GAP = 2;
export const HOUR_ROW_PADDING = 4;
export const HOUR_ROW_MIN_HEIGHT = 48;

export type CalendarEventLayout<T extends { scheduled_datetime: string }> = {
  item: T;
  top: number;
  height: number;
  column: number;
  columns: number;
};

function parseApptDate(iso: string) {
  return new Date(iso);
}

function apptStartMinutes(item: { scheduled_datetime: string }) {
  const d = parseApptDate(item.scheduled_datetime);
  return d.getHours() * 60 + d.getMinutes();
}

function apptLocalHour(item: { scheduled_datetime: string }) {
  return parseApptDate(item.scheduled_datetime).getHours();
}

function apptsInHour<T extends { scheduled_datetime: string }>(appts: T[], hour: number): T[] {
  return appts
    .filter((a) => apptLocalHour(a) === hour)
    .sort((a, b) => apptStartMinutes(a) - apptStartMinutes(b));
}

function rowsNeededInHour<T extends { scheduled_datetime: string }>(appts: T[]): number {
  if (appts.length === 0) return 0;
  return new Set(appts.map(apptStartMinutes)).size;
}

function hourHeightFromAppts<T extends { scheduled_datetime: string }>(appts: T[]): number {
  if (appts.length === 0) return HOUR_ROW_MIN_HEIGHT;
  // Uma linha por horário distinto; vários no mesmo horário dividem a linha (lado a lado)
  const rows = rowsNeededInHour(appts);
  return Math.max(
    HOUR_ROW_MIN_HEIGHT,
    HOUR_ROW_PADDING * 2 + rows * HOUR_CHIP_HEIGHT + (rows - 1) * HOUR_ROW_GAP,
  );
}

/** Altura de cada faixa horária = maior necessidade entre os dias visíveis */
export function computeHourHeights<T extends { scheduled_datetime: string }>(
  daysAppts: T[][],
): Record<number, number> {
  const heights: Record<number, number> = {};
  for (const h of HOUR_SLOTS) {
    let maxH = HOUR_ROW_MIN_HEIGHT;
    for (const dayAppts of daysAppts) {
      maxH = Math.max(maxH, hourHeightFromAppts(apptsInHour(dayAppts, h)));
    }
    heights[h] = maxH;
  }
  return heights;
}

function layoutApptsForDay<T extends { scheduled_datetime: string }>(
  dayAppts: T[],
  hourHeights: Record<number, number>,
): CalendarEventLayout<T>[] {
  const layouts: CalendarEventLayout<T>[] = [];
  let hourTop = 0;

  for (const h of HOUR_SLOTS) {
    const hHeight = hourHeights[h];
    const inHour = apptsInHour(dayAppts, h);

    const groups = new Map<number, T[]>();
    for (const a of inHour) {
      const key = apptStartMinutes(a);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(a);
    }

    const sortedGroups = [...groups.entries()].sort((a, b) => a[0] - b[0]);
    const rowCount = sortedGroups.length;
    const available = hHeight - HOUR_ROW_PADDING * 2;
    const rowH = rowCount > 0
      ? (available - (rowCount - 1) * HOUR_ROW_GAP) / rowCount
      : 0;

    let y = hourTop + HOUR_ROW_PADDING;
    for (const [, group] of sortedGroups) {
      for (let col = 0; col < group.length; col++) {
        layouts.push({
          item: group[col],
          top: y,
          height: rowH,
          column: col,
          columns: group.length,
        });
      }
      y += rowH + HOUR_ROW_GAP;
    }
    hourTop += hHeight;
  }
  return layouts;
}

export function buildTimeGridLayout<T extends { scheduled_datetime: string }>(
  days: Date[],
  byDay: Map<string, T[]>,
) {
  const daysAppts = days.map((d) => byDay.get(dayKey(d)) || []);
  const hourHeights = computeHourHeights(daysAppts);
  const totalHeight = HOUR_SLOTS.reduce((sum, h) => sum + hourHeights[h], 0);
  const layoutsByDay = new Map<string, CalendarEventLayout<T>[]>();

  for (const day of days) {
    const key = dayKey(day);
    layoutsByDay.set(key, layoutApptsForDay(byDay.get(key) || [], hourHeights));
  }

  return { hourHeights, totalHeight, layoutsByDay };
}

export function getNowLineTop(now: Date, hourHeights: Record<number, number>): number | null {
  const h = now.getHours();
  const m = now.getMinutes();
  if (h < CALENDAR_GRID_START_HOUR || h > CALENDAR_GRID_END_HOUR) return null;

  let top = 0;
  for (const slotH of HOUR_SLOTS) {
    if (slotH === h) return top + (m / 60) * hourHeights[slotH];
    top += hourHeights[slotH];
  }
  return null;
}

export { isSameDay, isSameMonth, format, ptBR, startOfDay };
