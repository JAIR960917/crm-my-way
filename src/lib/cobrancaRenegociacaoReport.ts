import { supabase } from "@/integrations/supabase/client";
import { attendanceRangeBounds } from "@/lib/attendanceReport";

export type CobrancaRenegReportTotals = {
  tratados: number;
  naoAtenderam: number;
  atenderam: number;
  renegociados: number;
  naoRenegociados: number;
  tarefasConcluidas: number;
};

type ContactCat = "renegociou" | "naoRenegociou" | "naoAtendeu" | "atendeuSemRenegociar";

const dayKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

const isContactAttemptNote = (content: string) => content.startsWith("📞 Tentativa de contato");

const classifyCobrancaContactNote = (content: string): ContactCat | null => {
  if (!isContactAttemptNote(content)) return null;
  if (content.includes("NÃO ATENDEU")) return "naoAtendeu";
  if (content.includes("ATENDEU")) {
    if (content.includes("✅ Cliente RENEGOCIOU")) return "renegociou";
    if (content.includes("❌ Cliente NÃO renegociou")) return "naoRenegociou";
    return "atendeuSemRenegociar";
  }
  return null;
};

const addToSetMap = (map: Map<string, Set<string>>, uid: string, key: string) => {
  if (!map.has(uid)) map.set(uid, new Set());
  map.get(uid)!.add(key);
};

export async function fetchCobrancaRenegociacaoReport(
  userId: string,
  startStr: string,
  endStr: string,
): Promise<CobrancaRenegReportTotals> {
  const { startISO, endISO } = attendanceRangeBounds(startStr, endStr);

  const [{ data: cobNotes }, { data: cobActivities }, { data: crediarioTasks }] = await Promise.all([
    supabase
      .from("crm_cobranca_notes")
      .select("user_id, cobranca_id, content, created_at")
      .eq("user_id", userId)
      .gte("created_at", startISO)
      .lte("created_at", endISO),
    supabase
      .from("cobranca_activities")
      .select("cobranca_id, created_by, created_at, updated_at")
      .eq("created_by", userId)
      .gte("updated_at", startISO)
      .lte("updated_at", endISO),
    supabase
      .from("crediario_tasks")
      .select("id, user_id, renegociacao_status, completed_at")
      .eq("user_id", userId)
      .not("completed_at", "is", null)
      .not("renegociacao_status", "is", null)
      .gte("completed_at", startISO)
      .lte("completed_at", endISO),
  ]);

  const tratadosMap = new Map<string, Set<string>>();

  (cobNotes || []).forEach((n: { user_id: string; cobranca_id: string; content: string }) => {
    if (!isContactAttemptNote(n.content || "")) return;
    addToSetMap(tratadosMap, n.user_id, `cobranca:${n.cobranca_id}`);
  });

  (cobActivities || []).forEach((a: { cobranca_id: string; created_by: string; created_at: string; updated_at: string }) => {
    const inRange =
      (a.created_at >= startISO && a.created_at <= endISO)
      || (a.updated_at >= startISO && a.updated_at <= endISO);
    if (!inRange) return;
    addToSetMap(tratadosMap, a.created_by, `cobranca:${a.cobranca_id}`);
  });

  type LastEntry = { ts: number; cat: ContactCat };
  const latestPerCardDay = new Map<string, LastEntry>();

  (cobNotes || []).forEach((n: { user_id: string; cobranca_id: string; content: string; created_at: string }) => {
    const cat = classifyCobrancaContactNote(n.content || "");
    if (!cat) return;
    const ts = new Date(n.created_at).getTime();
    const key = `${n.user_id}|${dayKey(n.created_at)}|cobranca:${n.cobranca_id}`;
    const prev = latestPerCardDay.get(key);
    if (!prev || ts > prev.ts) latestPerCardDay.set(key, { ts, cat });
  });

  let renegociadosNotes = 0;
  let naoRenegociadosNotes = 0;
  let naoAtendeu = 0;
  let atendeuSemRenegociar = 0;

  latestPerCardDay.forEach((entry) => {
    if (entry.cat === "renegociou") renegociadosNotes += 1;
    else if (entry.cat === "naoRenegociou") naoRenegociadosNotes += 1;
    else if (entry.cat === "naoAtendeu") naoAtendeu += 1;
    else if (entry.cat === "atendeuSemRenegociar") atendeuSemRenegociar += 1;
  });

  let renegociadosTasks = 0;
  let naoRenegociadosTasks = 0;

  (crediarioTasks || []).forEach((t: { renegociacao_status: string | null }) => {
    if (t.renegociacao_status === "sim") renegociadosTasks += 1;
    else if (t.renegociacao_status === "nao") naoRenegociadosTasks += 1;
  });

  const renegociados = renegociadosNotes + renegociadosTasks;
  const naoRenegociados = naoRenegociadosNotes + naoRenegociadosTasks;
  const atenderam = renegociadosNotes + naoRenegociadosNotes + atendeuSemRenegociar;

  return {
    tratados: tratadosMap.get(userId)?.size || 0,
    naoAtenderam: naoAtendeu,
    atenderam,
    renegociados,
    naoRenegociados,
    tarefasConcluidas: (crediarioTasks || []).length,
  };
}
