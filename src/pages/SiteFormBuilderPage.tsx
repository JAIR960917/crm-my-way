import { useEffect, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, ArrowUp, ArrowDown, GripVertical, Globe } from "lucide-react";

type FieldType = "text" | "email" | "tel" | "textarea" | "select" | "number";

type SiteFormField = {
  id: string;
  label: string;
  field_type: FieldType;
  placeholder: string | null;
  options: string[] | null;
  is_required: boolean;
  position: number;
  is_active: boolean;
};

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: "text",     label: "Texto curto"    },
  { value: "email",    label: "E-mail"          },
  { value: "tel",      label: "Telefone"        },
  { value: "number",   label: "Número"          },
  { value: "textarea", label: "Texto longo"     },
  { value: "select",   label: "Seleção (lista)" },
];

const typeLabel = (t: string) => FIELD_TYPES.find((x) => x.value === t)?.label ?? t;

type FormState = {
  label: string;
  field_type: FieldType;
  placeholder: string;
  optionsText: string;
  is_required: boolean;
  is_active: boolean;
};

const EMPTY: FormState = {
  label: "",
  field_type: "text",
  placeholder: "",
  optionsText: "",
  is_required: true,
  is_active: true,
};

export default function SiteFormBuilderPage() {
  const db = supabase as any;
  const [fields, setFields] = useState<SiteFormField[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SiteFormField | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await db
      .from("site_form_fields")
      .select("*")
      .order("position", { ascending: true });
    setFields((data || []) as SiteFormField[]);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY);
    setDialogOpen(true);
  };

  const openEdit = (f: SiteFormField) => {
    setEditing(f);
    setForm({
      label: f.label,
      field_type: f.field_type,
      placeholder: f.placeholder ?? "",
      optionsText: f.options ? f.options.join("\n") : "",
      is_required: f.is_required,
      is_active: f.is_active,
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.label.trim()) { toast.error("Informe o título da pergunta"); return; }
    if (form.field_type === "select" && !form.optionsText.trim()) {
      toast.error("Adicione pelo menos uma opção"); return;
    }
    setSaving(true);
    const options =
      form.field_type === "select"
        ? form.optionsText.split("\n").map((s) => s.trim()).filter(Boolean)
        : null;
    const payload = {
      label: form.label.trim(),
      field_type: form.field_type,
      placeholder: form.placeholder.trim() || null,
      options,
      is_required: form.is_required,
      is_active: form.is_active,
    };
    if (editing) {
      const { error } = await db.from("site_form_fields").update(payload).eq("id", editing.id);
      if (error) { toast.error("Erro ao salvar"); setSaving(false); return; }
      toast.success("Campo atualizado");
    } else {
      const nextPos = fields.length ? Math.max(...fields.map((f) => f.position)) + 1 : 1;
      const { error } = await db.from("site_form_fields").insert({ ...payload, position: nextPos });
      if (error) { toast.error("Erro ao criar campo"); setSaving(false); return; }
      toast.success("Campo criado");
    }
    setDialogOpen(false);
    setSaving(false);
    await load();
  };

  const deleteField = async () => {
    if (!deletingId) return;
    const { error } = await db.from("site_form_fields").delete().eq("id", deletingId);
    if (error) { toast.error("Erro ao excluir"); return; }
    toast.success("Campo excluído");
    setDeletingId(null);
    await load();
  };

  const move = async (field: SiteFormField, dir: -1 | 1) => {
    const sorted = [...fields].sort((a, b) => a.position - b.position);
    const idx = sorted.findIndex((f) => f.id === field.id);
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const a = sorted[idx];
    const b = sorted[swapIdx];
    await Promise.all([
      db.from("site_form_fields").update({ position: b.position }).eq("id", a.id),
      db.from("site_form_fields").update({ position: a.position }).eq("id", b.id),
    ]);
    await load();
  };

  const toggleActive = async (field: SiteFormField) => {
    await db.from("site_form_fields").update({ is_active: !field.is_active }).eq("id", field.id);
    setFields((prev) =>
      prev.map((f) => (f.id === field.id ? { ...f, is_active: !field.is_active } : f)),
    );
  };

  const setF = <K extends keyof FormState>(key: K, val: FormState[K]) =>
    setForm((p) => ({ ...p, [key]: val }));

  const sorted = [...fields].sort((a, b) => a.position - b.position);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Formulário do Site</h1>
            <p className="text-sm text-muted-foreground">
              Configure as perguntas exibidas no formulário de franquia do site institucional.
            </p>
          </div>
          <Button onClick={openAdd}>
            <Plus className="h-4 w-4 mr-1" />
            Adicionar pergunta
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Globe className="h-4 w-4" />
              Perguntas do formulário
            </CardTitle>
            <CardDescription>
              Ordem e perguntas exibidas no formulário público. Use as setas para reordenar.
              Campos inativos ficam ocultos no site.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <p className="p-6 text-sm text-muted-foreground">Carregando...</p>
            ) : sorted.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground">
                Nenhuma pergunta cadastrada. Clique em "Adicionar pergunta" para começar.
              </p>
            ) : (
              <div className="divide-y">
                {sorted.map((f, idx) => (
                  <div key={f.id} className="flex items-center gap-3 px-6 py-4">
                    <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-xs text-muted-foreground w-5 text-center shrink-0">
                      {idx + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`font-medium text-sm ${!f.is_active ? "opacity-40" : ""}`}>
                          {f.label}
                        </span>
                        <Badge variant="outline" className="text-xs">{typeLabel(f.field_type)}</Badge>
                        {f.is_required && (
                          <Badge variant="secondary" className="text-xs">Obrigatório</Badge>
                        )}
                        {!f.is_active && (
                          <Badge variant="outline" className="text-xs text-muted-foreground">
                            Inativo
                          </Badge>
                        )}
                      </div>
                      {f.placeholder && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Placeholder: {f.placeholder}
                        </p>
                      )}
                      {f.options && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Opções: {f.options.join(" · ")}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost" size="icon" className="h-8 w-8"
                        onClick={() => move(f, -1)} disabled={idx === 0}
                        title="Mover para cima"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="icon" className="h-8 w-8"
                        onClick={() => move(f, 1)} disabled={idx === sorted.length - 1}
                        title="Mover para baixo"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </Button>
                      <Switch
                        checked={f.is_active}
                        onCheckedChange={() => toggleActive(f)}
                        title={f.is_active ? "Desativar" : "Ativar"}
                      />
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(f)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => setDeletingId(f.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Dialog adicionar / editar */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar pergunta" : "Nova pergunta"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>Pergunta / Label</Label>
              <Input
                placeholder="Ex: Nome completo"
                value={form.label}
                onChange={(e) => setF("label", e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Tipo de campo</Label>
              <Select
                value={form.field_type}
                onValueChange={(v) => setF("field_type", v as FieldType)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {form.field_type !== "select" && (
              <div className="space-y-1.5">
                <Label>Placeholder <span className="text-muted-foreground text-xs">(opcional)</span></Label>
                <Input
                  placeholder="Texto de exemplo exibido no campo"
                  value={form.placeholder}
                  onChange={(e) => setF("placeholder", e.target.value)}
                />
              </div>
            )}

            {form.field_type === "select" && (
              <div className="space-y-1.5">
                <Label>Opções <span className="text-muted-foreground text-xs">(uma por linha)</span></Label>
                <textarea
                  className="w-full min-h-[110px] rounded-md border border-input px-3 py-2 text-sm bg-background resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder={"R$ 100.000 a R$ 200.000\nR$ 200.000 a R$ 500.000\nAcima de R$ 500.000"}
                  value={form.optionsText}
                  onChange={(e) => setF("optionsText", e.target.value)}
                />
              </div>
            )}

            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-2">
                <Switch
                  id="req"
                  checked={form.is_required}
                  onCheckedChange={(v) => setF("is_required", v)}
                />
                <Label htmlFor="req" className="cursor-pointer">Obrigatório</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="active"
                  checked={form.is_active}
                  onCheckedChange={(v) => setF("is_active", v)}
                />
                <Label htmlFor="active" className="cursor-pointer">Ativo no site</Label>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button className="flex-1" onClick={save} disabled={saving}>
                {saving ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmação de exclusão */}
      <AlertDialog open={!!deletingId} onOpenChange={(open) => !open && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir pergunta?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. A pergunta será removida do formulário.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteField}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
