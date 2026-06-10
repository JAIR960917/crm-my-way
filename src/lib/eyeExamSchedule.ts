import { format, isValid, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

export const DEFAULT_COMPANY_EXAM_COLORS = [
  "#3B82F6",
  "#10B981",
  "#8B5CF6",
  "#F59E0B",
  "#EF4444",
  "#06B6D4",
  "#EC4899",
  "#84CC16",
] as const;

export const WORK_PERIODS = ["manha", "tarde", "dia_todo"] as const;

export type WorkPeriod = (typeof WORK_PERIODS)[number];

export const WORK_PERIOD_LABELS: Record<WorkPeriod, string> = {
  manha: "Manhã",
  tarde: "Tarde",
  dia_todo: "Dia todo",
};

/** Rótulos nos cards do calendário de escala (admin). */
export const WORK_PERIOD_CARD_LABELS: Record<WorkPeriod, string> = {
  manha: "Manhã",
  tarde: "Tarde",
  dia_todo: "O Dia Todo",
};

const WORK_PERIOD_SORT_ORDER: Record<WorkPeriod, number> = {
  manha: 0,
  tarde: 1,
  dia_todo: 2,
};

export const DEFAULT_WORK_PERIOD: WorkPeriod = "dia_todo";

export function parseWorkPeriod(value: string | null | undefined): WorkPeriod {
  if (value === "manha" || value === "tarde" || value === "dia_todo") return value;
  return DEFAULT_WORK_PERIOD;
}

export function formatSpecialistWithPeriod(name: string, period: WorkPeriod): string {
  if (period === "dia_todo") return name;
  return `${name} (${WORK_PERIOD_LABELS[period]})`;
}

/** Extrai cidade curta do nome da empresa (ex.: "Óticas Joonker Caicó Ltda" → "Caicó"). */
export function companyCityLabel(companyName: string): string {
  let city = companyName
    .replace(/^Óticas\s+Joonker\s+/i, "")
    .replace(/\s+Ltda\.?$/i, "")
    .trim();
  if (!city) return companyName;

  if (/^São\s+\S+/i.test(city)) {
    const [first, second] = city.split(/\s+/);
    return second ? `${first} ${second}` : first;
  }

  const shortIdx = city.search(/\s+(?:do|de)\s+/i);
  if (shortIdx > 0) return city.slice(0, shortIdx).trim();

  return city;
}

/** Texto do card na escala: "Caicó | Hedye | O Dia Todo". */
export function formatScheduleCardLabel(
  companyName: string,
  specialistName: string,
  period: WorkPeriod,
): string {
  const city = companyCityLabel(companyName);
  const shift = WORK_PERIOD_CARD_LABELS[period];
  return `${city} | ${specialistName} | ${shift}`;
}

export type EyeExamSpecialist = {
  id: string;
  name: string;
  active: boolean;
};

export type EyeExamDaySpecialistAssignment = {
  specialistId: string;
  workPeriod: WorkPeriod;
};

/** Especialista + turno exibidos no calendário de agendamentos (gerente/vendedor). */
export type EyeExamDayCellInfo = {
  specialistName: string;
  workPeriod: WorkPeriod;
};

export type CompanyWithExamColor = {
  id: string;
  name: string;
  exam_schedule_color: string | null;
};

export type SpecialistScheduleEntry = {
  examDate: string;
  companyId: string;
  companyName: string;
  companyColor: string;
  specialistId: string;
  specialistName: string;
  workPeriod: WorkPeriod;
  eyeExamDayId: string;
};

export function toExamDateKey(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

export function parseExamDate(value: string | null | undefined): Date | undefined {
  if (!value?.trim()) return undefined;
  const d = parseISO(`${value.trim().slice(0, 10)}T12:00:00`);
  return isValid(d) ? d : undefined;
}

export function formatExamDateLabel(value: string | null | undefined, fallback = "—"): string {
  const d = parseExamDate(value);
  if (!d) return fallback;
  return format(d, "dd/MM/yyyy (EEEE)", { locale: ptBR });
}

export function resolveCompanyExamColor(
  company: Pick<CompanyWithExamColor, "id" | "exam_schedule_color">,
  companyIndex = 0,
): string {
  if (company.exam_schedule_color?.trim()) return company.exam_schedule_color.trim();
  return DEFAULT_COMPANY_EXAM_COLORS[companyIndex % DEFAULT_COMPANY_EXAM_COLORS.length];
}

export function textColorForBackground(hex: string): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return "#ffffff";
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55 ? "#111827" : "#ffffff";
}

type RawScheduleRow = {
  exam_date: string;
  company_id: string;
  eye_exam_day_id: string;
  work_period?: string | null;
  companies: { id: string; name: string; exam_schedule_color: string | null } | null;
  eye_exam_specialists: { id: string; name: string } | null;
};

export function mapScheduleRows(
  rows: RawScheduleRow[],
  companyColorIndex: Map<string, number>,
): SpecialistScheduleEntry[] {
  return rows
    .filter((r) => r.companies && r.eye_exam_specialists)
    .map((r) => {
      const company = r.companies!;
      const specialist = r.eye_exam_specialists!;
      const idx = companyColorIndex.get(company.id) ?? 0;
      return {
        examDate: String(r.exam_date).slice(0, 10),
        companyId: r.company_id,
        companyName: company.name,
        companyColor: resolveCompanyExamColor(company, idx),
        specialistId: specialist.id,
        specialistName: specialist.name,
        workPeriod: parseWorkPeriod(r.work_period),
        eyeExamDayId: r.eye_exam_day_id,
      };
    });
}

export function groupScheduleByDay(entries: SpecialistScheduleEntry[]): Map<string, SpecialistScheduleEntry[]> {
  const map = new Map<string, SpecialistScheduleEntry[]>();
  for (const e of entries) {
    if (!map.has(e.examDate)) map.set(e.examDate, []);
    map.get(e.examDate)!.push(e);
  }
  for (const list of map.values()) {
    list.sort((a, b) => {
      const cityCmp = companyCityLabel(a.companyName).localeCompare(companyCityLabel(b.companyName), "pt-BR");
      if (cityCmp !== 0) return cityCmp;
      const nameCmp = a.specialistName.localeCompare(b.specialistName, "pt-BR");
      if (nameCmp !== 0) return nameCmp;
      return WORK_PERIOD_SORT_ORDER[a.workPeriod] - WORK_PERIOD_SORT_ORDER[b.workPeriod];
    });
  }
  return map;
}
