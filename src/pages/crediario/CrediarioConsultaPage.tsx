import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Search, Loader2, User2, CheckCircle2, XCircle, Calculator, Printer, AlertTriangle, History, FlaskConical,
} from "lucide-react";
import {
  maskCpf, brl, pricePmt, suggestedEntry, availableInstallments,
  minEntryForScore, rateForScore,
  type SettingsLite, type ScoreTier,
} from "@/lib/crediarioFinance";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { SaleAddressDialog, type AddressData, type EmpresaOption } from "@/components/crediario/SaleAddressDialog";
import { fillTemplate, valorExtenso, dataExtenso, dataExtensoTotal } from "@/lib/crediarioContract";
import { useAuth } from "@/contexts/AuthContext";

interface Pendencia {
  credor: string;
  valor: number;
  data: string | null;
  tipo: string;
  contrato?: string;
}

interface ConsultaResult {
  cpf: string;
  nome: string;
  score: number;
  pendencias?: Pendencia[];
  totalPendencias?: number;
  somaPendencias?: number;
}

interface HistoricoItem {
  id: string;
  created_at: string;
  score: number | null;
  status: string;
  nome: string | null;
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

export default function CrediarioConsultaPage() {
  const nav = useNavigate();
  const { user, isAdmin } = useAuth();
  const [cidadeUsuario, setCidadeUsuario] = useState<string>("");
  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [cpf, setCpf] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ConsultaResult | null>(null);
  const [consultaId, setConsultaId] = useState<string | null>(null);
  const [settings, setSettings] = useState<SettingsLite | null>(null);
  const [empresasDisponiveis, setEmpresasDisponiveis] = useState<EmpresaOption[]>([]);
  const [historico, setHistorico] = useState<HistoricoItem[]>([]);

  // Testes de homologação Serasa
  const [homologBusy, setHomologBusy] = useState(false);
  const [homologResults, setHomologResults] = useState<Array<{
    cpf: string;
    cenario: string;
    ok: boolean;
    nome?: string;
    score?: number;
    totalPendencias?: number;
    somaPendencias?: number;
    error?: string;
  }> | null>(null);

  // Simulação
  const [modoSimulacao, setModoSimulacao] = useState(false);
  const [simNome, setSimNome] = useState("");
  const [simNascimento, setSimNascimento] = useState("");
  const [simScore, setSimScore] = useState<string>("850");

  // Venda
  const [valorTotal, setValorTotal] = useState<string>("");
  const [valorEntrada, setValorEntrada] = useState<string>("");
  const [valorEntradaEntrega, setValorEntradaEntrega] = useState<string>("");
  const [parcelas, setParcelas] = useState<number | null>(null);
  const [savingVenda, setSavingVenda] = useState(false);
  const [vendaSemEntrada, setVendaSemEntrada] = useState(false);

  // Dialog endereço/telefone
  const [addressOpen, setAddressOpen] = useState(false);

  useEffect(() => {
    supabase.from("crediario_settings").select("*").limit(1).maybeSingle().then(({ data }) => {
      if (data) {
        const raw = (data.score_tiers as unknown as Array<Partial<ScoreTier> & { entry_percent?: number }>) ?? [];
        const tiers: ScoreTier[] = raw.map((t) => {
          const min_pct = t.entry_min_percent ?? t.entry_percent ?? 0;
          const sug_pct = t.entry_suggested_percent ?? t.entry_percent ?? min_pct;
          return {
            min: t.min ?? 0,
            max: t.max ?? 0,
            entry_suggested_percent: sug_pct,
            entry_min_percent: min_pct,
            rate: t.rate ?? 0,
          };
        });
        setSettings({
          min_score: data.min_score,
          max_installments: data.max_installments,
          score_tiers: tiers,
        });
      }
    });
  }, []);

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

  // Admin: carrega lista de empresas ativas para seleção na venda
  useEffect(() => {
    if (!isAdmin) return;
    supabase
      .from("companies")
      .select("id, name")
      .order("name", { ascending: true })
      .then(({ data }) => {
        if (!data) return;
        setEmpresasDisponiveis(
          data.map((e) => ({ id: e.id, nome: e.name, cidade: "" })),
        );
      });
  }, [isAdmin]);

  const total = parseFloat(valorTotal.replace(",", ".")) || 0;
  const entrada = parseFloat(valorEntrada.replace(",", ".")) || 0;
  const entradaEntrega = parseFloat(valorEntradaEntrega.replace(",", ".")) || 0;
  const entradaTotalPaga = entrada + entradaEntrega;

  // Bloqueio por segmento do credor: se houver pendência de credor de varejo similar,
  // não permite venda mesmo com score acima do mínimo.
  const SEGMENTOS_BLOQUEADOS = ["otica", "ótica", "movei", "móvei", "eletro", "calcado", "calçado", "roupa", "vestuario", "vestuário"];
  const pendenciasBloqueadoras = (result?.pendencias ?? []).filter((p) => {
    const c = (p.credor ?? "").toLowerCase();
    return SEGMENTOS_BLOQUEADOS.some((s) => c.includes(s));
  });
  const bloqueadoPorSegmento = pendenciasBloqueadoras.length > 0;
  const aprovado = result && settings ? result.score >= settings.min_score && !bloqueadoPorSegmento : false;
  const minEntrada = result && settings && total > 0 ? minEntryForScore(total, result.score, settings) : 0;
  const sugerida = result && settings && total > 0 ? suggestedEntry(total, result.score, settings) : 0;
  const entradaAbaixoDoMinimo = total > 0 && entradaTotalPaga < minEntrada - 0.01;
  const financiado = Math.max(total - entradaTotalPaga, 0);
  const taxaScore = result && settings ? rateForScore(result.score, settings) : 0;

  const opcoesParcelas = useMemo(() => settings ? availableInstallments(settings) : [], [settings]);

  const consultar = async () => {
    setBusy(true);
    setResult(null); setConsultaId(null); setHistorico([]);
      setValorTotal(""); setValorEntrada(""); setValorEntradaEntrega(""); setParcelas(null);
    try {
      const payload: Record<string, unknown> = { cpf: cpf.replace(/\D/g, "") };
      if (modoSimulacao) {
        payload.simulacao = true;
        payload.nome = simNome.trim() || "Cliente Simulado";
        payload.dataNascimento = simNascimento || null;
        const s = parseInt(simScore, 10);
        payload.score = Number.isFinite(s) ? s : 850;
      }
      const { data, error } = await supabase.functions.invoke("consulta-cpf", { body: payload });
      if (error) throw new Error(await getFunctionErrorMessage(error));
      const resp = data as { error?: string; notFound?: boolean; serasaUnauthorized?: boolean } & ConsultaResult;
      if (resp?.notFound) {
        toast.warning("CPF não encontrado", { description: resp.error ?? "Documento não localizado na base da Serasa." });
        return;
      }
      if (resp?.serasaUnauthorized) {
        toast.error("Serasa sem liberação", { description: resp.error ?? "Credenciais sem permissão para este relatório." });
        return;
      }
      if (resp?.error) throw new Error(resp.error);
      setResult(data as ConsultaResult);
      // pega o id da consulta recém criada
      const cpfDigits = (data as ConsultaResult).cpf;
      const { data: c } = await supabase
        .from("crediario_consultas")
        .select("id").eq("cpf", cpfDigits)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (c) setConsultaId(c.id);

      // busca histórico de consultas anteriores deste CPF (RLS filtra por usuário/empresa)
      const { data: hist } = await supabase
        .from("crediario_consultas")
        .select("id, created_at, score, status, nome")
        .eq("cpf", cpfDigits)
        .order("created_at", { ascending: false })
        .limit(20);
      if (hist) setHistorico(hist as HistoricoItem[]);

      toast.success(modoSimulacao ? "Simulação carregada" : "Consulta concluída");
    } catch (e: unknown) {
      toast.error("Falha na consulta", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  /** Roda os 3 CPFs de homologação Serasa em sequência e monta um resumo. */
  const rodarTestesHomologacao = async () => {
    const casos = [
      { cpf: "00000000353", cenario: "CPF de homologação 1" },
      { cpf: "00000001163", cenario: "CPF de homologação 2" },
      { cpf: "00000001244", cenario: "CPF de homologação 3" },
    ];
    setHomologBusy(true);
    setHomologResults(null);
    const acumulado: NonNullable<typeof homologResults> = [];
    try {
      for (const caso of casos) {
        try {
          const { data, error } = await supabase.functions.invoke("consulta-cpf", {
            body: { cpf: caso.cpf },
          });
          if (error) throw new Error(await getFunctionErrorMessage(error));
          const resp = data as {
            error?: string;
            notFound?: boolean;
            serasaUnauthorized?: boolean;
            nome?: string;
            score?: number;
            totalPendencias?: number;
            somaPendencias?: number;
          };
          if (resp?.error && !resp?.notFound && !resp?.serasaUnauthorized) throw new Error(resp.error);
          acumulado.push({
            cpf: caso.cpf,
            cenario: caso.cenario,
            ok: !resp?.notFound && !resp?.serasaUnauthorized,
            nome: resp?.nome,
            score: resp?.score,
            totalPendencias: resp?.totalPendencias,
            somaPendencias: resp?.somaPendencias,
            error: resp?.notFound ? "CPF não encontrado na base" : resp?.serasaUnauthorized ? resp.error : undefined,
          });
        } catch (e) {
          acumulado.push({
            cpf: caso.cpf,
            cenario: caso.cenario,
            ok: false,
            error: e instanceof Error ? e.message : String(e),
          });
        }
        await new Promise((r) => setTimeout(r, 400));
      }
      setHomologResults(acumulado);
      const sucesso = acumulado.filter((r) => r.ok).length;
      if (sucesso === casos.length) {
        toast.success(`Homologação OK — ${sucesso}/${casos.length} CPFs respondidos`);
      } else {
        toast.warning(`Homologação parcial — ${sucesso}/${casos.length} CPFs OK`);
      }
    } finally {
      setHomologBusy(false);
    }
  };

  // Aplica entrada sugerida sempre que valorTotal mudar
  useEffect(() => {
    if (vendaSemEntrada) {
      setValorEntrada("0");
      setValorEntradaEntrega("0");
      return;
    }
    if (result && settings && total > 0) {
      setValorEntrada(sugerida.toFixed(2));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valorTotal, result?.cpf, vendaSemEntrada]);

  /** Para vendas aprovadas, abre o dialog de endereço/telefone antes de registrar. */
  const handleRegistrarAprovada = () => {
    if (!result || !settings || !parcelas) return;
    setAddressOpen(true);
  };

  /** Cria venda + contrato e leva o vendedor para a tela do contrato. */
  const confirmarVendaComEndereco = async (endereco: AddressData) => {
    if (!result || !settings || !parcelas) return;
    setAddressOpen(false);
    setSavingVenda(true);
    try {
      const taxa = rateForScore(result.score, settings);
      const pmt = pricePmt(financiado, taxa, parcelas);
      const valorPromissoria = entradaEntrega + pmt * parcelas;
      const { data: u } = await supabase.auth.getUser();
      const userId = u.user!.id;

      // 1) registra a venda
      const empresaIdVenda = endereco.empresaId ?? empresaId ?? null;
      const cidadeLoja = empresasDisponiveis.find((e) => e.id === empresaIdVenda)?.cidade || cidadeUsuario || "";
      const cidadeVenda = cidadeLoja.trim();
      const { data: vendaIns, error: vendaErr } = await supabase
        .from("crediario_vendas")
        .insert({
          user_id: userId,
          consulta_id: consultaId,
          cpf: result.cpf,
          nome: result.nome,
          score: result.score,
          valor_total: valorPromissoria,
          valor_entrada: entradaTotalPaga,
          parcelas,
          taxa_juros: taxa,
          valor_parcela: pmt,
          valor_financiado: financiado,
          status: "aprovado",
          cidade: cidadeVenda,
          company_id: empresaIdVenda,
          primeiro_vencimento: endereco.primeiroVencimento || null,
          aprovacao_admin: entradaAbaixoDoMinimo ? "pendente" : null,
          aprovacao_motivo: entradaAbaixoDoMinimo
            ? `Entrada ${brl(entradaTotalPaga)} abaixo do mínimo ${brl(minEntrada)} (score ${result.score})`
            : null,
        })
        .select("id")
        .single();
      if (vendaErr) throw vendaErr;

      // 2) busca modelo atual e gera o conteúdo final
      const { data: tpl, error: tplErr } = await supabase
        .from("crediario_contract_template")
        .select("content, company_name, company_cnpj, company_address")
        .limit(1)
        .maybeSingle();
      if (tplErr) throw tplErr;
      if (!tpl) throw new Error("Modelo de contrato não configurado.");

      const somaDividas = result.somaPendencias ?? 0;
      const filled = fillTemplate(tpl.content, {
        nome: result.nome,
        cpf: maskCpf(result.cpf),
        endereco: endereco.endereco,
        telefone: endereco.telefone,
        empresa: tpl.company_name,
        empresa_cnpj: tpl.company_cnpj || "",
        empresa_endereco: tpl.company_address || "",
        valor_total: brl(valorPromissoria).replace("R$", "").trim(),
        valor_total_extenso: valorExtenso(valorPromissoria),
        valor_venda: brl(total).replace("R$", "").trim(),
        valor_venda_extenso: valorExtenso(total),
        valor_entrada: brl(entrada).replace("R$", "").trim(),
        valor_entrada_extenso: valorExtenso(entrada),
        valor_entrada_entrega: brl(entradaEntrega).replace("R$", "").trim(),
        valor_entrada_entrega_extenso: valorExtenso(entradaEntrega),
        valor_financiado: brl(financiado).replace("R$", "").trim(),
        valor_financiado_extenso: valorExtenso(financiado),
        valor_parcela: brl(pmt).replace("R$", "").trim(),
        valor_parcela_extenso: valorExtenso(pmt),
        parcelas,
        taxa_juros: taxa.toFixed(2).replace(".", ","),
        valor_dividas: brl(somaDividas).replace("R$", "").trim(),
        valor_dividas_extenso: valorExtenso(somaDividas),
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

      // 3) cria o contrato
      const { data: contractIns, error: contractErr } = await supabase
        .from("crediario_contracts")
        .insert({
          user_id: userId,
          venda_id: vendaIns.id,
          consulta_id: consultaId,
          cpf: result.cpf,
          nome: result.nome,
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

      toast.success("Venda registrada — contrato gerado");
      nav(`/crediario/contratos/${contractIns.id}`);
    } catch (e: unknown) {
      console.error("Erro ao registrar venda", e);
      toast.error("Erro ao registrar venda", {
        description: await getFunctionErrorMessage(e),
      });
    } finally {
      setSavingVenda(false);
    }
  };

  /** Recusada: registra direto, sem contrato. */
  const registrarRecusada = async () => {
    if (!result || !settings || !parcelas) return;
    const taxa = rateForScore(result.score, settings);
    const pmt = pricePmt(financiado, taxa, parcelas);
    setSavingVenda(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("crediario_vendas").insert({
      user_id: u.user!.id,
      consulta_id: consultaId,
      cpf: result.cpf,
      nome: result.nome,
      score: result.score,
      valor_total: total,
      valor_entrada: entrada,
      parcelas,
      taxa_juros: taxa,
      valor_parcela: pmt,
      valor_financiado: financiado,
      status: "recusado",
    });
    setSavingVenda(false);
    if (error) { toast.error("Erro ao registrar", { description: error.message }); return; }
    toast.success("Venda recusada registrada");
    setResult(null); setCpf(""); setValorTotal(""); setValorEntrada(""); setParcelas(null);
  };

  return (
    <AppLayout>
      <header className="mb-6 flex items-start justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Vender no boleto</h1>
          <p className="text-muted-foreground">Informe o CPF do cliente para iniciar</p>
        </div>
        {result && (
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" />Imprimir / PDF
          </Button>
        )}
      </header>

      <Card className="shadow-card print:hidden">
        <CardContent className="p-6 space-y-4">

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-2">
              <Label htmlFor="cpf">CPF</Label>
              <Input id="cpf" placeholder="000.000.000-00" value={cpf}
                onChange={(e) => setCpf(maskCpf(e.target.value))} />
            </div>
            <Button onClick={consultar} disabled={busy || cpf.replace(/\D/g, "").length !== 11}
              size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Search className="mr-2 h-4 w-4" />{modoSimulacao ? "Simular" : "Consultar"}</>}
            </Button>
          </div>

          {modoSimulacao && (
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="sim-nome">Nome completo</Label>
                <Input id="sim-nome" placeholder="Nome do cliente" value={simNome}
                  onChange={(e) => setSimNome(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sim-nasc">Data de nascimento</Label>
                <Input id="sim-nasc" type="date" value={simNascimento}
                  onChange={(e) => setSimNascimento(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sim-score">Score (0–1000)</Label>
                <Input id="sim-score" inputMode="numeric" value={simScore}
                  onChange={(e) => setSimScore(e.target.value.replace(/\D/g, ""))} />
              </div>
              <div className="sm:col-span-2 flex items-end">
                <p className="text-xs text-muted-foreground">
                  Modo de simulação ativo — não consulta a Serasa de verdade.
                </p>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-4 pt-2">
            <div className="flex items-center gap-2">
              <Switch checked={modoSimulacao} onCheckedChange={setModoSimulacao} />
              <Label className="text-sm">Modo simulação</Label>
            </div>
            {isAdmin && (
              <Button variant="ghost" size="sm" onClick={rodarTestesHomologacao} disabled={homologBusy}>
                {homologBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FlaskConical className="mr-2 h-4 w-4" />}
                Rodar testes de homologação Serasa
              </Button>
            )}
          </div>

        </CardContent>
      </Card>

      {/* Resumo dos testes de homologação */}
      {homologResults && (
        <Card className="mt-6 shadow-card overflow-hidden print:hidden">
          <div className="h-1 bg-primary" />
          <CardContent className="p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <FlaskConical className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold">Resumo da homologação Serasa</h2>
              </div>
              <Button variant="ghost" size="sm" onClick={() => window.print()}>
                <Printer className="mr-2 h-4 w-4" />Imprimir
              </Button>
            </div>
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader className="bg-muted/60">
                  <TableRow>
                    <TableHead>CPF</TableHead>
                    <TableHead>Cenário</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead className="text-right">Score</TableHead>
                    <TableHead className="text-right">Pendências</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {homologResults.map((r) => (
                    <TableRow key={r.cpf}>
                      <TableCell className="font-mono text-xs">{maskCpf(r.cpf)}</TableCell>
                      <TableCell className="text-sm">{r.cenario}</TableCell>
                      <TableCell className="text-sm">{r.nome ?? "—"}</TableCell>
                      <TableCell className="text-right font-semibold">
                        {typeof r.score === "number" ? r.score : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {typeof r.totalPendencias === "number" ? (
                          <span>
                            {r.totalPendencias}
                            {r.somaPendencias && r.somaPendencias > 0 ? (
                              <span className="ml-1 text-xs text-muted-foreground">
                                ({brl(r.somaPendencias)})
                              </span>
                            ) : null}
                          </span>
                        ) : "—"}
                      </TableCell>
                      <TableCell>
                        {r.ok ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-500">
                            <CheckCircle2 className="h-3 w-3" />OK
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive" title={r.error}>
                            <XCircle className="h-3 w-3" />Falhou
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {homologResults.some((r) => !r.ok) && (
              <div className="mt-3 space-y-1">
                {homologResults.filter((r) => !r.ok).map((r) => (
                  <p key={r.cpf} className="text-xs text-destructive">
                    <span className="font-mono">{maskCpf(r.cpf)}</span>: {r.error}
                  </p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {result && settings && (
        <>
          <Card className="mt-6 shadow-elegant overflow-hidden">
            <div className={`h-1 ${aprovado ? "bg-emerald-500" : "bg-destructive"}`} />
            <CardContent className="p-6">
              <div className="grid gap-6 md:grid-cols-3">
                <div className="md:col-span-2 flex items-start gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                    <User2 className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Cliente</p>
                    <p className="text-xl font-bold">{result.nome}</p>
                    <p className="text-sm text-muted-foreground">CPF: {maskCpf(result.cpf)}</p>
                  </div>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Score Serasa</p>
                  <div className="mt-1 flex items-baseline gap-2">
                    <p className={`text-4xl font-bold ${aprovado ? "text-emerald-500" : "text-destructive"}`}>{result.score}</p>
                    {aprovado
                      ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-500"><CheckCircle2 className="h-3 w-3" />Aprovado</span>
                      : <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive"><XCircle className="h-3 w-3" />Recusado</span>
                    }
                  </div>
                  <p className="text-xs text-muted-foreground">Mínimo aceito: {settings.min_score}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {bloqueadoPorSegmento && (
            <Card className="mt-6 shadow-card overflow-hidden border-destructive">
              <div className="h-1 bg-destructive" />
              <CardContent className="p-6 flex items-start gap-3">
                <XCircle className="h-5 w-5 text-destructive mt-0.5" />
                <div>
                  <p className="font-semibold text-destructive">Venda bloqueada</p>
                  <p className="text-sm text-muted-foreground">
                    Cliente possui pendência financeira em credor do mesmo segmento (Ótica, Móveis, Eletro, Calçados, Roupa ou Vestuário). Não é permitido realizar venda.
                  </p>
                  <ul className="mt-2 text-xs text-muted-foreground list-disc pl-5">
                    {pendenciasBloqueadoras.map((p, i) => (
                      <li key={i}><span className="font-medium text-foreground">{p.credor}</span> — {brl(p.valor)}</li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Card de pendências (PEFIN/REFIN) */}
          {result.pendencias && result.pendencias.length > 0 ? (
            <Card className="mt-6 shadow-card overflow-hidden">
              <div className="h-1 bg-destructive" />
              <CardContent className="p-6">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-destructive" />
                    <h2 className="text-lg font-semibold">Pendências financeiras</h2>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">{result.totalPendencias} ocorrência(s)</p>
                    <p className="text-base font-bold text-destructive">{brl(result.somaPendencias ?? 0)}</p>
                  </div>
                </div>
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader className="bg-muted/60">
                      <TableRow>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Credor</TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.pendencias.map((p, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{p.tipo}</TableCell>
                          <TableCell>{p.credor}{p.contrato ? <span className="text-muted-foreground"> · {p.contrato}</span> : null}</TableCell>
                          <TableCell className="text-muted-foreground">{p.data ?? "—"}</TableCell>
                          <TableCell className="text-right font-semibold">{brl(p.valor)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="mt-6 shadow-card overflow-hidden">
              <div className="h-1 bg-emerald-500" />
              <CardContent className="p-6 flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                <div>
                  <p className="font-semibold">Sem pendências financeiras</p>
                  <p className="text-sm text-muted-foreground">Não foram localizadas dívidas (PEFIN/REFIN) no Relatório Intermediário PF.</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Histórico de consultas deste CPF */}
          {historico.length > 0 && (
            <Card className="mt-6 shadow-card overflow-hidden">
              <div className="h-1 bg-primary/60" />
              <CardContent className="p-6">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <History className="h-5 w-5 text-primary" />
                    <h2 className="text-lg font-semibold">Histórico de consultas deste CPF</h2>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {historico.length} registro{historico.length === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader className="bg-muted/60">
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Origem</TableHead>
                        <TableHead className="text-right">Score</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {historico.map((h) => {
                        const dt = new Date(h.created_at);
                        const dataStr = dt.toLocaleString("pt-BR", {
                          day: "2-digit", month: "2-digit", year: "numeric",
                          hour: "2-digit", minute: "2-digit",
                        });
                        const statusLabel =
                          h.status === "simulacao" ? "Simulação"
                          : h.status === "cache" ? "Cache (3 meses)"
                          : h.status === "sucesso" ? "Serasa"
                          : h.status;
                        const statusClass =
                          h.status === "simulacao" ? "bg-accent/10 text-accent"
                          : h.status === "cache" ? "bg-muted text-muted-foreground"
                          : "bg-emerald-500/10 text-emerald-500";
                        return (
                          <TableRow key={h.id}>
                            <TableCell className="text-muted-foreground">{dataStr}</TableCell>
                            <TableCell>{h.nome ?? "—"}</TableCell>
                            <TableCell>
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusClass}`}>
                                {statusLabel}
                              </span>
                            </TableCell>
                            <TableCell className="text-right font-semibold">
                              {h.score ?? "—"}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {aprovado && (
            <Card className="mt-6 shadow-card">
              <CardContent className="p-6">
                <div className="mb-4 flex items-center gap-2">
                  <Calculator className="h-5 w-5 text-primary" />
                  <h2 className="text-lg font-semibold">Simulação da venda</h2>
                </div>

                <div className="mt-4 flex items-center justify-between rounded-lg border bg-muted/30 p-3">
                  <div>
                    <p className="text-sm font-medium">Venda sem entrada</p>
                    <p className="text-xs text-muted-foreground">
                      Atalho para zerar a entrada. Também é possível informar qualquer valor abaixo do mínimo — a venda segue, mas exige autorização do administrador para assinar e emitir boletos.
                    </p>
                  </div>
                  <Switch checked={vendaSemEntrada} onCheckedChange={setVendaSemEntrada} />
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="total">Valor da venda (R$)</Label>
                    <Input id="total" inputMode="decimal" value={valorTotal}
                      onChange={(e) => setValorTotal(e.target.value)} placeholder="0,00" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="entrada">
                      Entrada (R$){!vendaSemEntrada && <> — sugerida: <span className="font-semibold text-accent">{brl(sugerida)}</span></>}
                    </Label>
                    <Input id="entrada" inputMode="decimal" value={valorEntrada} disabled={vendaSemEntrada}
                      onChange={(e) => setValorEntrada(e.target.value)} placeholder="0,00" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="entrada-entrega">Entrada na entrega (R$)</Label>
                    <Input id="entrada-entrega" inputMode="decimal" value={valorEntradaEntrega} disabled={vendaSemEntrada}
                      onChange={(e) => setValorEntradaEntrega(e.target.value)} placeholder="0,00" />
                  </div>
                  {entradaAbaixoDoMinimo && (
                    <p className="md:col-span-3 text-xs text-warning">
                      Entrada abaixo do mínimo para este score. A venda pode ser registrada, mas a nota promissória só poderá ser assinada e os boletos emitidos após autorização de um administrador.
                    </p>
                  )}
                </div>

                {total > 0 && financiado > 0 && (
                  <>
                    <div className="mt-6">
                      <Label>Parcelas</Label>
                      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                        {opcoesParcelas.filter((n) => [3, 6, 9, 12, 15].includes(n)).map((n) => {
                          const taxa = taxaScore;
                          const pmt = pricePmt(financiado, taxa, n);
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
                              <p className="font-bold">{brl(pmt)}</p>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {parcelas && (() => {
                      const pmt = pricePmt(financiado, taxaScore, parcelas);
                      const valorPromissoria = entradaEntrega + pmt * parcelas;
                      return (
                        <div className="mt-6 rounded-lg border bg-muted/30 p-4">
                          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
                            <div><p className="text-xs text-muted-foreground">Venda</p><p className="font-semibold">{brl(total)}</p></div>
                            <div><p className="text-xs text-muted-foreground">Entrada</p><p className="font-semibold">{brl(entrada)}</p></div>
                            <div><p className="text-xs text-muted-foreground">Entrada na entrega</p><p className="font-semibold">{brl(entradaEntrega)}</p></div>
                            <div><p className="text-xs text-muted-foreground">Financiado</p><p className="font-semibold">{brl(financiado)}</p></div>
                            <div><p className="text-xs text-muted-foreground">{parcelas}x de</p><p className="font-bold text-accent">{brl(pmt)}</p></div>
                            <div><p className="text-xs text-muted-foreground">Promissória</p><p className="font-bold text-primary">{brl(valorPromissoria)}</p></div>
                          </div>
                        </div>
                      );
                    })()}

                    <div className="mt-6 flex gap-3 print:hidden">
                      <Button onClick={handleRegistrarAprovada} disabled={!parcelas || savingVenda}
                        className="bg-primary hover:bg-primary/90 text-primary-foreground">
                        {savingVenda ? <Loader2 className="h-4 w-4 animate-spin" /> : "Registrar venda aprovada"}
                      </Button>
                      <Button onClick={registrarRecusada} disabled={!parcelas || savingVenda}
                        variant="outline">
                        Marcar como recusada
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}

      <SaleAddressDialog
        open={addressOpen}
        onOpenChange={setAddressOpen}
        onConfirm={confirmarVendaComEndereco}
        clienteNome={result?.nome}
        cidadePadrao={cidadeUsuario || ""}
        empresaPadraoId={empresaId}
        empresasDisponiveis={isAdmin ? empresasDisponiveis : undefined}
      />
    </AppLayout>
  );
}
