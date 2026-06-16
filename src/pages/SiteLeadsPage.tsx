import { useEffect, useState, useMemo } from "react";
import AppLayout from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Eye, Search, Users, UserCheck, Phone, Mail } from "lucide-react";

type LeadStatus = "novo" | "em_contato" | "convertido" | "descartado";

type SiteLead = {
  id: string;
  data: Record<string, string>;
  nome: string | null;
  email: string | null;
  telefone: string | null;
  status: LeadStatus;
  notes: string | null;
  created_at: string;
};

const STATUS_CONFIG: Record<LeadStatus, { label: string; color: string }> = {
  novo:        { label: "Novo",        color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"      },
  em_contato:  { label: "Em contato",  color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" },
  convertido:  { label: "Convertido",  color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"   },
  descartado:  { label: "Descartado",  color: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"      },
};

const ALL_STATUSES: LeadStatus[] = ["novo", "em_contato", "convertido", "descartado"];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function SiteLeadsPage() {
  const db = supabase as any;
  const [leads, setLeads] = useState<SiteLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<LeadStatus | "todos">("todos");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<SiteLead | null>(null);
  const [detailStatus, setDetailStatus] = useState<LeadStatus>("novo");
  const [detailNotes, setDetailNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await db
      .from("site_form_submissions")
      .select("*")
      .order("created_at", { ascending: false });
    setLeads((data || []) as SiteLead[]);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const s of ALL_STATUSES) c[s] = leads.filter((l) => l.status === s).length;
    return c;
  }, [leads]);

  const filtered = useMemo(() => {
    let list = filterStatus === "todos" ? leads : leads.filter((l) => l.status === filterStatus);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (l) =>
          l.nome?.toLowerCase().includes(q) ||
          l.email?.toLowerCase().includes(q) ||
          l.telefone?.includes(q),
      );
    }
    return list;
  }, [leads, filterStatus, search]);

  const openDetail = (lead: SiteLead) => {
    setSelected(lead);
    setDetailStatus(lead.status);
    setDetailNotes(lead.notes ?? "");
  };

  const saveDetail = async () => {
    if (!selected) return;
    setSaving(true);
    const { error } = await db
      .from("site_form_submissions")
      .update({ status: detailStatus, notes: detailNotes.trim() || null, updated_at: new Date().toISOString() })
      .eq("id", selected.id);
    if (error) { toast.error("Erro ao salvar"); setSaving(false); return; }
    toast.success("Lead atualizado");
    setSaving(false);
    setSelected(null);
    await load();
  };

  const StatusBadge = ({ status }: { status: LeadStatus }) => (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CONFIG[status].color}`}>
      {STATUS_CONFIG[status].label}
    </span>
  );

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Leads do Site</h1>
          <p className="text-sm text-muted-foreground">
            Interessados em franquia que preencheram o formulário do site institucional.
          </p>
        </div>

        {/* Cards de status */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {ALL_STATUSES.map((s) => (
            <Card
              key={s}
              className={`cursor-pointer transition-all hover:shadow-md ${filterStatus === s ? "ring-2 ring-primary" : ""}`}
              onClick={() => setFilterStatus(filterStatus === s ? "todos" : s)}
            >
              <CardHeader className="pb-1 pt-4 px-4">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {STATUS_CONFIG[s].label}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <p className="text-2xl font-bold">{counts[s]}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Barra de busca */}
        <div className="flex gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, e-mail ou telefone..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {filterStatus !== "todos" && (
            <Button variant="outline" onClick={() => setFilterStatus("todos")}>
              Limpar filtro
            </Button>
          )}
        </div>

        {/* Tabela */}
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <p className="p-6 text-sm text-muted-foreground">Carregando...</p>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center text-muted-foreground">
                <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Nenhum lead encontrado.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead className="hidden md:table-cell">E-mail</TableHead>
                    <TableHead className="hidden sm:table-cell">Telefone</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((lead) => (
                    <TableRow key={lead.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openDetail(lead)}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDate(lead.created_at)}
                      </TableCell>
                      <TableCell className="font-medium">
                        {lead.nome || <span className="text-muted-foreground italic">—</span>}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                        {lead.email || "—"}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                        {lead.telefone || "—"}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={lead.status} />
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); openDetail(lead); }}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
        <p className="text-xs text-muted-foreground">
          {filtered.length} de {leads.length} lead{leads.length !== 1 ? "s" : ""}
          {filterStatus !== "todos" && ` (filtrado: ${STATUS_CONFIG[filterStatus].label})`}
        </p>
      </div>

      {/* Dialog de detalhe */}
      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCheck className="h-4 w-4" />
              {selected?.nome || "Lead"}
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-5 pt-1">
              {/* Contato rápido */}
              <div className="flex gap-3 flex-wrap">
                {selected.email && (
                  <a href={`mailto:${selected.email}`} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                    <Mail className="h-3.5 w-3.5" />
                    {selected.email}
                  </a>
                )}
                {selected.telefone && (
                  <a href={`tel:${selected.telefone}`} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                    <Phone className="h-3.5 w-3.5" />
                    {selected.telefone}
                  </a>
                )}
              </div>

              {/* Respostas do formulário */}
              <div className="rounded-md border divide-y">
                {Object.entries(selected.data).length > 0 ? (
                  Object.entries(selected.data).map(([key, val]) => (
                    <div key={key} className="px-3 py-2.5">
                      <p className="text-xs text-muted-foreground font-medium">{key}</p>
                      <p className="text-sm mt-0.5 break-words">{String(val) || "—"}</p>
                    </div>
                  ))
                ) : (
                  <p className="px-3 py-3 text-sm text-muted-foreground">Sem dados no formulário.</p>
                )}
              </div>

              <p className="text-xs text-muted-foreground">
                Recebido em {formatDate(selected.created_at)}
              </p>

              {/* Status */}
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={detailStatus} onValueChange={(v) => setDetailStatus(v as LeadStatus)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ALL_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>{STATUS_CONFIG[s].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Notas */}
              <div className="space-y-1.5">
                <Label>Observações internas</Label>
                <textarea
                  className="w-full min-h-[80px] rounded-md border border-input px-3 py-2 text-sm bg-background resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Anotações sobre este lead..."
                  value={detailNotes}
                  onChange={(e) => setDetailNotes(e.target.value)}
                />
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setSelected(null)}>
                  Fechar
                </Button>
                <Button className="flex-1" onClick={saveDetail} disabled={saving}>
                  {saving ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
