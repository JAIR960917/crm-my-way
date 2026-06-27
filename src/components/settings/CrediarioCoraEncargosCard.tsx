import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface EncargosRow {
  id: string;
  cora_interest_monthly_percent: number;
  cora_fine_percent: number;
  cora_discount_percent: number;
}

/** Encargos (juros/multa/desconto) aplicados aos boletos emitidos na Cora — válido para todas as empresas. */
export default function CrediarioCoraEncargosCard() {
  const [s, setS] = useState<EncargosRow | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase
      .from("crediario_settings")
      .select("id, cora_interest_monthly_percent, cora_fine_percent, cora_discount_percent")
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setS({
            id: data.id,
            cora_interest_monthly_percent: data.cora_interest_monthly_percent ?? 0,
            cora_fine_percent: data.cora_fine_percent ?? 0,
            cora_discount_percent: data.cora_discount_percent ?? 0,
          });
        }
      });
  }, []);

  if (!s) return <Loader2 className="h-6 w-6 animate-spin" />;

  const setField = (k: keyof Omit<EncargosRow, "id">, v: number) => setS({ ...s, [k]: v });

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("crediario_settings").update({
      cora_interest_monthly_percent: s.cora_interest_monthly_percent,
      cora_fine_percent: s.cora_fine_percent,
      cora_discount_percent: s.cora_discount_percent,
    }).eq("id", s.id);
    setSaving(false);
    if (error) toast.error("Erro ao salvar", { description: error.message });
    else toast.success("Encargos salvos");
  };

  return (
    <div>
      <Card>
        <CardContent className="p-6 space-y-4">
          <h3 className="text-base font-semibold">Cora — Cobrança (encargos)</h3>
          <p className="text-sm text-muted-foreground">
            Encargos aplicados aos boletos emitidos na Cora (enviados em <code>payment_terms</code> ao criar cada
            boleto). Use <strong>0</strong> para não cobrar. Vale para todas as empresas — as credenciais de
            autenticação do Cora ficam em Crediário → Credenciais.
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Juros mensal (%)</Label>
              <Input
                type="number"
                step="0.01"
                min={0}
                value={s.cora_interest_monthly_percent}
                onChange={(e) => setField("cora_interest_monthly_percent", parseFloat(e.target.value || "0"))}
              />
              <p className="text-xs text-muted-foreground">Aplicado proporcionalmente após o vencimento.</p>
            </div>
            <div className="space-y-2">
              <Label>Multa por atraso (%)</Label>
              <Input
                type="number"
                step="0.01"
                min={0}
                value={s.cora_fine_percent}
                onChange={(e) => setField("cora_fine_percent", parseFloat(e.target.value || "0"))}
              />
              <p className="text-xs text-muted-foreground">Cobrada uma vez se o boleto vencer.</p>
            </div>
            <div className="space-y-2">
              <Label>Desconto por antecipação (%)</Label>
              <Input
                type="number"
                step="0.01"
                min={0}
                value={s.cora_discount_percent}
                onChange={(e) => setField("cora_discount_percent", parseFloat(e.target.value || "0"))}
              />
              <p className="text-xs text-muted-foreground">Pago um dia antes do vencimento.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="mt-6 flex justify-end">
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar encargos"}
        </Button>
      </div>
    </div>
  );
}
