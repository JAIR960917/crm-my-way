import AppLayout from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { BarChart3, Info } from "lucide-react";

export default function FluxoFinanceiroPage() {
  return (
    <AppLayout>
      <div className="space-y-6 p-6">
        <div className="flex items-center gap-3">
          <BarChart3 className="h-6 w-6 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold">Fluxo Financeiro</h1>
            <p className="text-sm text-muted-foreground">Movimentações de caixa via SSótica</p>
          </div>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start gap-3 text-amber-700 bg-amber-50 rounded-lg p-4 border border-amber-200">
              <Info className="h-5 w-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-sm">Endpoint não disponível no SSótica</p>
                <p className="text-sm mt-1 text-amber-600">
                  O SSótica não disponibiliza um endpoint de fluxo de caixa por período via API de integrações.
                  Para consultar o fluxo financeiro, acesse o SSótica diretamente.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
