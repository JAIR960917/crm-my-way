import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Loader2, RefreshCw, Download, FileSignature, FolderInput, Eye, FolderOpen, ChevronRight, Trash2 } from "lucide-react";
import { maskCpf } from "@/lib/crediarioFinance";
import { getRuntimeConfig } from "@/lib/runtime-config";

interface Row {
  id: string;
  envelope_id: string;
  nome: string | null;
  cpf: string | null;
  data_assinatura: string | null;
  pdf_path: string | null;
  raw: { arquivos?: { name: string; kind?: string }[]; folder_name?: string } | null;
}

interface SyncResponse {
  ok?: boolean;
  error?: unknown;
  importados?: number;
  ignorados?: number;
}

interface DriveImportResponse extends SyncResponse {
  nextPageToken?: string | null;
  done?: boolean;
  mode?: string;
  itensEncontrados?: number;
  arquivos?: { name: string; status: "ok" | "erro" | "ignorado"; error?: string }[];
}

interface LimparResponse {
  ok?: boolean;
  error?: string;
  registros_removidos?: number;
  arquivos_storage_removidos?: number;
}

const contratosAssertivaTable = "crediario_contratos_assertiva" as never;

const getErrorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const DRIVE_BATCH_SIZE = 5;
const DRIVE_MAX_LOTES = 5000;
const DRIVE_RETRY_ATTEMPTS = 6;
const DRIVE_PAGE_TOKEN_KEY = "gdrive_import_page_token";
const DRIVE_PAGE_FOLDER_KEY = "gdrive_import_page_folder";

const saveDriveProgress = (folder: string, token: string | null) => {
  localStorage.setItem(DRIVE_PAGE_FOLDER_KEY, folder);
  if (token) localStorage.setItem(DRIVE_PAGE_TOKEN_KEY, token);
  else localStorage.removeItem(DRIVE_PAGE_TOKEN_KEY);
};

const loadDriveProgress = (folder: string): string | null => {
  if (localStorage.getItem(DRIVE_PAGE_FOLDER_KEY) !== folder) return null;
  return localStorage.getItem(DRIVE_PAGE_TOKEN_KEY);
};

const clearDriveProgress = () => {
  localStorage.removeItem(DRIVE_PAGE_TOKEN_KEY);
  localStorage.removeItem(DRIVE_PAGE_FOLDER_KEY);
};

const isRetryableDriveError = (status: number, txt: string) =>
  txt.includes("WorkerRequestCancelled") ||
  txt.includes("cancelled by supervisor") ||
  txt.includes("invalid response was received from upstream") ||
  status === 502 ||
  status === 503 ||
  status === 504 ||
  status >= 500 ||
  status === 408;


export default function CrediarioContratosImportadosPage() {
  const nav = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [importingDrive, setImportingDrive] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [driveFolder, setDriveFolder] = useState(() => localStorage.getItem("gdrive_folder_url") ?? "");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 30;
  const [lastError, setLastError] = useState<string | null>(null);

  const runtimeConfig = getRuntimeConfig();
  const baseUrl = runtimeConfig.supabaseUrl || (import.meta.env.VITE_SUPABASE_URL as string);
  const apiKey = runtimeConfig.supabasePublishableKey || (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string);

  const load = async () => {
    setLoading(true);
    const PAGE = 1000;
    let from = 0;
    const all: Row[] = [];
    // Busca em lotes para contornar o limite padrão de 1000 linhas por query
    for (;;) {
      const { data, error } = await supabase
        .from(contratosAssertivaTable)
        .select("id, envelope_id, nome, cpf, data_assinatura, pdf_path, raw")
        .order("data_assinatura", { ascending: false })
        .range(from, from + PAGE - 1);
      if (error) break;
      const batch = ((data ?? []) as unknown) as Row[];
      all.push(...batch);
      if (batch.length < PAGE) break;
      from += PAGE;
    }
    setRows(all);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (driveFolder) localStorage.setItem("gdrive_folder_url", driveFolder);
    else localStorage.removeItem("gdrive_folder_url");
  }, [driveFolder]);

  const sync = async () => {
    setSyncing(true);
    setLastError(null);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      const url = `${baseUrl}/functions/v1/assertiva-sincronizar-contratos`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          apikey: apiKey,
        },
        body: "{}",
      });
      const txt = await res.text();
      let data: SyncResponse | null = null;
      try { data = JSON.parse(txt); } catch { /* keep raw */ }
      if (!res.ok || !data?.ok) {
        const msg = data?.error ?? txt ?? `HTTP ${res.status}`;
        setLastError(typeof msg === "string" ? msg : JSON.stringify(msg, null, 2));
        toast.error("Erro ao sincronizar");
        return;
      }
      toast.success(`Importados: ${data.importados} · Já existentes: ${data.ignorados}`);
      load();
    } catch (e: unknown) {
      setLastError(getErrorMessage(e));
      toast.error("Erro ao sincronizar");
    } finally {
      setSyncing(false);
    }
  };

  const buildFilename = (path: string, nome: string | null, cpf: string | null) => {
    const cpfDigits = cpf?.replace(/\D/g, "") ?? "";
    const nomeLimpo = (nome ?? "").trim().replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ");
    if (nomeLimpo && cpfDigits) return `${nomeLimpo} - ${cpfDigits}.pdf`;
    if (nomeLimpo) return `${nomeLimpo}.pdf`;
    if (cpfDigits) return `${cpfDigits}.pdf`;
    return path.split("/").pop() ?? "contrato.pdf";
  };

  const normalizeSignedUrl = (signedUrl: string) => {
    const publicBase = baseUrl;
    if (!publicBase) return signedUrl;
    try {
      const publicOrigin = new URL(publicBase).origin;
      const url = new URL(signedUrl, publicOrigin);
      return `${publicOrigin}${url.pathname}${url.search}${url.hash}`;
    } catch {
      return signedUrl;
    }
  };


  const baixar = async (path: string, nome: string | null, cpf: string | null) => {
    const filename = buildFilename(path, nome, cpf);
    try {
      const { data, error } = await supabase.functions.invoke("assertiva-baixar-contrato", {
        body: { path, filename, mode: "download" },
      });
      if (error || !data?.ok || !data.signed_url) {
        throw new Error(data?.error ?? error?.message ?? "Erro ao obter PDF");
      }
      const signedUrl = normalizeSignedUrl(data.signed_url);
      const a = document.createElement("a");
      a.href = signedUrl;
      a.download = data.filename ?? filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e: unknown) {
      toast.error("Erro ao baixar PDF", { description: getErrorMessage(e) });
    }
  };

  const visualizar = async (path: string, nome: string | null, cpf: string | null) => {
    const filename = buildFilename(path, nome, cpf);
    const win = window.open("about:blank", "_blank");
    try {
      const { data, error } = await supabase.functions.invoke("assertiva-baixar-contrato", {
        body: { path, filename, mode: "view" },
      });
      if (error || !data?.ok || !data.signed_url) {
        throw new Error(data?.error ?? error?.message ?? "Erro ao obter PDF");
      }
      const signedUrl = normalizeSignedUrl(data.signed_url);
      if (win) win.location.href = signedUrl;
      else window.open(signedUrl, "_blank");
    } catch (e: unknown) {
      win?.close();
      toast.error("Erro ao abrir PDF", { description: getErrorMessage(e) });
    }
  };

  const importarDrive = async () => {
    if (!driveFolder.trim()) {
      toast.error("Cole a URL ou ID da pasta do Google Drive");
      return;
    }
    setImportingDrive(true);
    setLastError(null);
    let totalImp = 0, totalIgn = 0, totalErros = 0;
    const folderTrim = driveFolder.trim();
    let pageToken: string | null = loadDriveProgress(folderTrim);
    let batchSize = DRIVE_BATCH_SIZE;
    if (pageToken) {
      toast.message("Continuando importação de onde parou…", { duration: 5000 });
    }
    try {
      console.log("[gdrive] iniciando importação da pasta:", folderTrim, pageToken ? `(retomando token ${pageToken.slice(0, 12)}…)` : "");
      for (let i = 0; i < DRIVE_MAX_LOTES; i++) {
        let data: DriveImportResponse | null = null;
        let lastBatchError: string | null = null;
        let lastStatus = 0;

        for (let attempt = 0; attempt < DRIVE_RETRY_ATTEMPTS; attempt++) {
          const { data: sess } = await supabase.auth.getSession();
          const token = sess.session?.access_token;
          const url = `${baseUrl}/functions/v1/gdrive-importar-contratos`;
          const res = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
              apikey: apiKey,
            },
            body: JSON.stringify({ folder: folderTrim, pageToken, maxFiles: batchSize, mode: "pastas" }),
          });
          const txt = await res.text();
          lastStatus = res.status;
          try { data = JSON.parse(txt); } catch { data = null; }

          if (res.ok && data?.ok) break;

          lastBatchError = typeof data?.error === "string" ? data.error : txt || `HTTP ${res.status}`;
          if (isRetryableDriveError(res.status, txt) && attempt < DRIVE_RETRY_ATTEMPTS - 1) {
            const waitMs = 3000 * (attempt + 1);
            console.warn(`[gdrive] lote ${i + 1} falhou (tentativa ${attempt + 1}), retry em ${waitMs}ms…`, lastBatchError);
            toast.message(`Instabilidade no lote ${i + 1}, tentando de novo… (${attempt + 2}/${DRIVE_RETRY_ATTEMPTS})`);
            await sleep(waitMs);
            continue;
          }
          break;
        }

        if (!data?.ok) {
          if (isRetryableDriveError(lastStatus, lastBatchError ?? "") && batchSize > 2) {
            batchSize = Math.max(2, batchSize - 1);
            console.warn(`[gdrive] reduzindo lote para ${batchSize} pastas e retomando…`);
            toast.message(`Timeout — tentando com ${batchSize} pastas por lote…`);
            await sleep(5000);
            i--;
            continue;
          }
          setLastError(lastBatchError ?? "Erro ao importar do Drive");
          saveDriveProgress(folderTrim, pageToken);
          toast.error(
            `Pausado no lote ${i + 1}. Já importados nesta sessão: ${totalImp}. Clique em Importar pastas para continuar.`,
            { duration: 12000 },
          );
          load();
          return;
        }

        totalImp += data.importados ?? 0;
        totalIgn += data.ignorados ?? 0;
        totalErros += (data.arquivos ?? []).filter((a) => a.status === "erro").length;
        pageToken = data.nextPageToken ?? null;
        saveDriveProgress(folderTrim, pageToken);
        for (const a of data.arquivos ?? []) {
          if (a.status === "ok") console.log(`[gdrive] ✅ ${a.name}`);
          else if (a.status === "ignorado") console.log(`[gdrive] ⏭️  já existe: ${a.name}`);
          else console.warn(`[gdrive] ❌ ${a.name} — ${a.error ?? "erro"}`);
        }
        console.log(`[gdrive] Lote ${i + 1}: +${data.importados} importados · ${data.ignorados} ignorados · pastas=${data.itensEncontrados ?? "?"} · lote=${batchSize} · total=${totalImp}`);
        toast.message(`Lote ${i + 1}: +${data.importados} importados (total ${totalImp})`);
        if (data.done || !pageToken) {
          clearDriveProgress();
          break;
        }
        await sleep(500);
      }
      toast.success(`Drive: ${totalImp} importados · ${totalIgn} já existiam${totalErros ? ` · ${totalErros} erros` : ""}`);
      if (totalImp === 0 && totalIgn === 0) {
        toast.warning(
          "Nenhuma subpasta encontrada. Confira: (1) URL da pasta RAIZ do backup, (2) service account com acesso de leitura, (3) edge function gdrive-importar-contratos atualizada.",
          { duration: 10000 },
        );
      }
      load();
    } catch (e: unknown) {
      setLastError(getErrorMessage(e));
      toast.error("Erro ao importar do Drive");
    } finally {
      setImportingDrive(false);
    }
  };

  const limparTodos = async () => {
    setClearing(true);
    setLastError(null);
    try {
      const { data, error } = await supabase.functions.invoke("assertiva-limpar-importados", {
        body: { confirm: true },
      });
      const result = data as LimparResponse | null;
      if (error || !result?.ok) {
        throw new Error(result?.error ?? error?.message ?? "Erro ao limpar");
      }
      toast.success(
        `Removidos ${result.registros_removidos ?? 0} contrato(s) e ${result.arquivos_storage_removidos ?? 0} arquivo(s) do storage.`,
      );
      setRows([]);
      load();
    } catch (e: unknown) {
      const msg = getErrorMessage(e);
      setLastError(msg);
      toast.error("Erro ao limpar contratos", { description: msg });
    } finally {
      setClearing(false);
    }
  };

  const filtered = useMemo(() => rows.filter((r) => {
    const searchLower = search.trim().toLowerCase();
    if (!searchLower) return true;

    const searchDigits = searchLower.replace(/\D/g, "");
    const nome = r.nome ?? "";
    const cpf = r.cpf ?? "";
    const nomeDigits = nome.replace(/\D/g, "");
    const cpfDigits = cpf.replace(/\D/g, "");

    return (
      nome.toLowerCase().includes(searchLower) ||
      cpf.toLowerCase().includes(searchLower) ||
      (searchDigits.length > 0 && (nomeDigits.includes(searchDigits) || cpfDigits.includes(searchDigits)))
    );
  }), [rows, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [search]);

  return (
    <AppLayout>
      <header className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <FileSignature className="h-7 w-7" /> Contratos Assertiva
          </h1>
          <p className="text-muted-foreground">Contratos assinados importados da Assertiva Autentica ou Google Drive.</p>
        </div>
        <Button onClick={sync} disabled={syncing} className="bg-primary text-primary-foreground hover:bg-primary/90">
          {syncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Sincronizar Assertiva
        </Button>
      </header>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FolderInput className="h-4 w-4" /> Importar do Google Drive
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 flex-wrap">
            <Input
              placeholder="Cole a URL da pasta (ex: https://drive.google.com/drive/folders/...)"
              value={driveFolder}
              onChange={(e) => setDriveFolder(e.target.value)}
              className="flex-1 min-w-[280px]"
            />
            <Button onClick={importarDrive} disabled={importingDrive}>
              {importingDrive ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FolderInput className="mr-2 h-4 w-4" />}
              Importar pastas
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Cada subpasta do Drive representa um contrato (PDF + fotos). Importação em lotes de {DRIVE_BATCH_SIZE} pastas novas
            (com retry automático e retomada de onde parou). O nome da pasta segue o padrão{" "}
            <code>CPF_NOME_CLIENTE_ID</code> para extração automática de nome e CPF.
          </p>
          {loadDriveProgress(driveFolder.trim()) && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
              Importação anterior incompleta — clique em Importar pastas para continuar.
            </p>
          )}
        </CardContent>
      </Card>

      {lastError && (
        <Card className="mb-4 border-destructive/50">
          <CardHeader>
            <CardTitle className="text-base text-destructive">Erro retornado pela importação</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs whitespace-pre-wrap break-all bg-muted p-3 rounded select-all">
{lastError}
            </pre>
            <Button
              size="sm"
              variant="outline"
              className="mt-2"
              onClick={() => { navigator.clipboard.writeText(lastError); toast.success("Copiado"); }}
            >
              Copiar erro
            </Button>
          </CardContent>
        </Card>
      )}

      <Card className="shadow-elegant">
        <CardHeader className="flex flex-row items-start justify-between gap-4 flex-wrap">
          <div className="space-y-2">
            <CardTitle className="text-base">
              {loading ? "Carregando..." : `${filtered.length} contrato(s)`}
            </CardTitle>
            <Input placeholder="Buscar por nome ou CPF..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
          </div>
          {filtered.length > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" disabled={clearing}>
                  {clearing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                  Limpar todos
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Excluir todos os contratos importados?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Isso remove os {filtered.length} registro(s) do banco e todos os PDFs/imagens salvos no storage.
                    Use antes de reimportar o backup em pastas do Google Drive. Esta ação não pode ser desfeita.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={(e) => { e.preventDefault(); void limparTodos(); }}
                  >
                    Excluir tudo
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>CPF</TableHead>
                <TableHead>Data assinatura</TableHead>
                <TableHead>Arquivos</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.map((r) => {
                const qtdArquivos = r.raw?.arquivos?.length ?? (r.pdf_path ? 1 : 0);
                const temPasta = qtdArquivos > 1 || r.envelope_id.startsWith("gdrive:folder:");
                return (
                <TableRow
                  key={r.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => nav(`/crediario/contratos-importados/${r.id}`)}
                >
                  <TableCell className="font-medium">{r.nome ?? "—"}</TableCell>
                  <TableCell>{r.cpf ? maskCpf(r.cpf) : "—"}</TableCell>
                  <TableCell>
                    {r.data_assinatura ? new Date(r.data_assinatura).toLocaleString("pt-BR") : "—"}
                  </TableCell>
                  <TableCell>
                    {qtdArquivos > 0 ? (
                      <span className="inline-flex items-center gap-1 text-sm">
                        <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
                        {qtdArquivos} arquivo{qtdArquivos !== 1 ? "s" : ""}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">sem arquivos</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    {r.pdf_path || qtdArquivos > 0 ? (
                      <div className="flex justify-end gap-2 flex-wrap">
                        <Button size="sm" variant="default" onClick={() => nav(`/crediario/contratos-importados/${r.id}`)}>
                          {temPasta ? (
                            <>Abrir pasta <ChevronRight className="ml-1 h-4 w-4" /></>
                          ) : (
                            <>Ver contrato <ChevronRight className="ml-1 h-4 w-4" /></>
                          )}
                        </Button>
                        {r.pdf_path && (
                          <>
                            <Button size="sm" variant="ghost" onClick={() => visualizar(r.pdf_path!, r.nome, r.cpf)} title="Visualizar PDF">
                              <Eye className="mr-2 h-4 w-4" /> PDF
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => baixar(r.pdf_path!, r.nome, r.cpf)} title="Baixar PDF">
                              <Download className="mr-2 h-4 w-4" /> Baixar
                            </Button>
                          </>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">sem arquivos</span>
                    )}
                  </TableCell>
                </TableRow>
                );
              })}
              {!loading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    Nenhum contrato importado. Clique em "Sincronizar".
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          {filtered.length > PAGE_SIZE && (
            <div className="flex items-center justify-between gap-2 pt-4 flex-wrap">
              <span className="text-sm text-muted-foreground">
                Mostrando {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} de {filtered.length}
              </span>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>
                  Anterior
                </Button>
                <span className="text-sm">Página {currentPage} de {totalPages}</span>
                <Button size="sm" variant="outline" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}>
                  Próxima
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </AppLayout>
  );
}
