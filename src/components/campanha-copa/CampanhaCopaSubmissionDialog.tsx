import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import CampanhaCopaHistoryPanel from "./CampanhaCopaHistoryPanel";

export type CampanhaCopaSubmission = {
  id: string;
  lead_id: string | null;
  nome: string;
  cpf: string | null;
  idade: string | null;
  cidade: string | null;
  telefone: string;
  usa_oculos: string | null;
  ultimo_exame_vista: string | null;
  palpite_brasil: number | null;
  palpite_marrocos: number | null;
  palpite_texto: string | null;
  jogo: string | null;
  jogo_label: string | null;
  assigned_to: string | null;
  created_at: string;
};

type Profile = { user_id: string; full_name: string; email?: string };

type Props = {
  submission: CampanhaCopaSubmission | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profiles: Profile[];
  profileName: (id: string | null) => string;
  historyRefreshKey?: number;
};

const LEGACY_JOGO_LABELS: Record<string, string> = {
  brasil_x_marrocos: "Brasil x Marrocos",
  brasil_marrocos: "Brasil x Marrocos",
};

function formatCpf(cpf: string | null) {
  if (!cpf) return "—";
  const d = cpf.replace(/\D/g, "");
  if (d.length !== 11) return cpf;
  return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}

function ReadField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}

export default function CampanhaCopaSubmissionDialog({
  submission,
  open,
  onOpenChange,
  profiles,
  profileName,
  historyRefreshKey = 0,
}: Props) {
  if (!submission) return null;

  const palpite =
    submission.palpite_texto ||
    `${submission.palpite_brasil ?? "?"} x ${submission.palpite_marrocos ?? "?"}`;
  const jogoLabel =
    submission.jogo_label ||
    LEGACY_JOGO_LABELS[submission.jogo || ""] ||
    submission.jogo ||
    "—";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Inscrição — {submission.nome}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col md:flex-row flex-1 min-h-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto pr-0 md:pr-4 max-h-[70vh] space-y-4">
            <div className="rounded-md border border-muted-foreground/30 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              Visualização somente leitura dos dados enviados no formulário público.
            </div>

            <ReadField
              label="Data da inscrição"
              value={format(new Date(submission.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
            />

            <ReadField label="Nome completo" value={submission.nome} />
            <ReadField label="CPF" value={formatCpf(submission.cpf)} />
            <ReadField label="Idade" value={submission.idade || "—"} />
            <ReadField label="Cidade" value={submission.cidade || "—"} />
            <ReadField label="Telefone" value={submission.telefone} />

            <ReadField
              label="Usa óculos de grau?"
              value={
                submission.usa_oculos === "sim"
                  ? "Sim"
                  : submission.usa_oculos === "nao"
                    ? "Não"
                    : "—"
              }
            />

            <ReadField label="Último exame de vista" value={submission.ultimo_exame_vista || "—"} />

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Jogo</Label>
              <div className="text-sm font-medium">{jogoLabel}</div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Palpite</Label>
              <Badge variant="secondary" className="text-base px-3 py-1">
                {palpite}
              </Badge>
            </div>

            <ReadField label="Responsável" value={profileName(submission.assigned_to)} />
          </div>

          <CampanhaCopaHistoryPanel
            submission={submission}
            profiles={profiles}
            refreshKey={historyRefreshKey}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
