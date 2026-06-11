import { useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  buildMonthGrid,
  buildTimeGridLayout,
  buildWeekDays,
  dayKey,
  format,
  getNowLineTop,
  HOUR_SLOTS,
  isSameDay,
  isSameMonth,
  ptBR,
  type CalendarEventLayout,
  type CalendarViewMode,
  WEEKDAY_LABELS,
} from "@/lib/appointmentCalendarUtils";

export type CrediarioTask = {
  id: string;
  lead_name: string;
  scheduled_date: string;
  scheduled_time: string;
  /** Tarefa pendente (cinza); concluídas não aparecem no calendário */
  is_pending?: boolean;
};

export type CrediarioTaskWithDatetime = CrediarioTask & {
  scheduled_datetime: string;
};

const MONTH_MAX_VISIBLE = 5;

const PENDING_CHIP = "bg-zinc-700 text-zinc-200 border-zinc-500 hover:bg-zinc-600";
const TRATATIVA_CHIP = "bg-emerald-900 text-emerald-50 border-emerald-700 hover:bg-emerald-800";

export function toScheduledDatetime(scheduled_date: string, scheduled_time: string): string {
  const d = scheduled_date.slice(0, 10);
  const t = (scheduled_time || "09:00").slice(0, 5);
  return `${d}T${t}:00`;
}

export function withScheduledDatetime<T extends CrediarioTask>(task: T): T & { scheduled_datetime: string } {
  return {
    ...task,
    scheduled_datetime: toScheduledDatetime(task.scheduled_date, task.scheduled_time),
  };
}

function taskChipColor(task: CrediarioTask) {
  if (task.is_pending === false) return TRATATIVA_CHIP;
  return PENDING_CHIP;
}

function tasksByDay(tasks: CrediarioTaskWithDatetime[]) {
  const map = new Map<string, CrediarioTaskWithDatetime[]>();
  for (const t of tasks) {
    const key = t.scheduled_date.slice(0, 10);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(t);
  }
  map.forEach((list) =>
    list.sort(
      (a, b) => new Date(a.scheduled_datetime).getTime() - new Date(b.scheduled_datetime).getTime(),
    ),
  );
  return map;
}

function groupLayoutsBySlot<T extends { scheduled_datetime: string }>(
  layouts: CalendarEventLayout<T>[],
) {
  const groups = new Map<string, CalendarEventLayout<T>[]>();
  for (const layout of layouts) {
    const key = `${layout.top}:${layout.height}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(layout);
  }
  return [...groups.values()].map((group) =>
    [...group].sort((a, b) => a.column - b.column),
  );
}

type Props = {
  tasks: CrediarioTask[];
  view: CalendarViewMode;
  focusDate: Date;
  onSelectTask: (task: CrediarioTask) => void;
  onDayClick?: (date: Date) => void;
};

function TaskChip({
  task,
  onClick,
  compact,
}: {
  task: CrediarioTaskWithDatetime;
  onClick: () => void;
  compact?: boolean;
}) {
  const dt = new Date(task.scheduled_datetime);
  const title = `${task.lead_name} — ${format(dt, "HH:mm", { locale: ptBR })}`;
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={cn(
        "h-full w-full text-left rounded truncate border overflow-hidden box-border",
        taskChipColor(task),
        compact ? "h-4 shrink-0 text-[9px] px-1 py-0 leading-4" : "h-full max-h-full px-1 py-0 text-[11px] leading-none",
      )}
      title={title}
    >
      {!compact && <span className="font-medium">{format(dt, "HH:mm")} </span>}
      {task.lead_name || "—"}
    </button>
  );
}

function MonthView({ tasks, focusDate, onSelectTask, onDayClick }: Props) {
  const enriched = useMemo(() => tasks.map(withScheduledDatetime), [tasks]);
  const byDay = useMemo(() => tasksByDay(enriched), [enriched]);
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
                  <TaskChip key={t.id} task={t} compact onClick={() => onSelectTask(t)} />
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

function TimeGridView({
  tasks,
  focusDate,
  view,
  onSelectTask,
}: Props & { view: "week" | "day" }) {
  const enriched = useMemo(() => tasks.map(withScheduledDatetime), [tasks]);
  const days = useMemo(
    () => (view === "week" ? buildWeekDays(focusDate) : [focusDate]),
    [view, focusDate],
  );
  const byDay = useMemo(() => tasksByDay(enriched), [enriched]);
  const gridLayout = useMemo(
    () => buildTimeGridLayout(days, byDay),
    [days, byDay],
  );
  const { hourHeights, totalHeight, layoutsByDay } = gridLayout;
  const now = new Date();
  const nowTop = getNowLineTop(now, hourHeights);
  const showNowLine = days.some((d) => isSameDay(d, now)) && nowTop != null;

  return (
    <div className="rounded-lg border overflow-hidden bg-card flex flex-col max-h-[calc(100vh-220px)]">
      <div className="flex border-b bg-muted/50 shrink-0 overflow-x-auto">
        <div className="w-14 shrink-0 border-r" />
        {days.map((day) => {
          const isToday = isSameDay(day, now);
          return (
            <div key={dayKey(day)} className="flex-1 min-w-[100px] text-center py-2 border-r last:border-r-0">
              <div className="text-[11px] font-semibold text-muted-foreground">
                {WEEKDAY_LABELS[day.getDay()]}
              </div>
              <div
                className={cn(
                  "inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium mt-0.5",
                  isToday && "bg-red-600 text-white",
                )}
              >
                {format(day, "d")}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex-1 overflow-y-auto relative">
        <div className="flex" style={{ minHeight: totalHeight }}>
          <div className="w-14 shrink-0 border-r bg-muted/20">
            {HOUR_SLOTS.map((h) => (
              <div
                key={h}
                className="text-[10px] text-muted-foreground text-right pr-1 border-b border-border/50 flex items-start justify-end pt-0.5"
                style={{ height: hourHeights[h] }}
              >
                {h <= 12 ? `${h === 12 ? 12 : h} ${h < 12 ? "AM" : "PM"}` : `${h - 12} PM`}
              </div>
            ))}
          </div>
          {days.map((day) => {
            const key = dayKey(day);
            const layouts = layoutsByDay.get(key) || [];
            const slotGroups = groupLayoutsBySlot(layouts);
            return (
              <div
                key={key}
                className="flex-1 min-w-[100px] border-r last:border-r-0 relative isolate"
                style={{ minHeight: totalHeight }}
              >
                {HOUR_SLOTS.map((h) => (
                  <div key={h} className="border-b border-border/40" style={{ height: hourHeights[h] }} />
                ))}
                {slotGroups.map((group) => (
                  <div
                    key={`${group[0].top}-${group.map((g) => g.item.id).join("-")}`}
                    className="absolute left-1 right-1 flex gap-0.5 overflow-hidden"
                    style={{
                      top: group[0].top,
                      height: group[0].height,
                      zIndex: 10 + group[0].column,
                    }}
                  >
                    {group.map(({ item: t }) => (
                      <div key={t.id} className="flex-1 min-w-0 min-h-0">
                        <TaskChip task={t} onClick={() => onSelectTask(t)} />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
        {showNowLine && (
          <div
            className="absolute left-14 right-0 border-t-2 border-red-500 z-20 pointer-events-none"
            style={{ top: nowTop! }}
          >
            <span className="absolute -left-2 -top-1.5 h-2.5 w-2.5 rounded-full bg-red-500" />
          </div>
        )}
      </div>
    </div>
  );
}

export default function CrediarioTasksCalendar(props: Props) {
  if (props.view === "month") return <MonthView {...props} />;
  return <TimeGridView {...props} view={props.view} />;
}
