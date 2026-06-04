import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

export const CANAIS_AGENDAMENTO = [
  "Ligação Leads", "Ligação Renovação", "Loja", "Rede Social", "Ação Adam",
  "Convênios", "PAP", "Reavaliação", "Recomendação", "Teste de Visão Online",
  "Tráfego Pago", "Cortesia",
];

export const FORMAS_PAGAMENTO_OCULOS = ["Cartão", "Pix/Dinheiro", "Boleto"];

type FormFieldLike = {
  id: string;
  label: string;
  field_type: string;
  options: string[] | null;
};

export function resolveCanalFromForm(
  fields: FormFieldLike[],
  formData: Record<string, unknown>,
): string {
  const byLabel = fields.find(
    (f) => /canal/i.test(f.label) && f.field_type === "select",
  );
  if (byLabel) {
    const v = formData[`field_${byLabel.id}`];
    if (v) return String(v);
  }
  for (const f of fields) {
    if (f.field_type !== "select" || !f.options) continue;
    const v = formData[`field_${f.id}`];
    if (v && CANAIS_AGENDAMENTO.includes(String(v))) return String(v);
  }
  return "";
}

export function resolveCanalFromLeadData(data: Record<string, unknown>): string {
  for (const [key, val] of Object.entries(data)) {
    if (val && CANAIS_AGENDAMENTO.includes(String(val))) return String(val);
  }
  return "Ligação Leads";
}

export const isSameCalendarDay = (a: string | null | undefined, b: string | null | undefined) => {
  if (!a || !b) return false;
  try {
    const da = new Date(a);
    const db = new Date(b);
    return (
      da.getFullYear() === db.getFullYear()
      && da.getMonth() === db.getMonth()
      && da.getDate() === db.getDate()
    );
  } catch {
    return false;
  }
};

export type AppointmentColorInput = {
  consulta_paga: boolean | null;
  consulta_paga_em?: string | null;
  created_at: string;
  scheduled_datetime: string;
  is_reschedule_snapshot?: boolean | null;
};

export function getAppointmentRowColor(appt: AppointmentColorInput): string {
  if (appt.is_reschedule_snapshot) {
    return "bg-violet-700/35 border-violet-500/50 hover:bg-violet-700/45";
  }
  if (appt.consulta_paga !== true) {
    return "bg-red-700/30 hover:bg-red-700/40";
  }
  const paidAt = appt.consulta_paga_em || new Date().toISOString();
  if (isSameCalendarDay(paidAt, appt.created_at)) {
    return "bg-green-700/40 hover:bg-green-700/50";
  }
  if (isSameCalendarDay(paidAt, appt.scheduled_datetime)) {
    return "bg-cyan-600/30 hover:bg-cyan-600/40";
  }
  return "bg-green-700/40 hover:bg-green-700/50";
}

export function glassesPaymentLabel(appt: {
  forma_pagamento_oculos?: string | null;
  forma_pagamento?: string | null;
}): string {
  return appt.forma_pagamento_oculos || appt.forma_pagamento || "—";
}

export function formatRescheduleNote(appt: {
  rescheduled_from_datetime?: string | null;
  original_scheduled_datetime?: string | null;
  is_reschedule_snapshot?: boolean | null;
  rescheduled_to_datetime?: string | null;
  scheduled_datetime: string;
}): string | null {
  if (appt.is_reschedule_snapshot && appt.rescheduled_to_datetime) {
    try {
      const nova = format(new Date(appt.rescheduled_to_datetime), "dd/MM/yyyy");
      return `Reagendado — nova data: ${nova}`;
    } catch {
      return "Reagendado";
    }
  }
  const from = appt.rescheduled_from_datetime || appt.original_scheduled_datetime;
  if (from) {
    try {
      const original = format(new Date(from), "dd/MM/yyyy");
      const atual = format(new Date(appt.scheduled_datetime), "dd/MM/yyyy");
      return `Agendado originalmente para ${original}, reagendado para ${atual}`;
    } catch {
      return null;
    }
  }
  return null;
}

export async function logAppointmentHistory(
  appointmentId: string,
  userId: string,
  action: string,
  summary: string,
  details: Record<string, unknown> = {},
) {
  await supabase.from("crm_appointment_history").insert({
    appointment_id: appointmentId,
    user_id: userId,
    action,
    summary,
    details,
  });
}
