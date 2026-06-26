import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Search, Loader2, CheckCircle2, HandCoins } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { SaleAddressDialog, type AddressData, type EmpresaOption } from "@/components/crediario/SaleAddressDialog";
import { maskCpf, brl, pricePmt } from "@/lib/crediarioFinance";
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

export default function CrediarioRenegociacaoPage() {
  const nav = useNavigate();
  const { user, isAdmin, isFinanceiro } = useAuth();
  const [cidadeUsuario, setCidadeUsuario] = useState<string>("");
  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [cpf, setCpf] = useState("");
  const [loading, setLoading] = useState(false);
  const [nome, setNome] = useState<string | null>(null);
  const [valorAcordo, setValorAcordo] = useState("");
  const [valorEntrada, setValorEntrada] = useState("");
  const [addressOpen, setAddressOpen] = useState(false);
  const [savingVenda, setSavingVenda] = useState(false);
  const [empresasDisponiveis, setEmpresasDisponiveis] = useState<EmpresaOption[]>([]);
  const [parcelas, setParcelas] = useState<number>(3);
  const [maxParcelas, setMaxParcelas] = useState<number>(12);
  const [taxaRenegociacao, setTaxaRenegociacao] = useState<number>(0);

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
    supabase
      .from("crediario_settings")
      .select("renegociacao_max_parcelas, renegociacao_juros_percent")
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        const d = data as { renegociacao_max_parcelas?: number; renegociacao_juros_percent?: number };
        setMaxParcelas(d.renegociacao_max_parcelas ?? 12);
        setTaxaRenegociacao(d.renegociacao_juros_percent ?? 0);
      });
  }, []);

  const podeVerEmpresas = isAdmin || isFinanceiro;
  useEffect(() => {
    if (!podeVerEmpresas) return;
    supabase
      .from("companies")
      .select("id, name")
      .order("name", { ascending: true })
      .then(({ data }) => {
        if (!data) return;
        setEmpresasDisponiveis(data.map((e) => ({ id: e.id, nome: e.name, cidade: "" })));
      });
  }, [podeVerEmpresas]);

  const acordo = parseFloat(valorAcordo.replace(",", ".")) || 0;
  const entrada = parseFloat(valorEntrada.replace(",", ".")) || 0;
  const diferenca = Math.max(acordo - entrada, 0);
  const valorParcela = parcelas > 0 && diferenca > 0
    ? (taxaRenegociacao > 0 ? pricePmt(diferenca, taxaRenegociacao, parcelas) : Math.ceil(diferenca / parcelas))
    : 0;
  const valorTotalParcelado = valorParcela * parcelas;
  const podeRegistrar = !!nome && acordo > 0 && entrada >= 0 && entrada <= acordo && parcelas >= 1;

  const handleConsultar = async () => {
    const digits = cpf.replace(/\D/g, "");
    if (digits.length !== 11) {
      toast.error("Informe um CPF válido");
      return;
    }
    setLoading(true);
    setNome(null);
    setValorAcordo("");
    setValorEntrada("");
    try {
      // 1) Consulta salva do Serasa (crediario_consultas_cache, válida por 3 meses)
      const { data: serasa } = await supabase
        .from("crediario_consultas_cache")
        .select("nome")
        .eq("cpf", digits)
        .gt("expira_em", new Date().toISOString())
        .not("nome", "is", null)
        .order("consultado_em", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (serasa?.nome) {
        setNome(serasa.nome);
        toast.success("Cliente encontrado (base Serasa)");
        return;
      }

      // 2) Consulta salva de Pagamento na Entrega
      const { data: pgEntrega } = await supabase
        .from("crediario_consultas_pg_entrega")
        .select("nome")
        .eq("cpf", digits)
        .not("nome", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (pgEntrega?.nome) {
        setNome(pgEntrega.nome);
        toast.success("Cliente encontrado (consulta PG entrega)");
        return;
      }

      // 3) Não está salvo — consulta na APIFull
      const { data, error } = await supabase.functions.invoke("apifull-consulta-cpf", {
        body: { cpf: digits },
      });
      const apiFullFailed = !!error || (data?.status && data.status !== "sucesso");
      const dados = data?.dados ?? data;

      if (apiFullFailed) {
        if (error) throw new Error(await getFunctionErrorMessage(error));
        toast.error("CPF não encontrado");
        return;
      }
      if (!dados?.nome) {
        toast.error("CPF não encontrado");
        return;
      }
      setNome(dados.nome);
      try {
        const { data: u } = await supabase.auth.getUser();
        await supabase.from("crediario_consultas_renegociacao").insert({
          user_id: u.user!.id,
          cpf: digits,
          nome: dados.nome,
          raw: dados,
          cidade: cidadeUsuario ?? "",
          company_id: empresaId ?? null,
        });
      } catch { /* não bloqueia */ }
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

      // 1) Venda (renegociação)
      const { data: vendaIns, error: vendaErr } = await supabase
        .from("crediario_vendas")
        .insert({
          user_id: userId,
          cpf: cpfDigits,
          nome,
          valor_total: acordo,
          valor_entrada: entrada,
          parcelas,
          taxa_juros: taxaRenegociacao,
          valor_parcela: valorParcela,
          valor_financiado: diferenca,
          status: "aprovado",
          tipo: "renegociacao",
          cidade: cidadeVenda,
          company_id: empresaIdVenda,
          primeiro_vencimento: endereco.primeiroVencimento || null,
        })
        .select("id")
        .single();
      if (vendaErr) throw vendaErr;

      // 2) Template
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
        valor_total: brl(acordo).replace("R$", "").trim(),
        valor_total_extenso: valorExtenso(acordo),
        valor_entrada: brl(entrada).replace("R$", "").trim(),
        valor_entrada_extenso: valorExtenso(entrada),
        valor_financiado: brl(diferenca).replace("R$", "").trim(),
        valor_financiado_extenso: valorExtenso(diferenca),
        valor_parcela: brl(valorParcela).replace("R$", "").trim(),
        valor_parcela_extenso: valorExtenso(valorParcela),
        parcelas,
        taxa_juros: taxaRenegociacao.toFixed(2).replace(".", ","),
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

      // 3) Contrato
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

      toast.success("Renegociação registrada — promissória gerada");
      nav(`/crediario/contratos/${contractIns.id}`);
    } catch (e) {
      console.error("Erro ao registrar renegociação", e);
      toast.error("Erro ao registrar renegociação", {
        description: await getFunctionErrorMessage(e),
      });
    } finally {
      setSavingVenda(false);
    }
  };

  return (
    <AppLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <HandCoins className="h-6 w-6 text-primary" />
          Renegociação
        </h1>
        <p className="text-sm text-muted-foreground">
          Consulte o CPF do cliente para gerar a promissória do acordo.
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

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="valor-acordo">Valor do acordo (R$)</Label>
                <Input
                  id="valor-acordo"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={valorAcordo}
                  onChange={(e) => setValorAcordo(e.target.value.replace(/[^\d.,]/g, ""))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="valor-entrada">Valor da entrada (R$)</Label>
                <Input
                  id="valor-entrada"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={valorEntrada}
                  onChange={(e) => setValorEntrada(e.target.value.replace(/[^\d.,]/g, ""))}
                  className="mt-1"
                />
              </div>
            </div>

            {acordo > 0 && (
              <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                <span className="text-muted-foreground">Valor a parcelar (diferença): </span>
                <span className="font-semibold">{brl(diferenca)}</span>
              </div>
            )}

            {diferenca > 0 && (
              <div>
                <Label>Parcelas</Label>
                <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {Array.from({ length: maxParcelas }, (_, i) => i + 1).map((n) => {
                    const pmt = taxaRenegociacao > 0
                      ? pricePmt(diferenca, taxaRenegociacao, n)
                      : Math.ceil(diferenca / n);
                    const ativo = parcelas === n;
                    return (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setParcelas(n)}
                        className={`rounded-lg border p-3 text-left transition-all ${
                          ativo
                            ? "border-primary bg-primary text-primary-foreground shadow-elegant"
                            : "border-border bg-card hover:border-primary/40"
                        }`}
                      >
                        <p className="text-xs opacity-80">{n}x</p>
                        <p className="font-bold text-sm">{brl(pmt)}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {diferenca > 0 && parcelas > 0 && (
              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
                  <div><p className="text-xs text-muted-foreground">Acordo</p><p className="font-semibold">{brl(acordo)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Entrada</p><p className="font-semibold">{brl(entrada)}</p></div>
                  <div><p className="text-xs text-muted-foreground">{parcelas}x de</p><p className="font-bold text-accent">{brl(valorParcela)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Total parcelado</p><p className="font-bold text-primary">{brl(valorTotalParcelado)}</p></div>
                </div>
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
                Registrar renegociação
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
        empresasDisponiveis={podeVerEmpresas ? empresasDisponiveis : undefined}
      />
    </AppLayout>
  );
}
