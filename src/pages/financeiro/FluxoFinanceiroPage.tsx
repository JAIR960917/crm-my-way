import { useEffect, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Loader2, BarChart3, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";

interface Company { id: string; name: string; }

const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (s?: string) => s ? new Date(s + "T00:00:00").toLocaleDateString("pt-BR") : "—";

function tipoBadge(tipo?: string) {
  if (!tipo) return <Badge variant="outline">—</Badge>;
  const t = tipo.toLowerCase();
  if (t.includes("entrada") || t === "e" || t === "c" || t.includes("recebimento")) {
    return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">{tipo}</Badge>;
  }
  if (t.includes("saida") || t.includes("saída") || t === "s" || t === "d" || t.includes("pagamento")) {
    return <Badge className="bg-red-100 text-red-800 border-red-200">{tipo}</Badge>;
  }
  return <Badge variant="outline">{tipo}</Badge>;
}

function getField(r: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) if (r[k] != null && r[k] !== "") return String(r[k]);
  return "—";
}

export default function FluxoFinanceiroPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(() => {
    const d = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);
    return d.toISOString().slice(0, 10);
  });
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(1);
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: integs } = await supabase.from("ssotica_integrations").select("company_id").eq("is_active", true);
      const ids = new Set((integs || []).map((i: any) => i.company_id));
      const { data } = await supabase.from("companies").select("id, name").order("name");
      const filtered = ((data as Company[]) || []).filter(c => ids.has(c.id));
      setCompanies(filtered);
      if (filtered.length > 0) setCompanyId(filtered[0].id);
    })();
  }, []);

  async function load(p = 1) {
    if (!companyId) return;
    setLoading(true); setWarning(null);
    try {
      const { data, error } = await supabase.functions.invoke("ssotica-financeiro", {
        body: { tipo: "fluxo_caixa", companyId, startDate, endDate, page: p, perPage: 100 },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      if (data.warning) setWarning(data.warning);
      setRows(data.data || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
      setPage(p);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao buscar dados");
    } finally { setLoading(false); }
  }

  const totalEntradas = rows.reduce((s, r) => {
    const tipo = String(r.tipo || r.natureza || "").toLowerCase();
    const isEntrada = tipo.includes("entrada") || tipo === "e" || tipo === "c" || tipo.includes("recebimento");
    return isEntrada ? s + Number(r.valor ?? 0) : s;
  }, 0);

  const totalSaidas = rows.reduce((s, r) => {
    const tipo = String(r.tipo || r.natureza || "").toLowerCase();
    const isSaida = tipo.includes("saida") || tipo.includes("saída") || tipo === "s" || tipo === "d" || tipo.includes("pagamento");
    return isSaida ? s + Number(r.valor ?? 0) : s;
  }, 0);

  const saldo = totalEntradas - totalSaidas;

  return (
    <AppLayout>
      <div className="space-y-6 p-6">
        <div className="flex items-center gap-3">
          <BarChart3 className="h-6 w-6 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold">Fluxo Financeiro</h1>
            <p className="text-sm text-muted-foreground">Movimentações de caixa via SSótica</p>
          </div>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Filtros</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              <Select value={companyId} onValueChange={setCompanyId}>
                <SelectTrigger className="w-56"><SelectValue placeholder="Empresa" /></SelectTrigger>
                <SelectContent>{companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
              <Input type="date" className="w-40" value={startDate} onChange={e => setStartDate(e.target.value)} />
              <Input type="date" className="w-40" value={endDate} onChange={e => setEndDate(e.target.value)} />
              <Button onClick={() => void load(1)} disabled={loading || !companyId}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Buscar
              </Button>
            </div>
          </CardContent>
        </Card>

        {rows.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-4">
            <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Entradas</p><p className="text-2xl font-bold text-emerald-700">{fmtBRL(totalEntradas)}</p></CardContent></Card>
            <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Saídas</p><p className="text-2xl font-bold text-red-700">{fmtBRL(totalSaidas)}</p></CardContent></Card>
            <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Saldo</p><p className={`text-2xl font-bold ${saldo >= 0 ? "text-emerald-700" : "text-red-700"}`}>{fmtBRL(saldo)}</p></CardContent></Card>
            <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Registros</p><p className="text-2xl font-bold">{total}</p></CardContent></Card>
          </div>
        )}

        {warning && <p className="text-sm text-amber-600 bg-amber-50 rounded p-3">{warning}</p>}

        {rows.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Movimentações</CardTitle>
              <CardDescription>{rows.length} registro(s) exibidos</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Saldo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhum registro</TableCell></TableRow>
                    ) : rows.map((r, i) => (
                      <TableRow key={i}>
                        <TableCell>{fmtDate(getField(r, "data", "data_movimento", "data_lancamento"))}</TableCell>
                        <TableCell className="max-w-xs truncate">{getField(r, "descricao", "historico", "complemento")}</TableCell>
                        <TableCell>{tipoBadge(getField(r, "tipo", "natureza", "tipo_lancamento"))}</TableCell>
                        <TableCell className="font-medium">{fmtBRL(Number(r.valor ?? 0))}</TableCell>
                        <TableCell>{r.saldo != null ? fmtBRL(Number(r.saldo)) : "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <span className="text-sm text-muted-foreground">Página {page} de {totalPages}</span>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => void load(page - 1)}><ChevronLeft className="h-4 w-4" /></Button>
                    <Button variant="outline" size="sm" disabled={page >= totalPages || loading} onClick={() => void load(page + 1)}><ChevronRight className="h-4 w-4" /></Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
