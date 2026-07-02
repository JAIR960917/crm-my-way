import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Search, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { SaleAddressDialog, type AddressData, type EmpresaOption } from "@/components/crediario/SaleAddressDialog";
import { maskCpf, brl } from "@/lib/crediarioFinance";
import { fillTemplate, valorExtenso, dataExtenso, dataExtensoTotal } from "@/lib/crediarioContract";

function formatCPF(value: string) {
  const d = value.replace(/\D/g, "").slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

async function getFunctionErrorMessage(error: unknown) {
  const context = typeof error === "object" && error && "context" in error
    ? (error as { context?: Response }).context
    : null;

  if (context) {
    const text = await context.clone().text().catch(() => "");
    if (text) {
      try {
        const json = JSON.parse(text) as { error?: string; details?: unknown };
        const details = json.details ? ` — ${JSON.stringify(json.details).slice(0, 300)}` : "";
        return `${json.error ?? text}${details}`;
      } catch {
        return text.slice(0, 500);
      }
    }
  }

  if (typeof error === "object" && error) {
    const err = error as { message?: string; details?: string; hint?: string; code?: string };
    const parts = [err.message, err.details, err.hint, err.code ? `Código: ${err.code}` : null].filter(Boolean);
    if (parts.length) return parts.join(" — ");
  }

  return error instanceof Error ? error.message : String(error);
}

export default function CrediarioPagamentoEntregaPage() {
  const nav = useNavigate();
  const { user, isAdmin } = useAuth();
  const [cidadeUsuario, setCidadeUsuario] = useState<string>("");
  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [cpf, setCpf] = useState("");
  const [loading, setLoading] = useState(false);
  const [nome, setNome] = useState<string | null>(null);
  const [valorTotal, setValorTotal] = useState("");
  const [addressOpen, setAddressOpen] = useState(false);
  const [savingVenda, setSavingVenda] = useState(false);
  const [empresasDisponiveis, setEmpresasDisponiveis] = useState<EmpresaOption[]>([]);

  // Empresa/cidade do usuário logado
  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("company_id, cidade")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        setEmpresaId(data?.company_id ?? null);
        setCidadeUsuario(data?.cidade ?? "");
      });
  }, [user]);

  useEffect(() => {
    if (!isAdmin) return;
    supabase
      .from("companies")
      .select("id, name")
      .order("name", { ascending: true })
      .then(({ data }) => {
        if (!data) return;
        setEmpresasDisponiveis(data.map((e) => ({ id: e.id, nome: e.name, cidade: "" })));
      });
  }, [isAdmin]);

  const total = parseFloat(valorTotal.replace(",", ".")) || 0;
  const entrada = 0;
  const financiado = total;
  const podeRegistrar = !!nome && total > 0;

  const handleConsultar = async () => {
    const digits = cpf.replace(/\D/g, "");
    if (digits.length !== 11) {
      toast.error("Informe um CPF válido");
      return;
    }
    setLoading(true);
    setNome(null);
    setValorTotal("");

    try {
      // 1) Consulta salva do Serasa (via edge function — a tabela de cache
      // guarda relatório de crédito completo de qualquer CPF, então o
      // acesso direto é restrito a admin/gerente/financeiro).
      const { data: serasaResp } = await supabase.functions.invoke("crediario-checar-cache-cpf", {
        body: { cpf: digits },
      });
      const nomeSerasa = (serasaResp as { nome?: string | null } | null)?.nome;

      if (nomeSerasa) {
        setNome(nomeSerasa);
        toast.success("Cliente encontrado (base Serasa)");
        return;
      }

      // 2) Consulta salva de Pagamento na Entrega
      const { data: cached } = await supabase
        .from("crediario_consultas_pg_entrega")
        .select("nome")
        .eq("cpf", digits)
        .not("nome", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cached?.nome) {
        setNome(cached.nome);
        toast.success("Cliente encontrado (consulta salva)");
        return;
      }

      // 3) Não está salvo — consulta na APIFull
      const { data, error } = await supabase.functions.invoke("apifull-consulta-cpf", {
        body: { cpf: digits },
      });
      const apiFullFailed = !!error || (data?.status && data.status !== "sucesso");
      const dados = data?.dados ?? data;

      if (apiFullFailed || !dados?.nome) {
        toast.error("CPF não encontrado");
        return;
      }

      setNome(dados.nome);
      // Salva no histórico de consultas PG Entrega
      try {
        const { data: u } = await supabase.auth.getUser();
        await supabase.from("crediario_consultas_pg_entrega").insert({
          user_id: u.user!.id,
          cpf: digits,
          nome: dados.nome,
          raw: dados,
          cidade: cidadeUsuario ?? "",
          company_id: empresaId ?? null,
        });
      } catch { /* não bloqueia o fluxo */ }
      toast.success("Cliente encontrado");
    } catch (e) {
      toast.error((e as Error).message || "Erro ao consultar");
    } finally {
      setLoading(false);
    }
  };

  const handleRegistrar = () => {
    if (!podeRegistrar) return;
    setAddressOpen(true);
  };

  const confirmarVendaComEndereco = async (endereco: AddressData) => {
    if (!nome) return;
    setAddressOpen(false);
    setSavingVenda(true);
    try {
      const cpfDigits = cpf.replace(/\D/g, "");
      const { data: u } = await supabase.auth.getUser();
      const userId = u.user!.id;

      const empresaIdVenda = endereco.empresaId ?? empresaId ?? null;
      const cidadeLoja = empresasDisponiveis.find((e) => e.id === empresaIdVenda)?.cidade || cidadeUsuario || "";
      const cidadeVenda = cidadeLoja.trim();

      // 1) Registra venda (pagamento na entrega = 1 parcela, sem juros)
      const { data: vendaIns, error: vendaErr } = await supabase
        .from("crediario_vendas")
        .insert({
          user_id: userId,
          cpf: cpfDigits,
          nome,
          valor_total: total,
          valor_entrada: entrada,
          parcelas: 1,
          taxa_juros: 0,
          valor_parcela: financiado,
          valor_financiado: financiado,
          status: "aprovado",
          cidade: cidadeVenda,
          company_id: empresaIdVenda,
          primeiro_vencimento: endereco.primeiroVencimento || null,
        })
        .select("id")
        .single();
      if (vendaErr) throw vendaErr;

      // 2) Modelo de contrato
      const { data: tpl, error: tplErr } = await supabase
        .from("crediario_contract_template")
        .select("content, company_name, company_cnpj, company_address")
        .limit(1)
        .maybeSingle();
      if (tplErr) throw tplErr;
      if (!tpl) throw new Error("Modelo de contrato não configurado.");

      const filled = fillTemplate(tpl.content, {
        nome,
        cpf: maskCpf(cpfDigits),
        endereco: endereco.endereco,
        telefone: endereco.telefone,
        empresa: tpl.company_name,
        empresa_cnpj: tpl.company_cnpj || "",
        empresa_endereco: tpl.company_address || "",
        valor_total: brl(total).replace("R$", "").trim(),
        valor_total_extenso: valorExtenso(total),
        valor_entrada: brl(entrada).replace("R$", "").trim(),
        valor_entrada_extenso: valorExtenso(entrada),
        valor_financiado: brl(financiado).replace("R$", "").trim(),
        valor_financiado_extenso: valorExtenso(financiado),
        valor_parcela: brl(financiado).replace("R$", "").trim(),
        valor_parcela_extenso: valorExtenso(financiado),
        parcelas: 1,
        taxa_juros: "0,00",
        valor_dividas: brl(0).replace("R$", "").trim(),
        valor_dividas_extenso: valorExtenso(0),
        data: new Date().toLocaleDateString("pt-BR"),
        data_extenso: dataExtenso(new Date()),
        data_extenso_total: dataExtensoTotal(new Date()),
        cidade: cidadeVenda,
        primeiro_vencimento: endereco.primeiroVencimento
          ? new Date(endereco.primeiroVencimento + "T00:00:00").toLocaleDateString("pt-BR")
          : "",
        primeiro_vencimento_extenso: endereco.primeiroVencimento
          ? dataExtenso(new Date(endereco.primeiroVencimento + "T00:00:00"))
          : "",
        primeiro_vencimento_extenso_total: endereco.primeiroVencimento
          ? dataExtensoTotal(new Date(endereco.primeiroVencimento + "T00:00:00"))
          : "",
      });

      // 3) Cria contrato
      const { data: contractIns, error: contractErr } = await supabase
        .from("crediario_contracts")
        .insert({
          user_id: userId,
          venda_id: vendaIns.id,
          cpf: cpfDigits,
          nome,
          endereco: endereco.endereco,
          telefone: endereco.telefone,
          content: filled,
          status: "pendente",
          cidade: cidadeVenda,
          company_id: empresaIdVenda,
        })
        .select("id")
        .single();
      if (contractErr) throw contractErr;

      toast.success("Venda registrada — promissória gerada");
      nav(`/crediario/contratos/${contractIns.id}`);
    } catch (e) {
      console.error("Erro ao registrar venda", e);
      toast.error("Erro ao registrar venda", {
        description: await getFunctionErrorMessage(e),
      });
    } finally {
      setSavingVenda(false);
    }
  };

  return (
    <AppLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Pagamento na Entrega</h1>
        <p className="text-sm text-muted-foreground">
          Consulte o CPF do cliente para gerar a promissória.
        </p>
      </div>

      <Card className="shadow-card">
        <CardContent className="p-6">
          <div className="flex flex-col gap-2 md:flex-row md:items-end">
            <div className="flex-1">
              <Label htmlFor="cpf" className="text-primary font-semibold">CPF</Label>
              <Input
                id="cpf"
                placeholder="000.000.000-00"
                value={cpf}
                onChange={(e) => setCpf(formatCPF(e.target.value))}
                onKeyDown={(e) => e.key === "Enter" && handleConsultar()}
                className="mt-1"
              />
            </div>
            <Button
              onClick={handleConsultar}
              disabled={loading}
              className="bg-primary text-primary-foreground hover:bg-primary/90 md:w-auto"
            >
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
              {loading ? "Consultando..." : "Consultar"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {nome && (
        <Card className="mt-6 shadow-card">
          <CardContent className="p-6 space-y-5">
            <div>
              <p className="text-xs uppercase text-muted-foreground">Cliente</p>
              <p className="text-lg font-semibold">{nome}</p>
            </div>

            <div>
              <Label htmlFor="valor-total">Valor da venda (R$)</Label>
              <Input
                id="valor-total"
                inputMode="decimal"
                placeholder="0,00"
                value={valorTotal}
                onChange={(e) => setValorTotal(e.target.value.replace(/[^\d.,]/g, ""))}
                className="mt-1"
              />
            </div>

            {total > 0 && (
              <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                <span className="text-muted-foreground">Valor da promissória: </span>
                <span className="font-semibold">{brl(financiado)}</span>
              </div>
            )}

            {podeRegistrar && (
              <Button
                onClick={handleRegistrar}
                disabled={savingVenda}
                className="bg-success hover:bg-success/90 text-success-foreground"
              >
                {savingVenda ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                )}
                Registrar venda aprovada
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <SaleAddressDialog
        open={addressOpen}
        onOpenChange={setAddressOpen}
        onConfirm={confirmarVendaComEndereco}
        clienteNome={nome ?? undefined}
        cidadePadrao={cidadeUsuario ?? undefined}
        empresaPadraoId={empresaId ?? null}
        empresasDisponiveis={isAdmin ? empresasDisponiveis : undefined}
      />
    </AppLayout>
  );
}
