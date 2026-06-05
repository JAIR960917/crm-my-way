import { useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  buildMonthGrid,
  dayKey,
  format,
  isSameDay,
  isSameMonth,
  WEEKDAY_LABELS,
} from "@/lib/appointmentCalendarUtils";

export type CrediarioTask = {
  id: string;
  lead_name: string;
  scheduled_date: string;
};

const MONTH_MAX_VISIBLE = 5;

const CHIP_COLORS = [
  "bg-emerald-900 text-emerald-50 border-emerald-700 hover:bg-emerald-800",
  "bg-violet-900 text-violet-50 border-violet-700 hover:bg-violet-800",
  "bg-zinc-700 text-zinc-200 border-zinc-500 hover:bg-zinc-600",
];

function taskChipColor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash + id.charCodeAt(i)) % CHIP_COLORS.length;
  return CHIP_COLORS[hash];
}

function tasksByDay(tasks: CrediarioTask[]) {
  const map = new Map<string, CrediarioTask[]>();
  for (const t of tasks) {
    const key = t.scheduled_date.slice(0, 10);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(t);
  }
  map.forEach((list) => list.sort((a, b) => a.lead_name.localeCompare(b.lead_name, "pt-BR")));
  return map;
}

type Props = {
  tasks: CrediarioTask[];
  focusDate: Date;
  onSelectTask: (task: CrediarioTask) => void;
  onDayClick?: (date: Date) => void;
};

export default function CrediarioTasksCalendar({ tasks, focusDate, onSelectTask, onDayClick }: Props) {
  const byDay = useMemo(() => tasksByDay(tasks), [tasks]);
  const grid = buildMonthGrid(focusDate);
  const today = new Date();

  return (
    <div className="rounded-lg border overflow-hidden bg-card">
      <div className="grid grid-cols-7 border-b bg-muted/50">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="px-1 py-2 text-center text-[11px] font-semibold text-muted-foreground">
            {label}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 divide-x divide-y divide-border">
        {grid.map((day) => {
          const key = dayKey(day);
          const dayTasks = byDay.get(key) || [];
          const inMonth = isSameMonth(day, focusDate);
          const isToday = isSameDay(day, today);

          return (
            <div
              key={key}
              className={cn(
                "min-h-[140px] p-1 flex flex-col gap-0.5 bg-background cursor-pointer",
                !inMonth && "bg-muted/20 text-muted-foreground",
              )}
              onClick={() => onDayClick?.(day)}
            >
              <div className="flex flex-col items-center gap-0.5 shrink-0">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onDayClick?.(day); }}
                  className={cn(
                    "h-7 w-7 rounded-full text-sm font-medium flex items-center justify-center",
                    isToday && "bg-red-600 text-white",
                  )}
                >
                  {format(day, "d")}
                </button>
                {inMonth && dayTasks.length > 0 && (
                  <span className="text-[10px] text-muted-foreground font-medium">
                    {dayTasks.length} tarefa{dayTasks.length !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
              <div className="flex-1 flex flex-col gap-px min-h-0 overflow-hidden">
                {dayTasks.slice(0, MONTH_MAX_VISIBLE).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onSelectTask(t); }}
                    className={cn(
                      "h-4 shrink-0 text-[9px] px-1 py-0 leading-4 text-left rounded truncate border overflow-hidden",
                      taskChipColor(t.id),
                    )}
                    title={t.lead_name}
                  >
                    {t.lead_name || "—"}
                  </button>
                ))}
                {dayTasks.length > MONTH_MAX_VISIBLE && (
                  <span className="text-[9px] text-muted-foreground px-0.5 leading-4 shrink-0">
                    +{dayTasks.length - MONTH_MAX_VISIBLE} mais
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
