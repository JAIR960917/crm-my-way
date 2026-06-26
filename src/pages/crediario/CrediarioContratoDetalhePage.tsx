import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, PenLine, FileDown, ArrowLeft, CheckCircle2, ShieldCheck, Trash2, RefreshCw, ShieldAlert, ShieldX } from "lucide-react";
import { maskCpf, brl } from "@/lib/crediarioFinance";
import { downloadContractPdf } from "@/lib/crediarioPdf";
import { SignatureMockDialog } from "@/components/crediario/SignatureMockDialog";
import { ParcelasContrato } from "@/components/crediario/ParcelasContrato";
import { useAuth } from "@/contexts/AuthContext";
import { uploadComprovanteForSigning } from "@/lib/crediarioComprovante";
import { invokeEdgeFunction } from "@/lib/crediarioFunctionErrors";

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
  venda_id: string | null;
  company_id: string | null;
}

interface VendaInfo {
  valor_total: number;
  primeiro_vencimento: string | null;
  parcelas: number;
  valor_entrada: number;
  valor_financiado: number | null;
  valor_parcela: number | null;
  aprovacao_admin: string | null;
  aprovacao_motivo: string | null;
}

interface TemplateRow {
  title: string;
  company_name: string;
  company_cnpj: string;
  company_address: string;
}

const MESES_PT = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
const EXTENSO_NUM: Record<string, number> = {
  zero:0, um:1, uma:1, dois:2, duas:2, "três":3, tres:3, quatro:4, cinco:5, seis:6, sete:7, oito:8, nove:9,
  dez:10, onze:11, doze:12, treze:13, quatorze:14, catorze:14, quinze:15,
  dezesseis:16, dezessete:17, dezoito:18, dezenove:19,
  vinte:20, trinta:30, quarenta:40, cinquenta:50, sessenta:60, setenta:70, oitenta:80, noventa:90,
  cem:100, cento:100, duzentos:200, trezentos:300, quatrocentos:400, quinhentos:500,
  seiscentos:600, setecentos:700, oitocentos:800, novecentos:900,
};
/** Converte número em extenso (pt-BR, até milhões) para inteiro. Retorna null se não reconhecer. */
function extensoToInt(s: string): number | null {
  const tokens = s.toLowerCase().normalize("NFC").replace(/[.,]/g, " ").split(/\s+|\bde\b/).map(t => t.trim()).filter(Boolean);
  if (!tokens.length) return null;
  let groups: number[] = [0];
  let group = 0;
  let any = false;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === "e") continue;
    if (t === "mil") {
      groups[groups.length - 1] = (group || 1) * 1000;
      groups.push(0); group = 0; any = true; continue;
    }
    if (t === "milhão" || t === "milhao" || t === "milhões" || t === "milhoes") {
      const milhoes = (group || 1) * 1_000_000;
      groups = [milhoes + (groups[0] || 0)];
      groups.push(0); group = 0; any = true; continue;
    }
    const v = EXTENSO_NUM[t];
    if (v != null) { group += v; any = true; }
  }
  if (!any) return null;
  const total = groups.reduce((a, b) => a + b, 0) + group;
  return total || null;
}
/** Extrai vencimento (dd/mm/aaaa) e valor numérico do texto da nota promissória. */
function parseFromPromissoria(content: string): { vencimento: string | null; valor: number | null } {
  let vencimento: string | null = null;
  const venc = content.match(/No\s+dia\s+([a-zçãéêíóôúáà\s]+?)\s+de\s+([a-zçãéêíóôúáà]+)\s+de\s+([a-zçãéêíóôúáà\s]+?)\s+pagarei/i);
  if (venc) {
    const dia = extensoToInt(venc[1]);
    const mesIdx = MESES_PT.indexOf(venc[2].toLowerCase().normalize("NFC"));
    const ano = extensoToInt(venc[3]);
    if (dia && mesIdx >= 0 && ano) {
      vencimento = `${String(dia).padStart(2, "0")}/${String(mesIdx + 1).padStart(2, "0")}/${ano}`;
    }
  }
  let valor: number | null = null;
  const val = content.match(/a\s+quantia\s+de\s+(.+?)\s+em\s+moeda/i);
  if (val) {
    const txt = val[1].toLowerCase().replace(/\s*reais.*$/, "").trim();
    valor = extensoToInt(txt);
  }
  return { vencimento, valor };
}


export default function CrediarioContratoDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const { isAdmin } = useAuth();
  const [c, setC] = useState<ContractRow | null>(null);
  const [tpl, setTpl] = useState<TemplateRow | null>(null);
  const [venda, setVenda] = useState<VendaInfo | null>(null);
  const [signing, setSigning] = useState(false);
  const [signDialog, setSignDialog] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [boletosCount, setBoletosCount] = useState(0);
  const [forceDelete, setForceDelete] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [downloadingSigned, setDownloadingSigned] = useState(false);
  const [phoneChoiceOpen, setPhoneChoiceOpen] = useState(false);
  const [comprovanteFile, setComprovanteFile] = useState<File | null>(null);
  const [empresaPhone, setEmpresaPhone] = useState<string>("");
  const [phoneTarget, setPhoneTarget] = useState<"empresa" | "cliente" | "manual">("cliente");
  const [manualPhone, setManualPhone] = useState<string>("");
  const [codigoAutorizacao, setCodigoAutorizacao] = useState("");
  const [validandoCodigo, setValidandoCodigo] = useState(false);

  const handleDownloadSigned = async () => {
    if (!c) return;
    setDownloadingSigned(true);
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
        a.download = data.filename ?? "contrato-assinado.pdf";
        a.click();
        URL.revokeObjectURL(url);
        toast.success("Contrato assinado baixado");
      } else if (data.pdf_url) {
        window.open(data.pdf_url, "_blank");
      }
    } catch (e: unknown) {
      toast.error("Erro ao baixar contrato assinado", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setDownloadingSigned(false);
    }
  };

  const handleDelete = async () => {
    if (!c) return;
    setDeleting(true);

    // Conta boletos emitidos
    const { data: emitidas, error: checkError } = await supabase
      .from("crediario_parcelas")
      .select("id")
      .eq("contrato_id", c.id)
      .not("cora_invoice_id", "is", null);

    if (checkError) {
      setDeleting(false);
      toast.error("Erro ao verificar boletos", { description: checkError.message });
      return;
    }

    const qtd = emitidas?.length ?? 0;
    setBoletosCount(qtd);

    if (qtd > 0 && !isAdmin) {
      setDeleting(false);
      setDeleteDialog(false);
      toast.error("Não é possível excluir este contrato", {
        description: `Existem ${qtd} boleto(s) emitido(s). Cancele os boletos no Cora antes de excluir.`,
      });
      return;
    }

    if (qtd > 0 && !forceDelete) {
      setDeleting(false);
      toast.error("Confirme a exclusão forçada", {
        description: `Existem ${qtd} boleto(s) emitido(s). Marque a opção para excluir mesmo assim.`,
      });
      return;
    }

    await supabase.from("crediario_parcelas").delete().eq("contrato_id", c.id);
    const { error } = await supabase.from("crediario_contracts").delete().eq("id", c.id);
    if (!error && c.venda_id) {
      // Remove a venda vinculada para sumir também do histórico
      await supabase.from("crediario_parcelas").delete().eq("venda_id", c.venda_id);
      await supabase.from("crediario_vendas").delete().eq("id", c.venda_id);
    }
    setDeleting(false);
    if (error) {
      toast.error("Erro ao excluir contrato", { description: error.message });
      return;
    }
    toast.success("Contrato excluído");
    nav("/crediario/contratos");
  };

  useEffect(() => {
    if (!id) return;
    (async () => {
      const [{ data: contract }, { data: template }] = await Promise.all([
        supabase.from("crediario_contracts").select("*").eq("id", id).maybeSingle(),
        supabase.from("crediario_contract_template").select("title, company_name, company_cnpj, company_address").limit(1).maybeSingle(),
      ]);
      if (contract) {
        setC(contract as ContractRow);
        if ((contract as ContractRow).company_id) {
          const { data: emp } = await supabase
            .from("companies")
            .select("phone")
            .eq("id", (contract as ContractRow).company_id!)
            .maybeSingle();
          setEmpresaPhone(((emp as { phone: string | null } | null)?.phone ?? "").toString());
        }
        if ((contract as ContractRow).venda_id) {
          const { data: vendaRow } = await supabase
            .from("crediario_vendas")
            .select("valor_total, primeiro_vencimento, parcelas, valor_entrada, valor_financiado, valor_parcela, aprovacao_admin, aprovacao_motivo")
            .eq("id", (contract as ContractRow).venda_id!)
            .maybeSingle();
          const { data: parcela1 } = await supabase
            .from("crediario_parcelas")
            .select("vencimento")
            .eq("venda_id", (contract as ContractRow).venda_id!)
            .order("numero_parcela", { ascending: true })
            .limit(1)
            .maybeSingle();
          if (vendaRow) {
            let venc: string | null =
              (vendaRow as { primeiro_vencimento: string | null }).primeiro_vencimento ??
              parcela1?.vencimento ??
              null;
            if (!venc) {
              const match = (contract as ContractRow).content.match(
                /vencimento[^0-9]{0,40}(\d{2}\/\d{2}\/\d{4})/i,
              );
              if (match) {
                const [d, m, y] = match[1].split("/");
                venc = `${y}-${m}-${d}`;
              }
            }
            const vr = vendaRow as {
              valor_total: number; parcelas: number; valor_entrada: number;
              valor_financiado: number | null; valor_parcela: number | null;
              aprovacao_admin: string | null; aprovacao_motivo: string | null;
            };
            setVenda({
              valor_total: Number(vr.valor_total),
              primeiro_vencimento: venc,
              parcelas: Number(vr.parcelas) || 1,
              valor_entrada: Number(vr.valor_entrada) || 0,
              valor_financiado: vr.valor_financiado != null ? Number(vr.valor_financiado) : null,
              valor_parcela: vr.valor_parcela != null ? Number(vr.valor_parcela) : null,
              aprovacao_admin: vr.aprovacao_admin,
              aprovacao_motivo: vr.aprovacao_motivo,
            });
          }
        }
      }
      if (template) setTpl(template as TemplateRow);
    })();
  }, [id]);

  // Polling automático: enquanto aguardando assinatura, sincroniza a cada 15s
  useEffect(() => {
    if (!c || c.status !== "aguardando_assinatura" || c.signature_provider !== "zapsign") return;
    let cancelled = false;
    const tick = async () => {
      const { data } = await supabase.functions.invoke("zapsign-sincronizar-status", {
        body: { contrato_id: c.id },
      });
      if (cancelled) return;
      if (data?.ok && data.status === "assinado") {
        setC((prev) => prev ? { ...prev, status: "assinado", signed_at: new Date().toISOString() } : prev);
        setSignDialog(false);
        toast.success("Contrato assinado!");
      }
    };
    const interval = setInterval(tick, 15000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [c?.id, c?.status, c?.signature_provider]);

  const handleStartSignature = () => {
    if (!c) return;
    if (venda?.aprovacao_admin === "pendente" || venda?.aprovacao_admin === "rejeitada") {
      toast.error("Aguardando autorização", {
        description: "Um administrador precisa autorizar esta venda antes da assinatura.",
      });
      return;
    }
    setPhoneChoiceOpen(true);
  };

  const submitSignature = async () => {
    if (!c) return;
    const rawPhone = phoneTarget === "empresa" ? empresaPhone : phoneTarget === "manual" ? manualPhone : c.telefone;
    const digits = (rawPhone || "").replace(/\D/g, "");
    if (!digits || digits.length < 10) {
      toast.error("Telefone inválido", {
        description: phoneTarget === "empresa"
          ? "Cadastre um telefone válido na empresa."
          : phoneTarget === "manual"
            ? "Digite um telefone válido com DDD."
            : "O cliente não possui telefone válido.",
      });
      return;
    }
    // Remove DDI 55 se já vier incluso
    const local = digits.length > 11 && digits.startsWith("55") ? digits.slice(2) : digits;
    setPhoneChoiceOpen(false);
    setSigning(true);

    let comprovante_storage_path: string | null = null;
    if (comprovanteFile) {
      try {
        const { data: authData } = await supabase.auth.getUser();
        const uid = authData.user?.id;
        if (!uid) throw new Error("Sessão expirada. Faça login novamente.");
        comprovante_storage_path = await uploadComprovanteForSigning(
          supabase,
          uid,
          c.id,
          comprovanteFile,
        );
      } catch (e) {
        setSigning(false);
        toast.error("Falha ao enviar comprovante", {
          description: e instanceof Error ? e.message : "Tente outra foto ou envie sem anexo.",
        });
        return;
      }
    }

    const { data, errorMessage } = await invokeEdgeFunction<{
      ok: boolean;
      error?: string;
      signature_url?: string;
    }>(supabase, "zapsign-criar-documento", {
      contrato_id: c.id,
      comprovante_storage_path,
      signer_phone_country: "55",
      signer_phone_number: local,
    });

    setSigning(false);

    if (errorMessage || !data?.ok) {
      toast.error("Falha ao enviar para assinatura", {
        description: errorMessage || data?.error || "Erro desconhecido",
      });
      return;
    }

    const newUrl = data.signature_url || c.signature_url || "";
    setC({
      ...c,
      status: "aguardando_assinatura",
      signature_url: newUrl,
      signature_provider: "zapsign",
    });
    toast.success("Documento criado na ZapSign", {
      description: "Use o link / QR Code abaixo para o cliente assinar.",
    });
    setComprovanteFile(null);
    setSignDialog(true);
  };

  const handleSyncStatus = async () => {
    if (!c) return;
    setSyncing(true);
    const { data, error } = await supabase.functions.invoke("zapsign-sincronizar-status", {
      body: { contrato_id: c.id },
    });
    setSyncing(false);
    if (error || !data?.ok) {
      const msg = data?.error || error?.message || "Erro desconhecido";
      toast.error("Falha ao sincronizar", { description: msg });
      return;
    }
    if (data.status === "assinado") {
      setC({ ...c, status: "assinado", signed_at: new Date().toISOString() });
      toast.success("Contrato assinado!", { description: "Status atualizado a partir da ZapSign." });
    } else {
      toast.info("Ainda não assinado", {
        description: `Status na ZapSign: ${data.zapsign_status || "pendente"}`,
      });
    }
  };

  const handleSimulateSign = async () => {
    if (!c) return;
    if (venda?.aprovacao_admin === "pendente" || venda?.aprovacao_admin === "rejeitada") {
      toast.error("Autorize a venda antes de simular a assinatura.");
      return;
    }
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("crediario_contracts")
      .update({ status: "assinado", signed_at: now })
      .eq("id", c.id);
    if (error) {
      toast.error("Erro ao concluir simulação", { description: error.message });
      return;
    }
    setC({ ...c, status: "assinado", signed_at: now });
    toast.success("Assinatura simulada com sucesso", {
      description: "Em produção isto acontece automaticamente via webhook ZapSign.",
    });
  };

  const handleDownloadPdf = () => {
    if (!c || !tpl) return;
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
        vencimento: (() => {
          if (venda?.primeiro_vencimento) {
            return new Date(venda.primeiro_vencimento + "T00:00:00").toLocaleDateString("pt-BR");
          }
          return parseFromPromissoria(c.content).vencimento;
        })(),
        valorTotal: (() => {
          if (venda?.valor_total != null) return brl(Number(venda.valor_total));
          const v = parseFromPromissoria(c.content).valor;
          return v != null ? brl(v) : null;
        })(),

        numero: "Nº 1 DE 1",
      },
      `contrato-${c.nome.replace(/\s+/g, "_")}.pdf`,
    );
  };

  if (!c || !tpl) {
    return (
      <AppLayout>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Carregando contrato...
        </div>
      </AppLayout>
    );
  }

  const assinado = c.status === "assinado";
  const enviado = c.status === "aguardando_assinatura";
  const aprovacaoPendente = venda?.aprovacao_admin === "pendente";
  const aprovacaoRejeitada = venda?.aprovacao_admin === "rejeitada";
  const bloqueadoParaAssinatura = aprovacaoPendente || aprovacaoRejeitada;
  const vendaAutorizada = !venda?.aprovacao_admin || venda.aprovacao_admin === "aprovada";
  const aprovadaViaCodigo = venda?.aprovacao_admin === "aprovada" && !!venda.aprovacao_motivo?.includes("código de autorização");

  const handleValidarCodigo = async () => {
    if (!c?.venda_id || !codigoAutorizacao.trim()) return;
    setValidandoCodigo(true);
    const { data, errorMessage } = await invokeEdgeFunction<{ ok: boolean; error?: string }>(
      supabase,
      "autorizacao-validar-codigo",
      { venda_id: c.venda_id, codigo: codigoAutorizacao.trim() },
    );
    setValidandoCodigo(false);
    if (errorMessage || !data?.ok) {
      toast.error("Código inválido", { description: errorMessage ?? data?.error });
      return;
    }
    setVenda((v) => v ? { ...v, aprovacao_admin: "aprovada" } : v);
    setCodigoAutorizacao("");
    toast.success("Venda autorizada via código — assinatura e emissão de boletos liberadas");
  };

  const handleAprovarVenda = async () => {
    if (!c?.venda_id) return;
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("crediario_vendas")
      .update({
        aprovacao_admin: "aprovada",
        aprovacao_em: new Date().toISOString(),
        aprovacao_por: u.user?.id ?? null,
      })
      .eq("id", c.venda_id);
    if (error) { toast.error("Erro ao aprovar", { description: error.message }); return; }
    setVenda((v) => v ? { ...v, aprovacao_admin: "aprovada" } : v);
    toast.success("Venda autorizada — assinatura e emissão de boletos liberadas");
  };

  const handleRejeitarVenda = async () => {
    if (!c?.venda_id) return;
    const motivo = window.prompt("Motivo da rejeição (opcional):") ?? "";
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("crediario_vendas")
      .update({
        aprovacao_admin: "rejeitada",
        aprovacao_motivo: motivo || null,
        aprovacao_em: new Date().toISOString(),
        aprovacao_por: u.user?.id ?? null,
      })
      .eq("id", c.venda_id);
    if (error) { toast.error("Erro ao rejeitar", { description: error.message }); return; }
    setVenda((v) => v ? { ...v, aprovacao_admin: "rejeitada", aprovacao_motivo: motivo || null } : v);
    toast.success("Venda rejeitada");
  };

  return (
    <AppLayout>
      <header className="mb-6 flex items-start justify-between gap-4 print:hidden">
        <div>
          <Button variant="ghost" size="sm" className="-ml-2 mb-2" onClick={() => nav(-1)}>
            <ArrowLeft className="mr-1 h-4 w-4" /> Voltar
          </Button>
          <h1 className="text-3xl font-bold tracking-tight">Contrato</h1>
          <p className="text-muted-foreground">{c.nome} · CPF {maskCpf(c.cpf)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleDownloadPdf}>
            <FileDown className="mr-2 h-4 w-4" /> Baixar cópia
          </Button>

          {isAdmin && (
            <Button
              variant="outline"
              onClick={() => setDeleteDialog(true)}
              className="border-destructive/40 text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="mr-2 h-4 w-4" /> Excluir
            </Button>
          )}

          {assinado && (
            <Button
              onClick={handleDownloadSigned}
              disabled={downloadingSigned}
              className="bg-success text-success-foreground hover:bg-success/90"
            >
              {downloadingSigned ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ShieldCheck className="mr-2 h-4 w-4" />
              )}
              Baixar contrato assinado
            </Button>
          )}

          {/* Botões de aprovação para admin quando a venda está pendente */}
          {aprovacaoPendente && isAdmin && (
            <>
              <Button onClick={handleAprovarVenda} className="bg-success text-success-foreground hover:bg-success/90" size="lg">
                <ShieldCheck className="mr-2 h-4 w-4" /> Autorizar venda
              </Button>
              <Button onClick={handleRejeitarVenda} variant="outline" size="lg" className="border-destructive/40 text-destructive hover:bg-destructive/10">
                <ShieldX className="mr-2 h-4 w-4" /> Recusar venda
              </Button>
            </>
          )}

          {assinado ? (
            <Button onClick={() => setSignDialog(true)} variant="outline" className="border-success text-success hover:bg-success/10">
              <CheckCircle2 className="mr-2 h-4 w-4" /> Assinado
            </Button>
          ) : enviado ? (
            <>
              <Button onClick={() => setSignDialog(true)} className="bg-warning text-warning-foreground hover:bg-warning/90" size="lg">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Aguardando assinatura
              </Button>
              <Button onClick={handleSyncStatus} disabled={syncing} variant="outline" size="lg">
                {syncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Sincronizar status
              </Button>
            </>
          ) : bloqueadoParaAssinatura ? null : (
            <Button
              onClick={handleStartSignature}
              disabled={signing}
              className="bg-gradient-primary"
              size="lg"
            >
              {signing ? <Loader2 className="h-4 w-4 animate-spin" /> : <><PenLine className="mr-2 h-4 w-4" /> Assinar contrato</>}
            </Button>
          )}
        </div>
      </header>

      {aprovadaViaCodigo && (
        <Card className="mb-6 shadow-card overflow-hidden border-success print:hidden">
          <div className="h-1 bg-success" />
          <CardContent className="p-4 flex items-start gap-3">
            <ShieldCheck className="h-5 w-5 text-success mt-0.5" />
            <div>
              <p className="font-semibold text-success">Venda autorizada via código</p>
              <p className="text-sm text-muted-foreground">{venda?.aprovacao_motivo}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {aprovacaoPendente && (
        <Card className="mb-6 shadow-card overflow-hidden border-warning print:hidden">
          <div className="h-1 bg-warning" />
          <CardContent className="p-4 flex items-start gap-3">
            <ShieldAlert className="h-5 w-5 text-warning mt-0.5" />
            <div>
              <p className="font-semibold">Aguardando autorização do administrador</p>
              <p className="text-sm text-muted-foreground">
                A entrada desta venda está abaixo do mínimo exigido para o score do cliente.
                Um administrador precisa autorizar antes que a nota promissória possa ser assinada e os boletos emitidos.
                {venda?.aprovacao_motivo ? ` (${venda.aprovacao_motivo})` : ""}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {aprovacaoRejeitada && (
        <Card className="mb-6 shadow-card overflow-hidden border-destructive print:hidden">
          <div className="h-1 bg-destructive" />
          <CardContent className="p-4 flex items-start gap-3">
            <ShieldX className="h-5 w-5 text-destructive mt-0.5" />
            <div>
              <p className="font-semibold text-destructive">Venda rejeitada pelo administrador</p>
              <p className="text-sm text-muted-foreground">
                Esta venda não poderá prosseguir.{venda?.aprovacao_motivo ? ` Motivo: ${venda.aprovacao_motivo}` : ""}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {bloqueadoParaAssinatura && (
        <Card className="mb-6 shadow-card overflow-hidden print:hidden">
          <CardContent className="p-4 flex flex-col sm:flex-row gap-3 sm:items-end">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="codigo-autorizacao" className="text-sm font-medium">
                Tem um código de autorização?
              </Label>
              <Input
                id="codigo-autorizacao"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                className="font-mono"
                value={codigoAutorizacao}
                onChange={(e) => setCodigoAutorizacao(e.target.value.replace(/\D/g, ""))}
              />
              <p className="text-xs text-muted-foreground">
                Um administrador pode gerar esse código remotamente para liberar esta venda sem precisar abrir o contrato.
              </p>
            </div>
            <Button onClick={handleValidarCodigo} disabled={validandoCodigo || !codigoAutorizacao.trim()}>
              {validandoCodigo ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
              Validar código
            </Button>
          </CardContent>
        </Card>
      )}


      <Card className="shadow-elegant overflow-hidden">
        <div className={`h-1 ${assinado ? "bg-success" : enviado ? "bg-warning" : "bg-primary"}`} />
        <CardContent className="p-8 sm:p-12">
          <div className="mx-auto max-w-3xl text-card-foreground">
            <div className="mb-8 flex items-start justify-between gap-4">
              <div className="flex-1 text-center">
                <div className="flex items-baseline justify-center gap-2">
                  <h2 className="text-2xl font-bold">{tpl.title.toUpperCase()}</h2>
                  <span className="text-xs">Nº 1 DE 1</span>
                </div>
              </div>
              {(() => {
                const parsed = parseFromPromissoria(c.content);
                const vencDisplay = venda?.primeiro_vencimento
                  ? new Date(venda.primeiro_vencimento + "T00:00:00").toLocaleDateString("pt-BR")
                  : parsed.vencimento;
                const valorNum = venda?.valor_total ?? parsed.valor ?? null;
                const valorDisplay = valorNum != null ? brl(Number(valorNum)) : null;
                if (!vencDisplay && !valorDisplay) return null;
                return (
                  <div className="text-right text-xs shrink-0 border-l border-border pl-4">
                    {vencDisplay && (
                      <p>
                        <span>Vencimento: </span>
                        <span className="font-semibold">{vencDisplay}</span>
                      </p>
                    )}
                    {valorDisplay && (
                      <p className="mt-1">
                        <span>Valor: </span>
                        <span className="font-semibold">{valorDisplay}</span>
                      </p>
                    )}
                  </div>
                );
              })()}

            </div>

            <article className="text-sm leading-7 break-words">
              {c.content.split("\n").map((line, i) => {
                // Detecta "colunas" criadas com 4+ espaços consecutivos no template
                // (ex.: "Emitente: NOME            CIDADE, DATA") e renderiza
                // como flex para evitar quebras feias em telas estreitas.
                const m = line.match(/^(.*?\S)\s{4,}(\S.*)$/);
                if (m) {
                  return (
                    <div key={i} className="flex items-baseline justify-between gap-x-2 text-[12px]">
                      <span className="truncate">{m[1]}</span>
                      <span className="text-right whitespace-nowrap shrink-0">{m[2]}</span>
                    </div>
                  );
                }
                if (line.trim() === "") return <div key={i} className="h-3" />;
                return <p key={i}>{line}</p>;
              })}
            </article>

            <div className="mt-12 flex justify-center">
              <div className="w-full max-w-sm">
                <div className="border-t border-card-foreground pt-2 text-center text-sm">
                  <p className="font-semibold">Assinatura do emitente</p>
                </div>
                {assinado && (
                  <p className="mt-2 text-center text-xs text-success font-medium">
                    ✓ Assinado em {c.signed_at ? new Date(c.signed_at).toLocaleString("pt-BR") : ""}
                  </p>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {isAdmin && venda && (
        <Card className="mt-6 shadow-card">
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold mb-4">Resumo da venda</h3>
            {(() => {
              const vTotal = Number(venda.valor_total);
              const vEntradaTotal = Number(venda.valor_entrada) || 0;
              const vFinanciado = Number(venda.valor_financiado ?? 0);
              const vParcela = Number(venda.valor_parcela ?? 0);
              const entradaEntrega = Math.max(vTotal - vParcela * (venda.parcelas || 1), 0);
              const entradaSemEntrega = Math.max(vEntradaTotal - entradaEntrega, 0);
              return (
                <div className="grid grid-cols-2 gap-4 md:grid-cols-6 rounded-lg border bg-muted/30 p-4 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Venda</p>
                    <p className="font-semibold">{brl(vEntradaTotal + vFinanciado)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Entrada</p>
                    <p className="font-semibold">{brl(entradaSemEntrega)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Entrada na entrega</p>
                    <p className="font-semibold">{brl(entradaEntrega)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Financiado</p>
                    <p className="font-semibold text-primary">{brl(vFinanciado)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{venda.parcelas}x de</p>
                    <p className="font-bold text-accent">{brl(vParcela)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Promissória</p>
                    <p className="font-bold text-accent">{brl(vTotal)}</p>
                  </div>
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {(!venda || venda.parcelas > 1) && (
        <ParcelasContrato contratoId={c.id} contratoAssinado={assinado} vendaAutorizada={vendaAutorizada} />
      )}

      <SignatureMockDialog
        open={signDialog}
        onOpenChange={setSignDialog}
        signatureUrl={c.signature_url || ""}
        status={assinado ? "assinado" : "aguardando_assinatura"}
        onSimulateSign={!assinado && isAdmin ? handleSimulateSign : undefined}
      />

      <AlertDialog open={deleteDialog} onOpenChange={(o) => { setDeleteDialog(o); if (!o) setForceDelete(false); if (o && c) { supabase.from("crediario_parcelas").select("id", { count: "exact", head: true }).eq("contrato_id", c.id).not("cora_invoice_id", "is", null).then(({ count }) => setBoletosCount(count ?? 0)); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir contrato?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é permanente. O contrato e todas as parcelas relacionadas serão removidos.
              {boletosCount > 0 && (
                <span className="mt-2 block text-destructive font-medium">
                  Atenção: existem {boletosCount} boleto(s) emitido(s) no Cora. Eles NÃO serão cancelados automaticamente — cancele manualmente no Cora se necessário.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {boletosCount > 0 && isAdmin && (
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={forceDelete} onChange={(e) => setForceDelete(e.target.checked)} className="mt-1" />
              <span>Sim, excluir mesmo havendo boletos emitidos no Cora</span>
            </label>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting || (boletosCount > 0 && !forceDelete)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={phoneChoiceOpen} onOpenChange={setPhoneChoiceOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Gerar link de assinatura</DialogTitle>
            <DialogDescription>
              Escolha qual telefone será cadastrado no signatário na ZapSign. O link é exibido aqui.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 rounded-lg border p-3">
            <Label className="text-sm font-medium">Telefone do signatário</Label>
            <RadioGroup value={phoneTarget} onValueChange={(v) => setPhoneTarget(v as "empresa" | "cliente" | "manual")}>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <RadioGroupItem value="cliente" id="ph-cli" />
                <span>Celular do cliente</span>
                <span className="ml-auto text-xs text-muted-foreground">{c.telefone || "não cadastrado"}</span>
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <RadioGroupItem value="empresa" id="ph-emp" />
                <span>Celular da empresa</span>
                <span className="ml-auto text-xs text-muted-foreground">{empresaPhone || "não cadastrado"}</span>
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <RadioGroupItem value="manual" id="ph-man" />
                <span>Digitar manualmente</span>
              </label>
              {phoneTarget === "manual" && (
                <Input
                  type="tel"
                  inputMode="tel"
                  placeholder="(99) 99999-9999"
                  value={manualPhone}
                  onChange={(e) => setManualPhone(e.target.value)}
                  className="mt-1"
                />
              )}
            </RadioGroup>
          </div>

          <div className="space-y-2 rounded-lg border p-3">
            <Label htmlFor="comprovante" className="text-sm font-medium">
              Comprovante de residência do cliente <span className="text-muted-foreground">(opcional)</span>
            </Label>
            <input
              id="comprovante"
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              capture="environment"
              onChange={(e) => setComprovanteFile(e.target.files?.[0] ?? null)}
              className="block w-full text-xs file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-primary-foreground file:cursor-pointer"
            />
            <p className="text-xs text-muted-foreground">
              Opcional. No celular a foto é enviada ao servidor antes de gerar o link (JPG, PNG ou PDF até 4 MB).
            </p>
            {comprovanteFile && (
              <p className="text-xs text-foreground">
                Arquivo: <span className="font-medium">{comprovanteFile.name}</span>
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPhoneChoiceOpen(false)}>Cancelar</Button>
            <Button
              onClick={submitSignature}
              disabled={signing}
              className="bg-gradient-primary"
            >
              {signing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PenLine className="mr-2 h-4 w-4" />}
              Gerar link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
