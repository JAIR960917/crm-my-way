import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ExternalLink, Pencil, RefreshCw, Search, Trophy, UserPlus } from "lucide-react";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";
import CampanhaCopaSubmissionDialog, {
  type CampanhaCopaSubmission,
} from "@/components/campanha-copa/CampanhaCopaSubmissionDialog";
import CampanhaCopaJogoConfigCard from "@/components/campanha-copa/CampanhaCopaJogoConfigCard";
import { supabase } from "@/integrations/supabase/client";
import { CAMPANHA_COPA_JOGO_SETTING_KEY } from "@/lib/campanha-copa-jogo";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Profile = { user_id: string; full_name: string; email?: string };

const NONE = "__none__";

export default function CampanhasCopaPage() {
  const { isAdmin, user } = useAuth();
  const [rows, setRows] = useState<CampanhaCopaSubmission[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [defaultUserId, setDefaultUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingDefault, setSavingDefault] = useState(false);
  const [search, setSearch] = useState("");
  const [reassigning, setReassigning] = useState<string | null>(null);
  const [detailRow, setDetailRow] = useState<CampanhaCopaSubmission | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [jogoConfigRaw, setJogoConfigRaw] = useState<string | null>(null);

  const profileName = useCallback(
    (id: string | null) => {
      if (!id) return "Sem responsável";
      const p = profiles.find((x) => x.user_id === id);
      return p?.full_name || p?.email || id.slice(0, 8);
    },
    [profiles],
  );

  const currentUserName = useMemo(() => {
    if (!user?.id) return "Usuário";
    const p = profiles.find((x) => x.user_id === user.id);
    return p?.full_name || p?.email || "Usuário";
  }, [profiles, user?.id]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [subRes, profRes, settingRes, jogoRes] = await Promise.all([
        supabase
          .from("campanha_copa_submissions")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(2000),
        supabase.from("profiles").select("user_id, full_name, email").order("full_name"),
        isAdmin
          ? supabase
              .from("system_settings")
              .select("setting_value")
              .eq("setting_key", "campanha_copa_default_user_id")
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        isAdmin
          ? supabase
              .from("system_settings")
              .select("setting_value")
              .eq("setting_key", CAMPANHA_COPA_JOGO_SETTING_KEY)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);

      if (subRes.error) throw subRes.error;
      setRows((subRes.data || []) as CampanhaCopaSubmission[]);
      setProfiles((profRes.data || []) as Profile[]);
      if (settingRes.data?.setting_value) {
        setDefaultUserId(settingRes.data.setting_value);
      }
      if (jogoRes.data?.setting_value) {
        setJogoConfigRaw(jogoRes.data.setting_value);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar inscrições");
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.nome, r.telefone, r.cidade, r.cpf, r.palpite_texto, r.jogo_label, profileName(r.assigned_to)]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [rows, search, profileName]);

  const openDetail = (row: CampanhaCopaSubmission) => {
    setDetailRow(row);
    setDetailOpen(true);
  };

  const saveDefaultUser = async () => {
    if (!isAdmin) return;
    setSavingDefault(true);
    try {
      const { error } = await supabase.from("system_settings").upsert(
        {
          setting_key: "campanha_copa_default_user_id",
          setting_value: defaultUserId === NONE ? "" : defaultUserId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "setting_key" },
      );
      if (error) throw error;
      toast.success("Responsável padrão das novas inscrições atualizado.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSavingDefault(false);
    }
  };

  const reassign = async (submission: CampanhaCopaSubmission, newUserId: string) => {
    const targetId = newUserId === NONE ? null : newUserId;
    if (targetId === submission.assigned_to) return;

    const oldName = profileName(submission.assigned_to);
    const newName = profileName(targetId);

    setReassigning(submission.id);
    try {
      const { error: subErr } = await supabase
        .from("campanha_copa_submissions")
        .update({ assigned_to: targetId })
        .eq("id", submission.id);
      if (subErr) throw subErr;

      if (submission.lead_id) {
        const { error: leadErr } = await supabase
          .from("crm_leads")
          .update({ assigned_to: targetId })
          .eq("id", submission.lead_id);
        if (leadErr) throw leadErr;
      }

      const { error: histErr } = await supabase.from("campanha_copa_history" as never).insert({
        submission_id: submission.id,
        user_id: user?.id ?? null,
        action: "reassigned",
        summary: `${currentUserName} redirecionou de ${oldName} para ${newName}.`,
      } as never);
      if (histErr) throw histErr;

      setRows((prev) =>
        prev.map((r) => (r.id === submission.id ? { ...r, assigned_to: targetId } : r)),
      );
      if (detailRow?.id === submission.id) {
        setDetailRow({ ...submission, assigned_to: targetId });
        setHistoryRefreshKey((k) => k + 1);
      }
      toast.success("Lead redirecionado com sucesso.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao redirecionar");
    } finally {
      setReassigning(null);
    }
  };

  const formUrl = `${window.location.origin}/campanha-copa`;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Trophy className="h-7 w-7 text-amber-500" />
              Campanhas Copa
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Inscrições do formulário público da campanha Copa.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <a href="/campanha-copa" target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 mr-1" />
                Abrir formulário
              </a>
            </Button>
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total de inscrições</CardDescription>
              <CardTitle className="text-3xl">{rows.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Link do formulário</CardDescription>
              <CardTitle className="text-sm font-mono break-all">{formUrl}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Sem responsável</CardDescription>
              <CardTitle className="text-3xl">
                {rows.filter((r) => !r.assigned_to).length}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        {isAdmin && (
          <CampanhaCopaJogoConfigCard
            initialRaw={jogoConfigRaw}
            onSaved={() => void load()}
          />
        )}

        {isAdmin && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <UserPlus className="h-4 w-4" />
                Responsável padrão (novas inscrições)
              </CardTitle>
              <CardDescription>
                Leads do formulário público entram atribuídos a este usuário. Depois você pode
                redirecionar para gerentes ou vendedores na tabela abaixo.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col sm:flex-row gap-3">
              <Select value={defaultUserId || NONE} onValueChange={setDefaultUserId}>
                <SelectTrigger className="sm:max-w-md">
                  <SelectValue placeholder="Selecione o usuário" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Nenhum (sem atribuição)</SelectItem>
                  {profiles.map((p) => (
                    <SelectItem key={p.user_id} value={p.user_id}>
                      {p.full_name || p.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={() => void saveDefaultUser()} disabled={savingDefault}>
                {savingDefault ? "Salvando..." : "Salvar padrão"}
              </Button>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
              <CardTitle className="text-base">Inscrições</CardTitle>
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Buscar nome, CPF, telefone..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10" />
                    <TableHead>Data</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>Cidade</TableHead>
                    <TableHead>Idade</TableHead>
                    <TableHead>Jogo</TableHead>
                    <TableHead>Palpite</TableHead>
                    <TableHead>Óculos</TableHead>
                    <TableHead>Último exame</TableHead>
                    <TableHead>Responsável</TableHead>
                    <TableHead>Redirecionar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={12} className="text-center py-8 text-muted-foreground">
                        Carregando...
                      </TableCell>
                    </TableRow>
                  ) : filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={12} className="text-center py-8 text-muted-foreground">
                        Nenhuma inscrição encontrada.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="Ver inscrição"
                            onClick={() => openDetail(r)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs">
                          {format(new Date(r.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                        </TableCell>
                        <TableCell className="font-medium">{r.nome}</TableCell>
                        <TableCell>{r.telefone}</TableCell>
                        <TableCell>{r.cidade || "—"}</TableCell>
                        <TableCell>{r.idade || "—"}</TableCell>
                        <TableCell className="text-xs max-w-[120px] truncate">
                          {r.jogo_label || r.jogo || "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {r.palpite_texto || `${r.palpite_brasil ?? "?"} x ${r.palpite_marrocos ?? "?"}`}
                          </Badge>
                        </TableCell>
                        <TableCell>{r.usa_oculos === "sim" ? "Sim" : r.usa_oculos === "nao" ? "Não" : "—"}</TableCell>
                        <TableCell className="max-w-[140px] truncate text-xs">{r.ultimo_exame_vista || "—"}</TableCell>
                        <TableCell className="text-sm">{profileName(r.assigned_to)}</TableCell>
                        <TableCell>
                          <Select
                            value={r.assigned_to || NONE}
                            onValueChange={(v) => void reassign(r, v)}
                            disabled={reassigning === r.id}
                          >
                            <SelectTrigger className="h-8 w-[160px] text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NONE}>Sem responsável</SelectItem>
                              {profiles.map((p) => (
                                <SelectItem key={p.user_id} value={p.user_id}>
                                  {p.full_name || p.email}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <CampanhaCopaSubmissionDialog
        submission={detailRow}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        profiles={profiles}
        profileName={profileName}
        historyRefreshKey={historyRefreshKey}
      />
    </AppLayout>
  );
}
