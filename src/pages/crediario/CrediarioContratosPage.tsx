import { useEffect, useMemo, useState, Fragment } from "react";
import { useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious, PaginationEllipsis,
} from "@/components/ui/pagination";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  FileSignature, Search, FileDown, Eye, ShieldCheck, Loader2, FileText, CloudDownload, RefreshCw, CheckCircle2, AlertCircle, FilePlus2,
} from "lucide-react";
import { maskCpf } from "@/lib/crediarioFinance";
import { downloadContractPdf } from "@/lib/crediarioPdf";

interface ZapPendente {
  token: string;
  open_id: number;
  name: string;
  external_id: string | null;
  signed_at: string | null;
  contrato_id: string | null;
  status_local: string | null;
  nome_local: string | null;
  cpf_local: string | null;
}

interface ContractRow {
  id: string;
  cpf: string;
  nome: string;
  endereco: string;
  telefone: string;
  content: string;
  status: string;
  signed_at: string | null;
  signature_url: string | null;
  signature_provider: string | null;
  signature_data: { signed_pdf_url?: string } | null;
  created_at: string;
  user_id: string;
  created_by_name?: string;
}

interface TemplateRow {
  title: string;
  company_name: string;
  company_cnpj: string;
  company_address: string;
}

type Filter = "todos" | "assinado" | "aguardando_assinatura" | "pendente";

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  assinado: { label: "Assinado", cls: "bg-success text-success-foreground" },
  aguardando_assinatura: { label: "Aguardando", cls: "bg-warning text-warning-foreground" },
  pendente: { label: "Pendente", cls: "bg-muted text-muted-foreground" },
};

const normalizeSearch = (value: string) =>
  value.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");

const matchesContractSearch = (nome: string, cpf: string, query: string) => {
  const q = query.trim();
  if (!q) return true;

  const searchLower = q.toLowerCase();
  const searchNorm = normalizeSearch(q);
  const searchDigits = q.replace(/\D/g, "");
  const nomeLower = (nome ?? "").toLowerCase();
  const nomeNorm = normalizeSearch(nome ?? "");
  const cpfDigits = (cpf ?? "").replace(/\D/g, "");

  const nomeMatch =
    nomeLower.includes(searchLower) ||
    nomeNorm.includes(searchNorm);

  const cpfMatch =
    searchDigits.length > 0 &&
    (cpfDigits.includes(searchDigits) || maskCpf(cpf ?? "").includes(searchLower));

  return nomeMatch || cpfMatch;
};

export default function CrediarioContratosPage() {
  const nav = useNavigate();
  const [list, setList] = useState<ContractRow[]>([]);
  const [tpl, setTpl] = useState<TemplateRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("todos");
  const [search, setSearch] = useState("");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const perPage = 30;

  // Busca ZapSign pendentes
  const [zapDialogOpen, setZapDialogOpen] = useState(false);
  const [zapLoading, setZapLoading] = useState(false);
  const [zapPendentes, setZapPendentes] = useState<ZapPendente[]>([]);
  const [zapTotalZapsign, setZapTotalZapsign] = useState(0);
  const [syncingToken, setSyncingToken] = useState<string | null>(null);
  const [importingToken, setImportingToken] = useState<string | null>(null);

  const handleView = async (c: ContractRow) => {
    if (c.status !== "assinado") {
      nav(`/crediario/contratos/${c.id}`);
      return;
    }
    setViewingId(c.id);
    // Abre janela imediatamente para evitar bloqueio de popup
    const win = window.open("about:blank", "_blank");
    try {
      const { data, error } = await supabase.functions.invoke("zapsign-baixar-assinado", {
        body: { contrato_id: c.id },
      });
      if (error) throw error;
      if (!data?.ok) {
        win?.close();
        toast.error("Documento ainda não disponível", {
          description: data?.error ?? "A ZapSign ainda não disponibilizou o PDF assinado.",
        });
        return;
      }
      if (data.pdf_base64) {
        const bin = atob(data.pdf_base64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const blob = new Blob([bytes], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        if (win) win.location.href = url;
        else window.open(url, "_blank");
      } else if (data.pdf_url) {
        if (win) win.location.href = data.pdf_url;
        else window.open(data.pdf_url, "_blank");
      } else {
        win?.close();
        toast.error("PDF indisponível");
      }
    } catch (e: unknown) {
      win?.close();
      toast.error("Erro ao abrir contrato", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setViewingId(null);
    }
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: contracts, error }, { data: template }] = await Promise.all([
        supabase.from("crediario_contracts").select("*").order("created_at", { ascending: false }),
        supabase.from("crediario_contract_template").select("title, company_name, company_cnpj, company_address").limit(1).maybeSingle(),
      ]);
      if (error) toast.error("Erro ao carregar contratos", { description: error.message });
      const rows = (contracts as ContractRow[]) ?? [];
      const userIds = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean)));
      let nameMap: Record<string, string> = {};
      if (userIds.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("user_id, full_name, email")
          .in("user_id", userIds);
        nameMap = Object.fromEntries((profs ?? []).map((p: { user_id: string; full_name: string | null; email: string | null }) => [p.user_id, p.full_name || p.email || "—"]));
      }
      setList(rows.map((r) => ({ ...r, created_by_name: nameMap[r.user_id] ?? "—" })));
      if (template) setTpl(template as TemplateRow);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim();
    return list.filter((c) => {
      if (filter !== "todos" && c.status !== filter) return false;
      return matchesContractSearch(c.nome, c.cpf, q);
    });
  }, [list, filter, search]);

  const totalPages = Math.ceil(filtered.length / perPage) || 1;
  const paginated = useMemo(() => {
    const start = (page - 1) * perPage;
    return filtered.slice(start, start + perPage);
  }, [filtered, page]);

  useEffect(() => { setPage(1); }, [filter, search]);

  const counts = useMemo(() => ({
    todos: list.length,
    assinado: list.filter((c) => c.status === "assinado").length,
    aguardando_assinatura: list.filter((c) => c.status === "aguardando_assinatura").length,
    pendente: list.filter((c) => c.status === "pendente").length,
  }), [list]);

  const handleDownload = async (c: ContractRow) => {
    // Contrato assinado: baixa o PDF oficial gerado na ZapSign
    if (c.status === "assinado") {
      setDownloadingId(c.id);
      try {
        const { data, error } = await supabase.functions.invoke("zapsign-baixar-assinado", {
          body: { contrato_id: c.id },
        });
        if (error) throw error;
        if (!data?.ok) {
          toast.error("Documento ainda não disponível", {
            description: data?.error ?? "A ZapSign ainda não disponibilizou o PDF assinado.",
          });
          return;
        }
        if (data.pdf_base64) {
          const bin = atob(data.pdf_base64);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          const blob = new Blob([bytes], { type: "application/pdf" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = data.filename ?? `contrato-assinado-${c.nome.replace(/\s+/g, "_")}.pdf`;
          a.click();
          URL.revokeObjectURL(url);
          toast.success("Contrato assinado baixado");
        } else if (data.pdf_url) {
          window.open(data.pdf_url, "_blank");
        }
      } catch (e: unknown) {
        toast.error("Erro ao baixar contrato assinado", { description: e instanceof Error ? e.message : String(e) });
      } finally {
        setDownloadingId(null);
      }
      return;
    }
    // Não assinado: gera cópia local (preview)
    if (!tpl) return;
    downloadContractPdf(
      {
        title: tpl.title,
        companyName: tpl.company_name,
        companyCnpj: tpl.company_cnpj,
        companyAddress: tpl.company_address,
        clientName: c.nome,
        clientCpf: maskCpf(c.cpf),
        content: c.content,
        signedAt: c.signed_at ? new Date(c.signed_at).toLocaleString("pt-BR") : null,
      },
      `contrato-${c.nome.replace(/\s+/g, "_")}.pdf`,
    );
  };

  const handleBuscarPendentesZapsign = async () => {
    setZapLoading(true);
    setZapPendentes([]);
    setZapDialogOpen(true);
    try {
      const { data, error } = await supabase.functions.invoke("zapsign-listar-pendentes", { body: {} });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error ?? "Erro desconhecido");
      setZapPendentes(data.pendentes ?? []);
      setZapTotalZapsign(data.total_zapsign ?? 0);
    } catch (e: unknown) {
      toast.error("Erro ao buscar pendentes na ZapSign", { description: e instanceof Error ? e.message : String(e) });
      setZapDialogOpen(false);
    } finally {
      setZapLoading(false);
    }
  };

  const handleSincronizarPendente = async (p: ZapPendente) => {
    if (!p.contrato_id) {
      toast.error("Contrato não encontrado no sistema", {
        description: "Este documento existe na ZapSign mas não tem um contrato local associado.",
      });
      return;
    }
    setSyncingToken(p.token);
    try {
      const { data, error } = await supabase.functions.invoke("zapsign-sincronizar-status", {
        body: { contrato_id: p.contrato_id },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error ?? "Erro ao sincronizar");
      toast.success("Contrato sincronizado", {
        description: `${p.nome_local ?? p.name} → ${data.status}`,
      });
      // Atualiza lista local e remove da lista de pendentes
      setList((prev) =>
        prev.map((c) =>
          c.id === p.contrato_id
            ? { ...c, status: data.status, signed_at: data.status === "assinado" ? new Date().toISOString() : c.signed_at }
            : c
        )
      );
      setZapPendentes((prev) => prev.filter((x) => x.token !== p.token));
    } catch (e: unknown) {
      toast.error("Erro ao sincronizar", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setSyncingToken(null);
    }
  };

  const handleSincronizarTodos = async () => {
    const comContrato = zapPendentes.filter((p) => p.contrato_id);
    if (comContrato.length === 0) return;
    let ok = 0;
    let fail = 0;
    for (const p of comContrato) {
      try {
        const { data, error } = await supabase.functions.invoke("zapsign-sincronizar-status", {
          body: { contrato_id: p.contrato_id },
        });
        if (error || !data?.ok) { fail++; continue; }
        ok++;
        setList((prev) =>
          prev.map((c) =>
            c.id === p.contrato_id
              ? { ...c, status: data.status, signed_at: data.status === "assinado" ? new Date().toISOString() : c.signed_at }
              : c
          )
        );
        setZapPendentes((prev) => prev.filter((x) => x.token !== p.token));
      } catch { fail++; }
    }
    toast.success(`Sincronização concluída: ${ok} atualizados${fail > 0 ? `, ${fail} com erro` : ""}`);
  };

  const handleImportarPendente = async (p: ZapPendente) => {
    setImportingToken(p.token);
    try {
      const { data, error } = await supabase.functions.invoke("zapsign-importar-pendente", {
        body: { token: p.token },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error ?? "Erro ao importar");
      const contrato = data.contrato as ContractRow;
      setList((prev) => [{ ...contrato, created_by_name: "—" }, ...prev]);
      setZapPendentes((prev) => prev.filter((x) => x.token !== p.token));
      toast.success("Contrato importado", { description: contrato.nome });
    } catch (e: unknown) {
      toast.error("Erro ao importar", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setImportingToken(null);
    }
  };

  const handleImportarTodos = async () => {
    const semContrato = zapPendentes.filter((p) => !p.contrato_id);
    if (semContrato.length === 0) return;
    let ok = 0;
    let fail = 0;
    for (const p of semContrato) {
      try {
        const { data, error } = await supabase.functions.invoke("zapsign-importar-pendente", {
          body: { token: p.token },
        });
        if (error || !data?.ok) { fail++; continue; }
        ok++;
        const contrato = data.contrato as ContractRow;
        setList((prev) => [{ ...contrato, created_by_name: "—" }, ...prev]);
        setZapPendentes((prev) => prev.filter((x) => x.token !== p.token));
      } catch { fail++; }
    }
    toast.success(`Importação concluída: ${ok} importados${fail > 0 ? `, ${fail} com erro` : ""}`);
  };

  return (
    <AppLayout>
      {/* Dialog: Contratos assinados na ZapSign mas não no sistema */}
      <Dialog open={zapDialogOpen} onOpenChange={setZapDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CloudDownload className="h-5 w-5 text-primary" />
              Contratos assinados na ZapSign
            </DialogTitle>
            <DialogDescription>
              {zapLoading
                ? "Consultando ZapSign..."
                : `${zapTotalZapsign} documento(s) assinado(s) na ZapSign — ${zapPendentes.length} ainda não registrado(s) como assinado aqui.`}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto">
            {zapLoading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" /> Buscando documentos na ZapSign...
              </div>
            ) : zapPendentes.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
                <CheckCircle2 className="h-10 w-10 text-success opacity-70" />
                <p className="font-medium">Tudo sincronizado!</p>
                <p className="text-sm">Todos os contratos assinados na ZapSign já estão registrados aqui.</p>
              </div>
            ) : (
              <div className="space-y-2 pr-1">
                {zapPendentes.length > 1 && (
                  <div className="flex justify-end gap-2 pb-2 flex-wrap">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleSincronizarTodos}
                      disabled={syncingToken !== null || importingToken !== null}
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Sincronizar todos ({zapPendentes.filter((p) => p.contrato_id).length})
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleImportarTodos}
                      disabled={syncingToken !== null || importingToken !== null}
                    >
                      <FilePlus2 className="h-4 w-4 mr-2" />
                      Importar todos ({zapPendentes.filter((p) => !p.contrato_id).length})
                    </Button>
                  </div>
                )}
                {zapPendentes.map((p) => (
                  <div key={p.token} className="flex items-center justify-between gap-3 border rounded-lg px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{p.nome_local ?? p.name}</p>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
                        {p.cpf_local && <span className="font-mono">{maskCpf(p.cpf_local)}</span>}
                        {p.signed_at && (
                          <span>Assinado em {new Date(p.signed_at).toLocaleString("pt-BR")}</span>
                        )}
                        {p.status_local ? (
                          <Badge variant="outline" className="text-xs">
                            Local: {p.status_local}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs text-warning border-warning">
                            <AlertCircle className="h-3 w-3 mr-1" />
                            Não encontrado localmente
                          </Badge>
                        )}
                      </div>
                    </div>
                    {p.contrato_id ? (
                      <Button
                        size="sm"
                        onClick={() => handleSincronizarPendente(p)}
                        disabled={syncingToken !== null || importingToken !== null}
                        title="Atualizar status para Assinado"
                      >
                        {syncingToken === p.token ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4 mr-1" />
                        )}
                        Sincronizar
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleImportarPendente(p)}
                        disabled={syncingToken !== null || importingToken !== null}
                        title="Criar um novo contrato no sistema a partir deste documento assinado"
                      >
                        {importingToken === p.token ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <FilePlus2 className="h-4 w-4 mr-1" />
                        )}
                        Importar
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <header className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <FileSignature className="h-7 w-7 text-primary" />
            Contratos
          </h1>
          <p className="text-muted-foreground">Arquivo de contratos gerados, assinados e em andamento.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <Button variant="outline" onClick={handleBuscarPendentesZapsign} disabled={zapLoading} className="gap-2">
            <CloudDownload className="h-4 w-4" />
            Buscar assinados na ZapSign
          </Button>
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou CPF..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
      </header>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)} className="mb-4">
        <TabsList className="grid grid-cols-4 w-full sm:w-auto">
          <TabsTrigger value="todos">Todos ({counts.todos})</TabsTrigger>
          <TabsTrigger value="assinado">Assinados ({counts.assinado})</TabsTrigger>
          <TabsTrigger value="aguardando_assinatura">Aguardando ({counts.aguardando_assinatura})</TabsTrigger>
          <TabsTrigger value="pendente">Pendentes ({counts.pendente})</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card className="shadow-elegant">
        <CardHeader>
          <CardTitle className="text-lg">
            {filtered.length} {filtered.length === 1 ? "contrato" : "contratos"}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" /> Carregando...
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
              <FileText className="h-10 w-10 opacity-50" />
              <p>Nenhum contrato encontrado.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>CPF</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Criado por</TableHead>
                  <TableHead>Criado em</TableHead>
                  <TableHead>Assinado em</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.map((c) => {
                  const s = STATUS_LABEL[c.status] ?? STATUS_LABEL.pendente;
                  const isSigned = c.status === "assinado";
                  const isDownloading = downloadingId === c.id;
                  return (
                    <TableRow key={c.id} className="cursor-pointer hover:bg-muted/30" onClick={() => nav(`/crediario/contratos/${c.id}`)}>
                      <TableCell className="font-medium">{c.nome}</TableCell>
                      <TableCell className="font-mono text-sm">{maskCpf(c.cpf)}</TableCell>
                      <TableCell>
                        <Badge className={s.cls}>{s.label}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">{c.created_by_name ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(c.created_at).toLocaleDateString("pt-BR")}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {c.signed_at ? new Date(c.signed_at).toLocaleString("pt-BR") : "—"}
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => handleView(c)} disabled={viewingId === c.id} title={isSigned ? "Abrir contrato assinado" : "Visualizar"}>
                            {viewingId === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDownload(c)}
                            disabled={isDownloading}
                            title={isSigned ? "Baixar contrato assinado (ZapSign)" : "Baixar cópia em PDF"}
                          >
                            {isDownloading ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : isSigned ? (
                              <ShieldCheck className="h-4 w-4 text-success" />
                            ) : (
                              <FileDown className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
          {!loading && filtered.length > 0 && (
            <div className="flex items-center justify-between px-6 py-4 border-t">
              <span className="text-sm text-muted-foreground">
                Página {page} de {totalPages} ({filtered.length} contratos)
              </span>
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      className={page <= 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                    />
                  </PaginationItem>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter((p) => {
                      if (totalPages <= 7) return true;
                      if (p === 1 || p === totalPages) return true;
                      if (p >= page - 1 && p <= page + 1) return true;
                      return false;
                    })
                    .map((p, idx, arr) => {
                      const showEllipsisBefore = idx > 0 && arr[idx - 1] !== p - 1;
                      return (
                        <Fragment key={p}>
                          {showEllipsisBefore && (
                            <PaginationItem>
                              <PaginationEllipsis />
                            </PaginationItem>
                          )}
                          <PaginationItem>
                            <PaginationLink
                              isActive={p === page}
                              onClick={() => setPage(p)}
                              className="cursor-pointer"
                            >
                              {p}
                            </PaginationLink>
                          </PaginationItem>
                        </Fragment>
                      );
                    })}
                  <PaginationItem>
                    <PaginationNext
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      className={page >= totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </CardContent>
      </Card>
    </AppLayout>
  );
}
