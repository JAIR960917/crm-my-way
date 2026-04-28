import { useEffect, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Save, Zap, User, Workflow, Loader2 } from "lucide-react";

type Status = { id: string; key: string; label: string; position: number };
type Trigger = { id: string; name: string };

type FlowRow = {
  status_id: string;
  flow_enabled: boolean;
  column_type: "manual" | "auto";
  days_to_advance: number;
  next_status_id: string | null;
  whatsapp_trigger_campaign_id: string | null;
};

const NONE = "__none__";

export default function CobrancaFlowPage() {
  const { isAdmin } = useAuth();
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [triggers, setTriggers] = useState<Trigger[]>([]);
  const [rows, setRows] = useState<Record<string, FlowRow>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [statusesRes, triggersRes, flowRes] = await Promise.all([
      supabase.from("crm_cobranca_statuses").select("id,key,label,position").order("position"),
      (supabase as any).from("whatsapp_trigger_campaigns").select("id,name").eq("module", "cobrancas").order("name"),
      (supabase as any).from("crm_cobranca_column_flow").select("*"),
    ]);

    setStatuses((statusesRes.data || []) as Status[]);
    setTriggers((triggersRes.data || []) as Trigger[]);

    const map: Record<string, FlowRow> = {};
    (flowRes.data || []).forEach((r: any) => {
      map[r.status_id] = {
        status_id: r.status_id,
        flow_enabled: r.flow_enabled,
        column_type: r.column_type,
        days_to_advance: r.days_to_advance,
        next_status_id: r.next_status_id,
        whatsapp_trigger_campaign_id: r.whatsapp_trigger_campaign_id,
      };
    });
    // Garante linha em memória para todos os status
    (statusesRes.data || []).forEach((s: any) => {
      if (!map[s.id]) {
        map[s.id] = {
          status_id: s.id,
          flow_enabled: false,
          column_type: "manual",
          days_to_advance: 0,
          next_status_id: null,
          whatsapp_trigger_campaign_id: null,
        };
      }
    });
    setRows(map);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const update = (statusId: string, patch: Partial<FlowRow>) => {
    setRows((prev) => ({ ...prev, [statusId]: { ...prev[statusId], ...patch } }));
  };

  const save = async (statusId: string) => {
    setSavingId(statusId);
    try {
      const r = rows[statusId];
      const payload = {
        status_id: statusId,
        flow_enabled: r.flow_enabled,
        column_type: r.column_type,
        days_to_advance: Math.max(0, Number(r.days_to_advance) || 0),
        next_status_id: r.next_status_id || null,
        whatsapp_trigger_campaign_id: r.column_type === "auto" ? r.whatsapp_trigger_campaign_id : null,
        updated_at: new Date().toISOString(),
      };
      const { error } = await (supabase as any)
        .from("crm_cobranca_column_flow")
        .upsert(payload, { onConflict: "status_id" });
      if (error) throw error;
      toast.success("Coluna salva!");
    } catch (e: any) {
      toast.error("Erro ao salvar: " + (e?.message || ""));
    } finally {
      setSavingId(null);
    }
  };

  if (!isAdmin) {
    return (
      <AppLayout>
        <div className="p-6 text-muted-foreground">Apenas administradores podem configurar o fluxo.</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-2">
          <Workflow className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Fluxo do Funil de Cobrança</h1>
        </div>
        <p className="text-sm text-muted-foreground mb-6">
          Configure, por coluna, se a movimentação acontece após a tratativa do operador (manual)
          ou após o envio de uma mensagem automática via WhatsApp (automática). Os dias são contados
          a partir da tratativa (manual) ou do envio do gatilho (automática).
        </p>

        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </div>
        ) : (
          <div className="space-y-3">
            {statuses.map((s) => {
              const r = rows[s.id];
              if (!r) return null;
              const nextStatuses = statuses.filter((x) => x.id !== s.id);
              return (
                <div
                  key={s.id}
                  className={`rounded-lg border bg-card p-4 ${
                    r.flow_enabled ? "border-primary/40" : "border-border"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-muted-foreground">#{s.position + 1}</span>
                      <h3 className="font-semibold">{s.label}</h3>
                      {r.flow_enabled && (
                        r.column_type === "auto" ? (
                          <Badge className="bg-blue-500/15 text-blue-600 border-blue-500/30 hover:bg-blue-500/20">
                            <Zap className="h-3 w-3 mr-1" /> Automática
                          </Badge>
                        ) : (
                          <Badge className="bg-amber-500/15 text-amber-700 border-amber-500/30 hover:bg-amber-500/20">
                            <User className="h-3 w-3 mr-1" /> Tratativa
                          </Badge>
                        )
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Ativar fluxo</span>
                      <Switch
                        checked={r.flow_enabled}
                        onCheckedChange={(v) => update(s.id, { flow_enabled: v })}
                      />
                    </div>
                  </div>

                  {r.flow_enabled && (
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                      <div>
                        <label className="text-xs text-muted-foreground">Tipo</label>
                        <Select
                          value={r.column_type}
                          onValueChange={(v: "manual" | "auto") => update(s.id, { column_type: v })}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="manual">Manual (tratativa)</SelectItem>
                            <SelectItem value="auto">Automática (WhatsApp)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <label className="text-xs text-muted-foreground">Dias para avançar</label>
                        <Input
                          type="number"
                          min={0}
                          value={r.days_to_advance}
                          onChange={(e) => update(s.id, { days_to_advance: Number(e.target.value) })}
                        />
                      </div>

                      <div>
                        <label className="text-xs text-muted-foreground">Próxima coluna</label>
                        <Select
                          value={r.next_status_id || NONE}
                          onValueChange={(v) => update(s.id, { next_status_id: v === NONE ? null : v })}
                        >
                          <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE}>—</SelectItem>
                            {nextStatuses.map((ns) => (
                              <SelectItem key={ns.id} value={ns.id}>{ns.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {r.column_type === "auto" && (
                        <div>
                          <label className="text-xs text-muted-foreground">Gatilho WhatsApp</label>
                          <Select
                            value={r.whatsapp_trigger_campaign_id || NONE}
                            onValueChange={(v) => update(s.id, { whatsapp_trigger_campaign_id: v === NONE ? null : v })}
                          >
                            <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NONE}>—</SelectItem>
                              {triggers.map((t) => (
                                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex justify-end mt-3">
                    <Button size="sm" onClick={() => save(s.id)} disabled={savingId === s.id}>
                      {savingId === s.id ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                      Salvar
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
