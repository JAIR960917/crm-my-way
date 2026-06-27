import { useCallback, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

/**
 * Trava o seletor de data de agendamento para que só seja possível marcar em
 * dias com especialista alocado (company_eye_exam_days). Se a empresa nunca
 * cadastrou nenhum dia de exame, não restringe — entende-se que a empresa
 * não usa essa funcionalidade de escala.
 */
export function useAllowedExamDates() {
  const [allowedDates, setAllowedDates] = useState<Set<string> | null>(null);

  const loadAllowedExamDates = useCallback(async (companyId: string | null) => {
    if (!companyId) {
      setAllowedDates(null);
      return;
    }
    const { data } = await supabase
      .from("company_eye_exam_days")
      .select("exam_date")
      .eq("company_id", companyId);
    if (!data || data.length === 0) {
      setAllowedDates(null);
      return;
    }
    setAllowedDates(new Set(data.map((row) => String((row as { exam_date: string }).exam_date).slice(0, 10))));
  }, []);

  const isDateDisabled = useCallback((date: Date) => {
    if (!allowedDates) return false;
    return !allowedDates.has(format(date, "yyyy-MM-dd"));
  }, [allowedDates]);

  return { allowedDates, loadAllowedExamDates, isDateDisabled };
}
