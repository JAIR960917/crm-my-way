import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, ArrowLeft, Download, Eye, FileText, ImageIcon, FolderOpen } from "lucide-react";
import { maskCpf } from "@/lib/crediarioFinance";
import { getRuntimeConfig } from "@/lib/runtime-config";

interface ArquivoPasta {
  name: string;
  path: string;
  mimeType?: string;
  kind?: "pdf" | "image" | "other";
}

interface ContratoRow {
  id: string;
  envelope_id: string;
  nome: string | null;
  cpf: string | null;
  data_assinatura: string | null;
  pdf_path: string | null;
  raw: {
    source?: string;
    folder_id?: string;
    folder_name?: string;
    arquivos?: ArquivoPasta[];
  } | null;
}

const contratosAssertivaTable = "crediario_contratos_assertiva" as never;

const getErrorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);

const normalizeSignedUrl = (signedUrl: string) => {
  const runtimeConfig = getRuntimeConfig();
  const publicBase = runtimeConfig.supabaseUrl || (import.meta.env.VITE_SUPABASE_URL as string);
  if (!publicBase) return signedUrl;
  try {
    const publicOrigin = new URL(publicBase).origin;
    const url = new URL(signedUrl, publicOrigin);
    return `${publicOrigin}${url.pathname}${url.search}${url.hash}`;
  } catch {
    return signedUrl;
  }
};

const labelArquivo = (name: string) => {
  const lower = name.toLowerCase();
  if (lower.includes("rgcpffrente") || lower.includes("rg_cpf_frente")) return "RG/CPF — Frente";
  if (lower.includes("rgcpfverso") || lower.includes("rg_cpf_verso")) return "RG/CPF — Verso";
  if (lower.includes("rostosimples")) return "Selfie";
  if (lower.includes("rostosorrindo")) return "Selfie sorrindo";
  if (/\.pdf$/i.test(name)) return "Contrato (PDF)";
  return name;
};

export default function CrediarioContratoAssertivaDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const [row, setRow] = useState<ContratoRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [loadingPreview, setLoadingPreview] = useState<Record<string, boolean>>({});

  const arquivos = useMemo(() => {
    if (!row) return [];
    const fromRaw = row.raw?.arquivos ?? [];
    if (fromRaw.length) return fromRaw;
    if (row.pdf_path) {
      return [{ name: row.pdf_path.split("/").pop() ?? "contrato.pdf", path: row.pdf_path, kind: "pdf" as const }];
    }
    return [];
  }, [row]);

  const pdfArquivo = arquivos.find((a) => a.kind === "pdf" || /\.pdf$/i.test(a.name));
  const imagens = arquivos.filter((a) => a.kind === "image" || /\.(jpe?g|png|webp)$/i.test(a.name));

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from(contratosAssertivaTable)
        .select("id, envelope_id, nome, cpf, data_assinatura, pdf_path, raw")
        .eq("id", id)
        .maybeSingle();
      if (error || !data) {
        toast.error("Contrato não encontrado");
        nav("/crediario/contratos-importados");
        return;
      }
      setRow(data as unknown as ContratoRow);
      setLoading(false);
    })();
  }, [id, nav]);

  const getSignedUrl = async (path: string, filename: string, mode: "view" | "download") => {
    const { data, error } = await supabase.functions.invoke("assertiva-baixar-contrato", {
      body: { path, filename, mode },
    });
    if (error || !data?.ok || !data.signed_url) {
      throw new Error(data?.error ?? error?.message ?? "Erro ao obter arquivo");
    }
    return normalizeSignedUrl(data.signed_url);
  };

  const carregarPreview = async (arquivo: ArquivoPasta) => {
    if (previewUrls[arquivo.path] || loadingPreview[arquivo.path]) return;
    setLoadingPreview((prev) => ({ ...prev, [arquivo.path]: true }));
    try {
      const url = await getSignedUrl(arquivo.path, arquivo.name, "view");
      setPreviewUrls((prev) => ({ ...prev, [arquivo.path]: url }));
    } catch (e: unknown) {
      toast.error(`Erro ao carregar ${arquivo.name}`, { description: getErrorMessage(e) });
    } finally {
      setLoadingPreview((prev) => ({ ...prev, [arquivo.path]: false }));
    }
  };

  useEffect(() => {
    for (const img of imagens) {
      void carregarPreview(img);
    }
    if (pdfArquivo) void carregarPreview(pdfArquivo);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row, imagens.length, pdfArquivo?.path]);

  const visualizar = async (arquivo: ArquivoPasta) => {
    try {
      const url = previewUrls[arquivo.path] ?? await getSignedUrl(arquivo.path, arquivo.name, "view");
      window.open(url, "_blank");
    } catch (e: unknown) {
      toast.error("Erro ao abrir arquivo", { description: getErrorMessage(e) });
    }
  };

  const baixar = async (arquivo: ArquivoPasta) => {
    try {
      const url = await getSignedUrl(arquivo.path, arquivo.name, "download");
      const a = document.createElement("a");
      a.href = url;
      a.download = arquivo.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e: unknown) {
      toast.error("Erro ao baixar", { description: getErrorMessage(e) });
    }
  };

  if (loading || !row) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  const folderName = row.raw?.folder_name;

  return (
    <AppLayout>
      <header className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Button variant="ghost" size="sm" className="mb-2 -ml-2" onClick={() => nav("/crediario/contratos-importados")}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
          </Button>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <FolderOpen className="h-6 w-6" />
            {row.nome ?? "Contrato Assertiva"}
          </h1>
          <p className="text-muted-foreground mt-1">
            {row.cpf ? maskCpf(row.cpf) : "CPF não informado"}
            {row.data_assinatura && (
              <> · {new Date(row.data_assinatura).toLocaleString("pt-BR")}</>
            )}
          </p>
          {folderName && (
            <p className="text-xs text-muted-foreground mt-1">Pasta: {folderName}</p>
          )}
        </div>
      </header>

      {pdfArquivo && (
        <Card className="mb-4 shadow-elegant">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" /> Contrato (PDF)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" variant="outline" onClick={() => visualizar(pdfArquivo)}>
                <Eye className="mr-2 h-4 w-4" /> Abrir em nova aba
              </Button>
              <Button size="sm" variant="outline" onClick={() => baixar(pdfArquivo)}>
                <Download className="mr-2 h-4 w-4" /> Baixar PDF
              </Button>
            </div>
            {loadingPreview[pdfArquivo.path] ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : previewUrls[pdfArquivo.path] ? (
              <iframe
                title="Contrato PDF"
                src={previewUrls[pdfArquivo.path]}
                className="w-full h-[70vh] rounded border bg-muted"
              />
            ) : null}
          </CardContent>
        </Card>
      )}

      {imagens.length > 0 && (
        <Card className="shadow-elegant">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ImageIcon className="h-4 w-4" /> Documentos e fotos ({imagens.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {imagens.map((img) => (
                <div key={img.path} className="rounded-lg border overflow-hidden bg-card">
                  <div className="p-3 border-b flex items-center justify-between gap-2">
                    <span className="text-sm font-medium truncate" title={img.name}>
                      {labelArquivo(img.name)}
                    </span>
                    <div className="flex gap-1 shrink-0">
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => visualizar(img)} title="Abrir">
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => baixar(img)} title="Baixar">
                        <Download className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="aspect-[4/3] bg-muted flex items-center justify-center">
                    {loadingPreview[img.path] ? (
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    ) : previewUrls[img.path] ? (
                      <img
                        src={previewUrls[img.path]}
                        alt={labelArquivo(img.name)}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <Button size="sm" variant="secondary" onClick={() => carregarPreview(img)}>
                        Carregar imagem
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {!pdfArquivo && imagens.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nenhum arquivo encontrado nesta pasta.
          </CardContent>
        </Card>
      )}
    </AppLayout>
  );
}
