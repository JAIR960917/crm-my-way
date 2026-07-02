import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Plus, Pencil, Trash2, Target } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

type Company = { id: string; name: string };
type Profile = { user_id: string; full_name: string; company_id: string | null };
type ManagerCompany = { user_id: string; company_id: string };
type Scope = "user" | "company";
type SalesGoal = {
  id: string;
  scope: Scope;
  company_id: string;
  user_id: string | null;
  label: string | null;
  period_start: string;
  period_end: string;
  target_amount: number;
};

const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (d: string) => format(new Date(d + "T00:00:00"), "dd/MM/yyyy");

export default function MetasCadastroPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [managerCompanies, setManagerCompanies] = useState<ManagerCompany[]>([]);
  const [goals, setGoals] = useState<SalesGoal[]>([]);
  const [loading, setLoading] = useState(true);

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [scope, setScope] = useState<Scope>("user");
  const [companyId, setCompanyId] = useState<string>("");
  const [userId, setUserId] = useState<string>("");
  const [label, setLabel] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<SalesGoal | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    const [compRes, profRes, mcRes, goalsRes] = await Promise.all([
      supabase.from("companies").select("id, name").order("name"),
      supabase.from("profiles").select("user_id, full_name, company_id"),
      supabase.from("manager_companies").select("user_id, company_id"),
      supabase.from("sales_goals").select("*").order("period_start", { ascending: false }),
    ]);
    setCompanies((compRes.data as Company[]) || []);
    setProfiles((profRes.data as Profile[]) || []);
    setManagerCompanies((mcRes.data as ManagerCompany[]) || []);
    if (goalsRes.error) {
      toast.error("Erro ao carregar metas", { description: goalsRes.error.message });
    }
    setGoals((goalsRes.data as SalesGoal[]) || []);
    setLoading(false);
  };

  useEffect(() => { void fetchAll(); }, []);

  const companyName = (id: string) => companies.find((c) => c.id === id)?.name || "—";
  const userName = (id: string | null) => profiles.find((p) => p.user_id === id)?.full_name || "—";

  const eligibleUsers = useMemo(() => {
    if (!companyId) return [];
    return profiles.filter(
      (p) =>
        p.company_id === companyId ||
        managerCompanies.some((mc) => mc.company_id === companyId && mc.user_id === p.user_id),
    );
  }, [companyId, profiles, managerCompanies]);

  const resetForm = () => {
    setEditingId(null);
    setScope("user");
    setCompanyId("");
    setUserId("");
    setLabel("");
    setPeriodStart("");
    setPeriodEnd("");
    setTargetAmount("");
  };

  const openNew = () => {
    resetForm();
    setOpen(true);
  };

  const openEdit = (g: SalesGoal) => {
    setEditingId(g.id);
    setScope(g.scope);
    setCompanyId(g.company_id);
    setUserId(g.user_id || "");
    setLabel(g.label || "");
    setPeriodStart(g.period_start);
    setPeriodEnd(g.period_end);
    setTargetAmount(String(g.target_amount));
    setOpen(true);
  };

  const podeSalvar =
    !!companyId &&
    (scope === "company" || !!userId) &&
    !!periodStart &&
    !!periodEnd &&
    periodEnd >= periodStart &&
    Number(targetAmount) > 0;

  const handleSave = async () => {
    if (!podeSalvar) {
      toast.error("Preencha todos os campos obrigatórios corretamente");
      return;
    }
    setSaving(true);
    const payload = {
      scope,
      company_id: companyId,
      user_id: scope === "user" ? userId : null,
      label: label.trim() || null,
      period_start: periodStart,
      period_end: periodEnd,
      target_amount: Number(targetAmount),
    };
    const { error } = editingId
      ? await supabase.from("sales_goals").update(payload).eq("id", editingId)
      : await supabase.from("sales_goals").insert(payload);
    setSaving(false);
    if (error) {
      toast.error("Erro ao salvar meta", { description: error.message });
      return;
    }
    toast.success(editingId ? "Meta atualizada" : "Meta cadastrada");
    setOpen(false);
    resetForm();
    void fetchAll();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from("sales_goals").delete().eq("id", deleteTarget.id);
    setDeleting(false);
    if (error) {
      toast.error("Erro ao excluir meta", { description: error.message });
      return;
    }
    toast.success("Meta excluída");
    setDeleteTarget(null);
    void fetchAll();
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Target className="h-6 w-6" />
              Metas (Cadastro)
            </h1>
            <p className="text-sm text-muted-foreground">
              Cadastre as metas de venda por vendedor, gerente ou loja em cada período.
            </p>
          </div>
          <Button onClick={openNew}>
            <Plus className="h-4 w-4 mr-2" />
            Nova meta
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Metas cadastradas</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-sm text-muted-foreground py-8 text-center">Carregando...</div>
            ) : goals.length === 0 ? (
              <div className="text-sm text-muted-foreground py-8 text-center">
                Nenhuma meta cadastrada ainda.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead>Empresa</TableHead>
                      <TableHead>Período</TableHead>
                      <TableHead>Meta</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {goals.map((g) => (
                      <TableRow key={g.id}>
                        <TableCell>
                          <Badge variant="outline">
                            {g.scope === "company" ? "Loja" : "Vendedor/Gerente"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {g.scope === "company" ? (g.label || companyName(g.company_id)) : userName(g.user_id)}
                        </TableCell>
                        <TableCell>{companyName(g.company_id)}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          {fmtDate(g.period_start)} a {fmtDate(g.period_end)}
                        </TableCell>
                        <TableCell className="font-medium">{fmtBRL(g.target_amount)}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(g)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(g)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar meta" : "Nova meta"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Tipo de meta</Label>
              <RadioGroup value={scope} onValueChange={(v) => { setScope(v as Scope); setUserId(""); }} className="flex gap-4">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <RadioGroupItem value="user" id="scope-user" />
                  Vendedor / Gerente
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <RadioGroupItem value="company" id="scope-company" />
                  Loja inteira
                </label>
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label>Empresa</Label>
              <Select value={companyId} onValueChange={(v) => { setCompanyId(v); setUserId(""); }}>
                <SelectTrigger><SelectValue placeholder="Selecione a empresa" /></SelectTrigger>
                <SelectContent>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {scope === "user" && (
              <div className="space-y-2">
                <Label>Vendedor / Gerente</Label>
                <Select value={userId} onValueChange={setUserId} disabled={!companyId}>
                  <SelectTrigger><SelectValue placeholder={companyId ? "Selecione o usuário" : "Selecione a empresa primeiro"} /></SelectTrigger>
                  <SelectContent>
                    {eligibleUsers.map((p) => (
                      <SelectItem key={p.user_id} value={p.user_id}>{p.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>Rótulo (opcional)</Label>
              <Input
                placeholder="Ex.: Cota Gerencial SPUR"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Data início</Label>
                <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Data fim</Label>
                <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Meta (R$)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="0,00"
                value={targetAmount}
                onChange={(e) => setTargetAmount(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={!podeSalvar || saving}>
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir meta?</AlertDialogTitle>
            <AlertDialogDescription>
              Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
