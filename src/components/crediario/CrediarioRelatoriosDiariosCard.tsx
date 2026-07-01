import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ClipboardList, Eye, CheckCircle2, RefreshCw } from "lucide-react";
import { brl } from "@/lib/crediarioFinance";
import { toast } from "sonner";

interface Pagamento {
  nome: string;
  cpf: string;
  numero_parcela: number;
  total_parcelas: number;
  valor: number;
  pago_em: string;
}

interface Relatorio {
  id: string;
  data_referencia: string;
  status: string;
  total_pagamentos: number;
  valor_total: number;
  pagamentos: Pagamento[];
  concluido_em: string | null;
  company_id: string | null;
  empresa_nome?: string;
}

function formatDataRef(d: string) {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function formatPagoEm(iso: string) {
  try {
    const d = new Date(iso);
    const data = d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
    const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
    return `${data} ${hora}`;
  } catch { return "—"; }
}

export function CrediarioRelatoriosDiariosCard() {
  const [relatorios, setRelatorios] = useState<Relatorio[]>([]);
  const [loading, setLoading] = useState(true);
  const [aberto, setAberto] = useState<Relatorio | null>(null);
  const [gerando, setGerando] = useState(false);
  const [concluindo, setConcluindo] = useState(false);

  const carregar = async () => {
    setLoading(true);
    const [{ data, error }, { data: comps }] = await Promise.all([
      supabase
        .from("crediario_relatorios_diarios")
        .select("*")
        .order("data_referencia", { ascending: false })
        .limit(20),
      supabase.from("companies").select("id, name"),
    ]);
    if (error) {
      toast.error("Erro ao carregar relatórios", { description: error.message });
    } else {
      const compMap = new Map((comps ?? []).map((c) => [c.id, c.name]));
      const enriched = (data ?? [])
        .filter((r: any) => Number(r.total_pagamentos) > 0)
        .map((r: any) => ({
          ...r,
          empresa_nome: r.company_id ? (compMap.get(r.company_id) ?? "—") : "Todas",
        }));
      setRelatorios(enriched as unknown as Relatorio[]);
    }
    setLoading(false);
  };

  useEffect(() => { carregar(); }, []);

  const gerarAgora = async () => {
    setGerando(true);
    const { data, error } = await supabase.functions.invoke("gerar-relatorio-diario", {
      body: { modo: "pendentes" },
    });
    setGerando(false);
    if (error) { toast.error("Falha ao gerar", { description: error.message }); return; }
    const novos = Number((data as { novos_pagamentos?: number })?.novos_pagamentos ?? 0);
    const msg = (data as { mensagem?: string })?.mensagem;
    if (novos > 0) {
      toast.success(msg ?? `Relatório gerado com ${novos} pagamento(s) novo(s)`);
    } else {
      toast.message(msg ?? "Nenhum boleto pago pendente de inclusão em relatório");
    }
    carregar();
  };

  const concluir = async () => {
    if (!aberto) return;
    setConcluindo(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("crediario_relatorios_diarios")
      .update({
        status: "concluido",
        concluido_em: new Date().toISOString(),
        concluido_por: u.user?.id ?? null,
      })
      .eq("id", aberto.id);
    setConcluindo(false);
    if (error) { toast.error("Erro ao concluir", { description: error.message }); return; }
    toast.success("Relatório marcado como concluído");
    setAberto(null);
    carregar();
  };

  return (
    <>
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ClipboardList className="h-7 w-7 text-primary" />
              <div>
                <h3 className="text-xl font-semibold">Relatório Diário - Boletos Pagos</h3>
                <p className="text-sm text-muted-foreground">Boletos pagos no dia anterior, prontos para baixar no sistema.</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={gerarAgora} disabled={gerando}>
              <RefreshCw className={`mr-2 h-4 w-4 ${gerando ? "animate-spin" : ""}`} />
              Gerar agora
            </Button>
          </div>

          <div className="mt-4">
            {loading ? (
              <p className="text-sm text-muted-foreground">Carregando…</p>
            ) : relatorios.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum relatório ainda. O primeiro será gerado automaticamente amanhã às 06h, ou clique em "Gerar agora".</p>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Empresa</TableHead>
                      <TableHead>Pagamentos</TableHead>
                      <TableHead>Valor total</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {relatorios.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{formatDataRef(r.data_referencia)}</TableCell>
                        <TableCell className="text-muted-foreground">{r.empresa_nome ?? "—"}</TableCell>
                        <TableCell>{r.total_pagamentos}</TableCell>
                        <TableCell>{brl(Number(r.valor_total))}</TableCell>
                        <TableCell>
                          {r.status === "concluido" ? (
                            <Badge className="bg-destructive text-destructive-foreground">Concluído</Badge>
                          ) : (
                            <Badge variant="secondary">Pendente</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="outline" onClick={() => setAberto(r)}>
                            <Eye className="mr-2 h-4 w-4" /> Abrir
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!aberto} onOpenChange={(o) => !o && setAberto(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Relatório de {aberto && formatDataRef(aberto.data_referencia)}
              {aberto?.empresa_nome && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">— {aberto.empresa_nome}</span>
              )}
              {aberto?.status === "concluido" && (
                <Badge className="ml-2 bg-destructive text-destructive-foreground">Concluído</Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          {aberto && (
            <>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-muted-foreground">Total de pagamentos: </span><strong>{aberto.total_pagamentos}</strong></div>
                <div><span className="text-muted-foreground">Valor total: </span><strong>{brl(Number(aberto.valor_total))}</strong></div>
              </div>

              {aberto.pagamentos.length === 0 ? (
                <p className="mt-4 text-sm text-muted-foreground">Nenhum boleto foi pago neste dia.</p>
              ) : (
                <div className="mt-4 rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Cliente</TableHead>
                        <TableHead>CPF</TableHead>
                        <TableHead>Parcela</TableHead>
                        <TableHead>Valor</TableHead>
                        <TableHead>Pago em</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {aberto.pagamentos.map((p, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{p.nome}</TableCell>
                          <TableCell>{p.cpf}</TableCell>
                          <TableCell>{p.numero_parcela}/{p.total_parcelas}</TableCell>
                          <TableCell>{brl(Number(p.valor))}</TableCell>
                          <TableCell>{formatPagoEm(p.pago_em)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              <DialogFooter>
                {aberto.status !== "concluido" ? (
                  <Button onClick={concluir} disabled={concluindo} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Marcar como concluído
                  </Button>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Concluído em {aberto.concluido_em ? new Date(aberto.concluido_em).toLocaleString("pt-BR") : "—"}
                  </p>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
