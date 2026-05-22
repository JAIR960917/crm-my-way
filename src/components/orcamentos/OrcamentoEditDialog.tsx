import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Phone, PhoneOff, Plus, Trash2, Check } from "lucide-react";

type ProdutoItem = { nome: string; valor: string };

export type OrcamentoEditData = {
  id: string;
  nome: string;
  telefone: string;
  nao_vendido_motivo: string | null;
  orcamento_observacao: string | null;
  orcamento_produtos_itens: ProdutoItem[] | null;
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orcamento: OrcamentoEditData | null;
  onSaved?: () => void;
};

export default function OrcamentoEditDialog({ open, onOpenChange, orcamento, onSaved }: Props) {
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [motivo, setMotivo] = useState("");
  const [observacao, setObservacao] = useState("");
  const [itens, setItens] = useState<ProdutoItem[]>([{ nome: "", valor: "" }]);
  const [atendeu, setAtendeu] = useState<"sim" | "nao" | null>(null);
  const [tratativa, setTratativa] = useState("");
  const [tentativasObs, setTentativasObs] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && orcamento) {
      setNome(orcamento.nome || "");
      setTelefone(orcamento.telefone || "");
      setMotivo(orcamento.nao_vendido_motivo || "");
      setObservacao(orcamento.orcamento_observacao || "");
      const arr = Array.isArray(orcamento.orcamento_produtos_itens) ? orcamento.orcamento_produtos_itens : [];
      setItens(arr.length > 0 ? arr : [{ nome: "", valor: "" }]);
      setAtendeu(null);
      setTratativa("");
      setTentativasObs("");
    }
  }, [open, orcamento]);

  if (!orcamento) return null;

  const valorTotal = itens.reduce((acc, p) => acc + (parseFloat(p.valor) || 0), 0);

  const handleSave = async () => {
    setSaving(true);
    const itensValidos = itens.filter(p => p.nome.trim() && p.valor);

    let novaObs = observacao.trim();
    if (atendeu) {
      const stamp = new Date().toLocaleString("pt-BR");
      const lines: string[] = [`\n\n— Tentativa de contato (${stamp}) —`];
      if (atendeu === "sim") {
        lines.push("Cliente atendeu.");
        if (tratativa.trim()) lines.push(`Tratativa: ${tratativa.trim()}`);
      } else {
        lines.push("Cliente NÃO atendeu.");
        if (tentativasObs.trim()) lines.push(`Tentativas: ${tentativasObs.trim()}`);
      }
      novaObs = (novaObs + lines.join("\n")).trim();
    }

    const payload: any = {
      nome: nome.trim(),
      telefone: telefone.trim(),
      nao_vendido_motivo: motivo.trim() || null,
      orcamento_observacao: novaObs || null,
      orcamento_produtos_itens: itensValidos,
      orcamento_produtos: itensValidos.map(p => `${p.nome} - R$ ${p.valor}`).join("; ") || null,
      orcamento_valor: itensValidos.reduce((a, p) => a + (parseFloat(p.valor) || 0), 0),
    };

    const { error } = await supabase.from("crm_appointments").update(payload).eq("id", orcamento.id);
    setSaving(false);
    if (error) { toast.error("Erro ao salvar: " + error.message); return; }
    toast.success("Orçamento atualizado!");
    onSaved?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Orçamento</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Cliente</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Telefone</Label>
              <Input value={telefone} onChange={(e) => setTelefone(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2 rounded-md border p-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">Produtos do orçamento</Label>
              <span className="text-xs text-muted-foreground">Total: R$ {valorTotal.toFixed(2)}</span>
            </div>
            {itens.map((p, i) => (
              <div key={i} className="flex gap-2 items-center">
                <Input
                  placeholder="Nome do produto"
                  value={p.nome}
                  onChange={(e) => setItens(itens.map((x, idx) => idx === i ? { ...x, nome: e.target.value } : x))}
                  className="flex-1 h-9 text-sm"
                />
                <Input
                  placeholder="Valor"
                  type="number"
                  step="0.01"
                  value={p.valor}
                  onChange={(e) => setItens(itens.map((x, idx) => idx === i ? { ...x, valor: e.target.value } : x))}
                  className="w-28 h-9 text-sm"
                />
                <Button type="button" variant="ghost" size="icon" className="h-9 w-9"
                  onClick={() => setItens(itens.length > 1 ? itens.filter((_, idx) => idx !== i) : [{ nome: "", valor: "" }])}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => setItens([...itens, { nome: "", valor: "" }])}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar produto
            </Button>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Motivo da não compra</Label>
            <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Observação</Label>
            <Textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={4} className="text-sm" />
          </div>

          <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">Registrar tentativa de contato</span>
            </div>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant={atendeu === "sim" ? "default" : "outline"} className="flex-1"
                onClick={() => setAtendeu("sim")}>
                <Phone className="h-3.5 w-3.5 mr-1" /> Atendeu
              </Button>
              <Button type="button" size="sm" variant={atendeu === "nao" ? "destructive" : "outline"} className="flex-1"
                onClick={() => setAtendeu("nao")}>
                <PhoneOff className="h-3.5 w-3.5 mr-1" /> Não atendeu
              </Button>
            </div>
            {atendeu === "sim" && (
              <div className="space-y-1">
                <Label className="text-xs">Tratativa</Label>
                <Textarea value={tratativa} onChange={(e) => setTratativa(e.target.value)} rows={2} className="text-sm" placeholder="O que foi conversado..." />
              </div>
            )}
            {atendeu === "nao" && (
              <div className="space-y-1">
                <Label className="text-xs">Como tentou contato?</Label>
                <Textarea value={tentativasObs} onChange={(e) => setTentativasObs(e.target.value)} rows={2} className="text-sm" placeholder="Ligação, WhatsApp..." />
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            <Check className="h-3.5 w-3.5 mr-1" />
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
