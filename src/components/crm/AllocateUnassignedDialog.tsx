import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Users, Loader2 } from "lucide-react";

type Company = { id: string; name: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companies: Company[];
  onSuccess: () => void;
};

export default function AllocateUnassignedDialog({ open, onOpenChange, companies, onSuccess }: Props) {
  const [companyId, setCompanyId] = useState("");
  const [unassignedCount, setUnassignedCount] = useState<number | null>(null);
  const [loadingCount, setLoadingCount] = useState(false);
  const [allocating, setAllocating] = useState(false);

  const sortedCompanies = [...companies].sort((a, b) => a.name.localeCompare(b.name));

  useEffect(() => {
    if (!open) {
      setCompanyId("");
      setUnassignedCount(null);
      return;
    }
    setLoadingCount(true);
    supabase
      .rpc("count_unassigned_leads")
      .then(({ data, error }) => {
        if (error) {
          toast.error(error.message);
          setUnassignedCount(null);
        } else {
          setUnassignedCount(typeof data === "number" ? data : 0);
        }
      })
      .finally(() => setLoadingCount(false));
  }, [open]);

  const canSubmit = !!companyId && !allocating && (unassignedCount ?? 0) > 0;

  const handleAllocate = async () => {
    if (!canSubmit) return;
    setAllocating(true);
    try {
      const { data, error } = await supabase.rpc("allocate_unassigned_leads_round_robin", {
        p_company_id: companyId,
      });
      if (error) throw error;
      const result = data as { assigned?: number; vendedores?: number } | null;
      const assigned = result?.assigned ?? 0;
      const vendedores = result?.vendedores ?? 0;
      if (assigned === 0) {
        toast.info("Nenhum lead sem usuário alocado para distribuir.");
      } else {
        toast.success(`${assigned} lead(s) distribuído(s) entre ${vendedores} usuário(s) da empresa.`);
      }
      onOpenChange(false);
      onSuccess();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erro ao alocar leads";
      toast.error(msg);
    } finally {
      setAllocating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Alocar leads sem usuário
          </DialogTitle>
          <DialogDescription>
            Distribui automaticamente (round-robin) todos os leads sem vendedor/gerente
            entre os usuários da empresa escolhida. Se a empresa não tiver vendedores
            cadastrados, distribui entre os gerentes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            {loadingCount
              ? "Contando leads sem usuário…"
              : unassignedCount !== null
                ? `${unassignedCount} lead(s) sem usuário alocado no momento.`
                : null}
          </p>

          <div className="space-y-2">
            <Label>Empresa de destino</Label>
            <Select value={companyId} onValueChange={setCompanyId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a empresa" />
              </SelectTrigger>
              <SelectContent>
                {sortedCompanies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={allocating}>
            Cancelar
          </Button>
          <Button onClick={handleAllocate} disabled={!canSubmit}>
            {allocating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Alocando…
              </>
            ) : (
              "Alocar"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
