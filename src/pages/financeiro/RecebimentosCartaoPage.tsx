import AppLayout from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { CreditCard, Info } from "lucide-react";

export default function RecebimentosCartaoPage() {
  return (
    <AppLayout>
      <div className="space-y-6 p-6">
        <div className="flex items-center gap-3">
          <CreditCard className="h-6 w-6 text-purple-600" />
          <div>
            <h1 className="text-2xl font-bold">Recebimentos Cartão</h1>
            <p className="text-sm text-muted-foreground">Recebimentos via cartão de crédito/débito pelo SSótica</p>
          </div>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start gap-3 text-amber-700 bg-amber-50 rounded-lg p-4 border border-amber-200">
              <Info className="h-5 w-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-sm">Endpoint não disponível no SSótica</p>
                <p className="text-sm mt-1 text-amber-600">
                  O SSótica não disponibiliza um endpoint de recebimentos por cartão via API de integrações.
                  Para consultar os recebimentos, acesse o SSótica diretamente.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
