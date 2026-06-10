import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { isSystemCobrancaActivity } from "@/lib/cobrancaActivities";

type Props = {
  cobrancaId: string;
};

type TimelineItem = {
  id: string;
  kind: "note" | "activity" | "movement";
  date: string;
  title: string;
  body?: string | null;
};

export default function CobrancaTaskHistoryPanel({ cobrancaId }: Props) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<TimelineItem[]>([]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    (async () => {
      const [notesRes, actsRes] = await Promise.all([
        supabase
          .from("crm_cobranca_notes")
          .select("id, content, created_at")
          .eq("cobranca_id", cobrancaId)
          .order("created_at", { ascending: false })
          .limit(40),
        supabase
          .from("cobranca_activities")
          .select("id, title, description, scheduled_date, created_at")
          .eq("cobranca_id", cobrancaId)
          .order("scheduled_date", { ascending: false })
          .limit(40),
      ]);

      if (!mounted) return;

      const timeline: TimelineItem[] = [];

      (notesRes.data || []).forEach((n) => {
        timeline.push({
          id: `note-${n.id}`,
          kind: "note",
          date: n.created_at,
          title: "Tratativa / comentário",
          body: n.content,
        });
      });

      (actsRes.data || []).forEach((a) => {
        const system = isSystemCobrancaActivity(a.title);
        timeline.push({
          id: `act-${a.id}`,
          kind: system ? "movement" : "activity",
          date: a.scheduled_date || a.created_at,
          title: a.title,
          body: a.description,
        });
      });

      timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setItems(timeline);
      setLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, [cobrancaId]);

  const groupedLabel = useMemo(
    () => ({
      note: "Tratativa",
      activity: "Tarefa",
      movement: "Movimentação",
    }),
    [],
  );

  return (
    <div className="rounded-lg border bg-muted/30 p-4 space-y-3 h-full min-h-[280px]">
      <div>
        <h3 className="text-sm font-semibold">Histórico do card</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Movimentações, tratativas e tarefas registradas na cobrança.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <p className="text-xs text-muted-foreground py-6 text-center">Nenhum registro neste card.</p>
      ) : (
        <ul className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
          {items.map((item) => (
            <li key={item.id} className="rounded-md border bg-background/80 px-3 py-2.5">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {groupedLabel[item.kind]}
                </span>
                <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                  {format(new Date(item.date), "dd/MM/yy HH:mm", { locale: ptBR })}
                </span>
              </div>
              <p className="text-sm font-medium leading-snug">{item.title}</p>
              {item.body ? (
                <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{item.body}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
